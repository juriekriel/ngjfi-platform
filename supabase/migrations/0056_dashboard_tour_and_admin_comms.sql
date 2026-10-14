-- ============================================================================
-- The Jesus Index — first-visit dashboard walkthrough + Collab comms to
-- Org Administrators (migration 0056)
--
--   1. org_members.tour_state / tour_completed_at
--        The step-by-step walkthrough an organisation member sees the first
--        time they open their dashboard. Kept per person per organisation, so
--        it shows once on any device and a Coordinator added later gets their
--        own first visit.
--        my_dashboard_tour(slug) · mark_dashboard_tour(slug, 'done'|'skipped')
--
--   2. comms_templates — the emails the Collab sends Org Administrators.
--        'sequence' templates are the onboarding steps, in order; 'update'
--        templates are one-off announcements. Editable from the console
--        (Administrator → E · Comms), seeded here with the six steps.
--
--   3. comms_sends — what was sent, to whom, for which organisation, by whom.
--        It is what the sequence board reads to show each person's NEXT step.
--
--   4. Admin-only functions (every one checks my_role() = 'admin' first):
--        admin_comms_templates() · admin_comms_save_template(...) ·
--        admin_comms_delete_template(key) · admin_comms_recipients(...) ·
--        admin_comms_log(rows) · admin_comms_history(limit) ·
--        admin_comms_set_name(email, name)
--
-- The audience is never a stored list: admin_comms_recipients() reads the
-- Org Administrators that exist at the moment of sending (active members with
-- role 'org_admin', plus outstanding 'org_admin' invitations), so everyone
-- added since the last send is included automatically.
--
-- Everything here is about ADULT STAFF of organisations (a work email, an
-- optional name, the organisation they run). Nothing touches respondents,
-- sessions or responses, and no function here returns a single number about
-- anyone's results. The email itself is sent by the server route
-- /api/admin/comms (Resend), which calls these functions AS the signed-in
-- administrator — no service-role key is involved.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The first-visit walkthrough.
-- ----------------------------------------------------------------------------
alter table public.org_members
  add column if not exists tour_state text,
  add column if not exists tour_completed_at timestamptz;

alter table public.org_members drop constraint if exists org_members_tour_state_check;
alter table public.org_members
  add constraint org_members_tour_state_check check (tour_state is null or tour_state in ('done', 'skipped'));

comment on column public.org_members.tour_state is
  'First-visit dashboard walkthrough: null = not seen yet (show it), done = finished, skipped = closed early. Replayable any time from the dashboard (?tour=1).';

-- Should this person see the walkthrough on this organisation's dashboard?
-- Members only: an administrator stepping into someone else's dashboard is
-- not "activating" it, so they are never shown it automatically.
create or replace function public.my_dashboard_tour(p_org_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; m org_members%rowtype;
begin
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null then return jsonb_build_object('show', false, 'member', false); end if;

  select * into m from org_members where org_id = v_org and user_id = auth.uid() and status = 'active';
  if not found then return jsonb_build_object('show', false, 'member', false); end if;

  return jsonb_build_object(
    'show', m.tour_state is null,
    'member', true,
    'role', m.role,
    'state', m.tour_state,
    'completed_at', m.tour_completed_at
  );
end;
$$;
grant execute on function public.my_dashboard_tour(text) to authenticated;

create or replace function public.mark_dashboard_tour(p_org_slug text, p_state text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_n int;
begin
  if p_state not in ('done', 'skipped') then raise exception 'state must be done or skipped'; end if;
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;

  update org_members
     set tour_state = p_state,
         -- "done" wins over "skipped": finishing a replay after skipping once counts.
         tour_completed_at = case when p_state = 'done' then now() else tour_completed_at end
   where org_id = v_org and user_id = auth.uid() and status = 'active'
     and (tour_state is distinct from 'done' or p_state = 'done');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$$;
grant execute on function public.mark_dashboard_tour(text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Templates.
-- ----------------------------------------------------------------------------
create table if not exists public.comms_templates (
  key         text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  title       text not null check (length(btrim(title)) between 1 and 120),
  subject     text not null check (length(btrim(subject)) between 1 and 200),
  body        text not null check (length(body) between 1 and 20000),
  kind        text not null default 'update' check (kind in ('sequence', 'update')),
  position    int,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.comms_templates enable row level security;
-- No policies on purpose: read and written only through the admin_* functions below.


-- ----------------------------------------------------------------------------
-- 3. The send log.
-- ----------------------------------------------------------------------------
create table if not exists public.comms_sends (
  id              uuid primary key default gen_random_uuid(),
  template_key    text,               -- null for a one-off written from blank
  subject         text not null,
  recipient_email citext not null,
  org_id          uuid references public.organisations(id) on delete set null,
  org_name        text,               -- kept as sent, so history still reads after a rename or a deletion
  mode            text not null check (mode in ('single', 'broadcast')),
  status          text not null check (status in ('sent', 'failed')),
  provider_id     text,
  error           text,
  sent_by         uuid references auth.users(id) on delete set null,
  sent_at         timestamptz not null default now()
);

alter table public.comms_sends enable row level security;
-- No policies on purpose: admins only, through the functions below.

create index if not exists idx_comms_sends_recipient on public.comms_sends(recipient_email, org_id, template_key) where status = 'sent';
create index if not exists idx_comms_sends_sent_at on public.comms_sends(sent_at desc);

-- A name to greet an invited person by, before they have ever signed in.
alter table public.org_invites add column if not exists full_name text;


-- ----------------------------------------------------------------------------
-- 4. Admin functions.
-- ----------------------------------------------------------------------------
create or replace function public._require_platform_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or my_role() <> 'admin' then
    raise exception 'only an administrator can use comms';
  end if;
end;
$$;
revoke all on function public._require_platform_admin() from public, anon, authenticated;


create or replace function public.admin_comms_templates()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', t.key, 'title', t.title, 'subject', t.subject, 'body', t.body,
             'kind', t.kind, 'position', t.position, 'updated_at', t.updated_at,
             'updated_by', (select coalesce(u.full_name, u.email) from app_users u where u.id = t.updated_by))
           order by (t.kind = 'update'), t.position nulls last, t.title)
      from comms_templates t
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_comms_templates() to authenticated;


create or replace function public.admin_comms_save_template(
  p_key text, p_title text, p_subject text, p_body text,
  p_kind text default 'update', p_position int default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text := lower(btrim(coalesce(p_key, '')));
begin
  perform _require_platform_admin();
  if v_key = '' then
    -- A new template: derive a key from its title.
    v_key := left(regexp_replace(lower(btrim(coalesce(p_title, ''))), '[^a-z0-9]+', '_', 'g'), 50);
    v_key := btrim(v_key, '_');
    if length(v_key) < 2 then v_key := 'update'; end if;
    if exists (select 1 from comms_templates where key = v_key) then
      v_key := v_key || '_' || to_char(now(), 'YYYYMMDDHH24MISS');
    end if;
  end if;
  if p_kind not in ('sequence', 'update') then raise exception 'kind must be sequence or update'; end if;

  insert into comms_templates (key, title, subject, body, kind, position, updated_at, updated_by)
  values (v_key, btrim(p_title), btrim(p_subject), p_body, p_kind, case when p_kind = 'sequence' then p_position end, now(), auth.uid())
  on conflict (key) do update
     set title = excluded.title, subject = excluded.subject, body = excluded.body,
         kind = excluded.kind, position = excluded.position,
         updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'key', v_key);
end;
$$;
grant execute on function public.admin_comms_save_template(text, text, text, text, text, int) to authenticated;


-- Only one-off updates can be deleted; the sequence steps are the board's columns.
create or replace function public.admin_comms_delete_template(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _require_platform_admin();
  delete from comms_templates where key = p_key and kind = 'update';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'only a one-off update template can be deleted'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_comms_delete_template(text) to authenticated;


-- Every Org Administrator right now — one row per person per organisation —
-- with what each has already been sent. Closed organisations are left out;
-- the sandbox (is_demo) only when asked for; outstanding invitations unless
-- asked not to. p_email narrows to one address (the composer's look-up).
create or replace function public.admin_comms_recipients(
  p_include_sandbox boolean default false,
  p_include_invited boolean default true,
  p_email text default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform _require_platform_admin();
  return coalesce((
    with people as (
      select lower(u.email) as email, u.full_name as name, o.id as org_id, o.name as org_name,
             o.slug as org_slug, o.status as org_status, o.is_demo, 'member'::text as source
        from org_members m
        join organisations o on o.id = m.org_id
        join app_users u on u.id = m.user_id
       where m.role = 'org_admin' and m.status = 'active' and u.email is not null
      union all
      select lower(i.email::text), i.full_name, o.id, o.name, o.slug, o.status, o.is_demo, 'invite'
        from org_invites i
        join organisations o on o.id = i.org_id
       where i.role = 'org_admin' and i.accepted_at is null and p_include_invited
         -- an invitation that has since become a membership is already listed above
         and not exists (
           select 1 from org_members m join app_users u on u.id = m.user_id
            where m.org_id = i.org_id and lower(u.email) = lower(i.email::text) and m.status = 'active'
         )
    ), picked as (
      select distinct on (p.email, p.org_id) p.*
        from people p
       where p.org_status <> 'closed'
         and (p_include_sandbox or not p.is_demo)
         and (v_email is null or p.email = v_email)
       order by p.email, p.org_id, (p.source = 'member') desc
    )
    select jsonb_agg(jsonb_build_object(
             'email', p.email, 'name', p.name, 'org_id', p.org_id, 'org_name', p.org_name,
             'org_slug', p.org_slug, 'org_status', p.org_status, 'is_demo', p.is_demo,
             'source', p.source,
             'sent', coalesce((
               select jsonb_object_agg(s.template_key, s.last_at)
                 from (select template_key, max(sent_at) as last_at
                         from comms_sends
                        where status = 'sent' and template_key is not null
                          and lower(recipient_email::text) = p.email and org_id = p.org_id
                        group by template_key) s
             ), '{}'::jsonb))
           order by p.org_name, p.email)
      from picked p
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_comms_recipients(boolean, boolean, text) to authenticated;


-- Record what the server route sent. Only a known Org Administrator for that
-- organisation can be logged against it, so the log cannot be filled with
-- addresses that were never part of the audience.
create or replace function public.admin_comms_log(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_n int := 0; v_org uuid; v_email text;
begin
  perform _require_platform_admin();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'at most 1000 rows at a time'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(btrim(r->>'email'));
    v_org := nullif(r->>'org_id', '')::uuid;
    if not exists (
      select 1 from org_members m join app_users u on u.id = m.user_id
       where m.org_id = v_org and lower(u.email) = v_email and m.role = 'org_admin'
      union all
      select 1 from org_invites i where i.org_id = v_org and lower(i.email::text) = v_email and i.role = 'org_admin'
    ) then
      raise exception '% is not an Org Administrator of that organisation', v_email;
    end if;
    insert into comms_sends (template_key, subject, recipient_email, org_id, org_name, mode, status, provider_id, error, sent_by)
    values (
      nullif(r->>'template_key', ''),
      left(coalesce(r->>'subject', ''), 300),
      v_email,
      v_org,
      (select name from organisations where id = v_org),
      coalesce(r->>'mode', 'single'),
      coalesce(r->>'status', 'sent'),
      left(r->>'provider_id', 200),
      left(r->>'error', 1000),
      auth.uid()
    );
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'logged', v_n);
end;
$$;
grant execute on function public.admin_comms_log(jsonb) to authenticated;


create or replace function public.admin_comms_history(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_platform_admin();
  return coalesce((
    select jsonb_agg(x order by (x->>'sent_at') desc)
      from (
        select jsonb_build_object(
                 'id', s.id, 'template_key', s.template_key,
                 'template_title', (select t.title from comms_templates t where t.key = s.template_key),
                 'subject', s.subject, 'email', s.recipient_email, 'org_name', s.org_name,
                 'mode', s.mode, 'status', s.status, 'error', s.error, 'sent_at', s.sent_at,
                 'sent_by', (select coalesce(u.full_name, u.email) from app_users u where u.id = s.sent_by)) as x
          from comms_sends s
         order by s.sent_at desc
         limit greatest(1, least(coalesce(p_limit, 100), 500))
      ) h
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_comms_history(int) to authenticated;


-- Save the name an administrator typed, so the next email greets them by it.
create or replace function public.admin_comms_set_name(p_email text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  perform _require_platform_admin();
  if v_name is not null and length(v_name) > 120 then raise exception 'that name is too long'; end if;
  update app_users set full_name = v_name where lower(email) = v_email;
  update org_invites set full_name = v_name where lower(email::text) = v_email;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_comms_set_name(text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. The six onboarding steps. Seeded once; edited from the console after
-- that (a re-run of this migration never overwrites an edit).
-- ----------------------------------------------------------------------------
insert into public.comms_templates (key, title, subject, body, kind, position) values
('step_1_dashboard', 'How to get started — understanding your dashboard',
 'Getting started with your {{org_name}} dashboard',
$t$Hi {{first_name}},

Welcome — {{org_name}} is on the Jesus Index. Your dashboard is ready, and it's yours: your brand, your links, your results.

Sign in with your ministry email here: {{dashboard_url}}

The first time you open it, a short walkthrough shows you around (about two minutes). You can replay it any time: {{tour_url}}

Three things worth knowing from day one:

- **The house and its rooms.** The house is every response from every {{org_name}} link. Each link you send — a camp, a youth night, a small group — is its own room, and every room rolls up into the house.
- **The J12 matrix.** Three questions (Follow, Mission, World) across four tiers (Exposure, Response, Formation, Multiplication). Read it left to right as depth: how far the journey has gone.
- **Aggregates only.** You'll never see an individual answer — nobody can. A score appears once enough young people have completed the Index, so no number can point back to one person.

Next up: sending your first survey. I'll send you the how-to shortly — or jump ahead and press "+ Start a new survey" on your dashboard.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 1),

('step_2_first_survey', 'Sending your first survey',
 'Send your first {{org_name}} survey',
$t$Hi {{first_name}},

Ready to hear from your young people? Here's the shortest path to your first real responses.

1. **Try it yourself first.** On your dashboard press "+ Start a new survey" and tick Test. Answers on a test link never count anywhere and are deleted after a week, so click through it as often as you like.
2. **Confirm consent.** A link won't accept answers until consent is confirmed — for {{org_name}}, and for the survey you're sending. (Next email is all about this.)
3. **Make a link for each moment.** One link per camp, event or group gives you a room for each — and they all add up in your house.
4. **Share it.** Copy the link or print the QR code. It takes about seven minutes on a phone, works on a weak signal, and nobody needs an account.

Your survey's home link: {{survey_url}}
Your dashboard: {{dashboard_url}}

Tip: give people the time in the room to do it — completion is far higher than "do it later".

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 2),

('step_3_consent', 'How do I work on consent?',
 'Consent for {{org_name}}: what you do, and what the Index never holds',
$t$Hi {{first_name}},

Consent is the step that protects your young people, so we've made it impossible to skip — and as simple as we can.

**Consent happens with you, not with us.** You know your young people, their families and your country's rules. You gather consent (including a parent's or guardian's for under-18s, where the law in your country asks for it); the Index never holds consent forms, names or contact details.

It works at two levels:

- **For {{org_name}} as a whole** — once, under "Edit your dashboard": {{settings_url}}
- **For each survey you send** — press "Confirm consent" on that survey's card on your dashboard.

No consent, no participation: a link stays closed until both are confirmed. Under-13s are thanked and leave at the age question, and nothing about them is kept.

Our consent resource has plain-language guidance and country notes for 21 countries: {{consent_url}}

Not sure what applies where you are? Just reply to this email and we'll help you work it out.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 3),

('step_4_results', 'Understanding my results',
 'Your {{org_name}} results — and what to do with them',
$t$Hi {{first_name}},

Once enough young people have completed the Index, {{org_name}}'s results appear on your dashboard: {{dashboard_url}}

How to read them:

- **The J12 index** is your overall score, on a 1–5 scale, with the number of people behind it right beside it.
- **The matrix** shows where the journey is strong and where it narrows — across Follow, Mission and World, from Exposure to Multiplication.
- **Overlay the Collab** to compare your house with the pooled picture across the NextGen Global Collab.
- **Rooms** show each link on its own, so you can see what a camp did differently from a weekly group.

Every number is about those who completed the Index — never your whole community.

**A score is only useful if it changes what you do next.** That's what the "What does this mean?" button on your dashboard is for. Ask anything — "why is Mission lower than Follow?", "what do we do about Formation?" — and the Collab team will come back to you with help turning it into strategy:

{{consult_url}}

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 4),

('step_5_yearly_rhythm', 'Building a yearly rhythm',
 'A yearly rhythm for {{org_name}}',
$t$Hi {{first_name}},

One reading tells you where you are. A reading every year tells you whether what you're doing is working — that's when the Index becomes a strategy tool.

Your dashboard groups responses into seasons (a year, starting 1 June by default), so you can pick any season and compare it with the last.

A simple rhythm that works for most ministries:

1. **Plan** — choose your survey window and the moments you'll use (camp, a youth night, small groups). Confirm consent.
2. **Run** — the same window each year, so this year compares fairly with last year. A link per moment.
3. **Review** — sit down with your team around the matrix. Where did it grow? Where did it narrow?
4. **Act** — choose one or two things to change. Ask "What does this mean?" if you'd like help.
5. **Repeat** — next season, look for the shift.

Put next year's window in the calendar now — it's the easiest step to forget.

Your dashboard: {{dashboard_url}}

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 5),

('step_6_about_collab', 'Who is the NextGen Global Collab, and why did they build the Index?',
 'Why the Index exists — and why {{org_name}} matters to it',
$t$Hi {{first_name}},

A little about who's behind the Index, and why {{org_name}} being part of it matters.

The **NextGen Global Collab** is a coalition of 30+ ministries around the world with one shared goal: that every young person aged 13–30 has a real opportunity to follow Jesus by 2033.

A goal like that needs a way to know whether we're getting there. A single global research study would have been slow, expensive and far from the young people it measures. So the Collab chose a different path: one shared, simple measure that any ministry — down to a single local church — can run for itself, for free.

Every ministry sees its own results instantly. Together, the anonymised results build a picture none of us could build alone — where young people are encountering Jesus, where the journey narrows, and what helps them go deeper. A country only appears in that shared picture once enough young people there have taken part, so nothing is ever overclaimed.

So every survey {{org_name}} runs does two things: it helps you lead well, and it helps the whole movement see more clearly.

Thank you for being part of it.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 6)
on conflict (key) do nothing;
