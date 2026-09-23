-- ============================================================================
-- The Jesus Index — signed-in two-dashboard view (migration 0033)
--
-- Backs the locked "two tabs" design (an org's own dashboard + Collab
-- Intelligence, identical in shape; see the Organisation console preview):
--
--   1. room_min_n            — a per-room minimum-n, as versioned config.
--   2. org_link_dashboard()  — a room's own J12 (matrix / tiers / index).
--   3. org_reach_countries() — which countries an org's links reached, for
--                              the heat map outline. Countries only, gated.
--   4. consulting_questions  — gains context / status / assignee / requester,
--                              so "What does this mean?" requests can be
--                              worked from the Collab console's new tile E.
--   5. submit_consulting_question() — takes the view snapshot (p_context).
--   6. list_consulting_questions()  — returns the new fields.
--   7. update_consulting_question() — Collab/admin move a request along.
--
-- Nothing here exposes an individual response. Every read is an aggregate
-- behind a minimum-n; the consulting context is a description of the
-- aggregate VIEW the asker was looking at, never data about a respondent.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. room_min_n. 0028 shipped rooms with counts only, because the per-room
-- privacy floor was an open research question. This sets a working value —
-- 10, the same floor an organisation's own score already holds to
-- (min_group_n) — as a platform_settings row, so researchers can raise it
-- without a deploy. PROPOSED, NOT RESEARCHER-SIGNED-OFF: see the PR notes.
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('room_min_n', '10'::jsonb,
   'Minimum completions before a distribution link ("room") shows any score. Working value = min_group_n; proposed Sept 2026, pending researcher sign-off. Below it a room shows its count only.')
on conflict (key) do nothing;


-- ----------------------------------------------------------------------------
-- 2. org_link_dashboard(p_org_slug, p_link_id) — one room's J12.
--
-- Same authorisation contract as org_dashboard_season(): an active member of
-- the org only. The link must belong to that org. Deliberately returns NO
-- benchmark, NO per-item table and NO insights: "compare to the Collab" is
-- house-level only (CLAUDE.md), and a room is small enough that per-item
-- rows would be the first thing to become identifying.
-- ----------------------------------------------------------------------------
create or replace function public.org_link_dashboard(p_org_slug text, p_link_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_link public.distribution_links%rowtype;
  v_min int;
  v_n bigint;
  result jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  select * into v_link from distribution_links where id = p_link_id and org_id = v_org.id;
  if not found then raise exception 'link not found'; end if;

  v_min := setting_int('room_min_n', setting_int('min_group_n', 10));

  select count(distinct s.id) into v_n
    from sessions s
    join responses rsp on rsp.session_id = s.id
   where s.distribution_link_id = v_link.id
     and rsp.normalized is not null
     and (rsp.branch is distinct from 'unengaged');

  if v_n < v_min then
    return jsonb_build_object(
      'link', jsonb_build_object('id', v_link.id, 'name', v_link.name, 'slug', v_link.slug),
      'n', v_n, 'suppressed', true, 'min_n', v_min, 'scale', 5,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized
    from responses rsp
    join sessions s on s.id = rsp.session_id
    where s.distribution_link_id = v_link.id
      and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
  )
  select jsonb_build_object(
    'link', jsonb_build_object('id', v_link.id, 'name', v_link.name, 'slug', v_link.slug),
    'n', v_n, 'suppressed', false, 'min_n', v_min, 'scale', 5,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric), 1) from jsonb_each_text(coalesce(result->'tiers', '{}'::jsonb))
      where key in ('exposure', 'response', 'formation', 'multiplication')));

  return result;
end;
$$;

comment on function public.org_link_dashboard(text, uuid) is
  'One distribution link''s ("room''s") J12: n, tiers, domains, matrix, index. Active org members only; suppressed below room_min_n. Never returns a benchmark — Collab comparison is house-level only.';

grant execute on function public.org_link_dashboard(text, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. org_reach_countries(p_org_slug) — the countries an org's respondents
-- reported, for outlining on the heat map ("your links reached here").
-- Country names only — no counts, no cities, no scores — and only countries
-- where this org has at least min_group_n completions, so a single young
-- person in an unusual country is never singled out by an outline.
-- ----------------------------------------------------------------------------
create or replace function public.org_reach_countries(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; v_min int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min := setting_int('min_group_n', 10);

  return coalesce((
    select jsonb_agg(country order by country) from (
      select s.country
        from sessions s
        join campaigns c on c.id = s.campaign_id
       where c.org_id = v_org.id and s.completed and s.country is not null
       group by s.country
      having count(*) >= v_min
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.org_reach_countries(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. consulting_questions gains what the Collab needs to work a request.
--    context      — the aggregate view the asker was on (see 5). Never
--                   respondent data.
--    status       — new → assigned → answered.
--    assigned_to  — free text: the facilitator taking it (an adult staff
--                   member, named by the Collab).
--    requested_by — the signed-in org member who asked, so a facilitator can
--                   reply. Adult staff, not a respondent. The email is read
--                   from app_users at list time, never copied into this row.
-- ----------------------------------------------------------------------------
alter table public.consulting_questions
  add column if not exists context      jsonb not null default '{}'::jsonb,
  add column if not exists status       text  not null default 'new',
  add column if not exists assigned_to  text,
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at   timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'consulting_questions_status_check') then
    alter table public.consulting_questions
      add constraint consulting_questions_status_check check (status in ('new', 'assigned', 'answered'));
  end if;
end $$;

create index if not exists idx_consulting_questions_status on public.consulting_questions(status, created_at desc);


-- ----------------------------------------------------------------------------
-- 5. submit_consulting_question(): one new optional trailing param,
-- p_context. Explicit drop of the 2-arg version first — a changed signature
-- without one leaves a silent second overload (the 0027 bug).
--
-- The context is whitelisted, not trusted: only these keys survive, each
-- coerced to short text, so a client cannot smuggle anything else (let alone
-- respondent rows) into the Collab's queue.
-- ----------------------------------------------------------------------------
drop function if exists public.submit_consulting_question(text, text);

create or replace function public.submit_consulting_question(
  p_org_slug text,
  p_prompt   text,
  p_context  jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_prompt text := trim(coalesce(p_prompt, ''));
  v_ctx jsonb := '{}'::jsonb;
  v_key text;
  v_id uuid;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  if length(v_prompt) = 0 then raise exception 'question is required'; end if;
  if length(v_prompt) > 4000 then raise exception 'question is too long'; end if;

  if p_context is not null and jsonb_typeof(p_context) = 'object' then
    foreach v_key in array array['tab', 'scope', 'room', 'view', 'tier', 'overlay', 'summary'] loop
      if p_context ? v_key and jsonb_typeof(p_context->v_key) in ('string', 'boolean', 'number') then
        v_ctx := v_ctx || jsonb_build_object(v_key, left(p_context->>v_key, 200));
      end if;
    end loop;
  end if;

  insert into consulting_questions (org_id, prompt, context, requested_by)
  values (v_org.id, v_prompt, v_ctx, v_uid)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.submit_consulting_question(text, text, jsonb) is
  '"What does this mean?" — an active org member sends a question plus a whitelisted description of the aggregate view they were on (tab, scope, room, view, tier, overlay, summary). Never carries respondent data.';

grant execute on function public.submit_consulting_question(text, text, jsonb) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. list_consulting_questions() — the Collab console's tile E. Same
-- Collab/admin-only guard as 0030; now returns status, assignee, context and
-- the asker's email (so a facilitator can reply). New requests first.
-- ----------------------------------------------------------------------------
create or replace function public.list_consulting_questions()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'the consulting question repository is for administrators and the Collab';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'org', jsonb_build_object('slug', o.slug, 'short_name', o.short_name, 'name', o.name),
      'prompt', q.prompt,
      'context', q.context,
      'status', q.status,
      'assigned_to', q.assigned_to,
      'requested_by', (select u.email from app_users u where u.id = q.requested_by),
      'created_at', q.created_at,
      'updated_at', q.updated_at
    ) order by (q.status = 'new') desc, q.created_at desc)
    from consulting_questions q
    join organisations o on o.id = q.org_id
    where o.is_demo = false
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_consulting_questions() to authenticated;


-- ----------------------------------------------------------------------------
-- 7. update_consulting_question() — Collab/admin move a request along.
-- Assigning someone moves a new request to 'assigned' unless a status is
-- given explicitly.
-- ----------------------------------------------------------------------------
create or replace function public.update_consulting_question(
  p_id uuid,
  p_status text default null,
  p_assigned_to text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.consulting_questions%rowtype;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'only administrators and the Collab can update consulting requests';
  end if;
  if p_status is not null and p_status not in ('new', 'assigned', 'answered') then
    raise exception 'status must be new, assigned or answered';
  end if;

  update consulting_questions q
     set assigned_to = coalesce(nullif(trim(p_assigned_to), ''), q.assigned_to),
         status = coalesce(p_status,
                           case when nullif(trim(p_assigned_to), '') is not null and q.status = 'new'
                                then 'assigned' else q.status end),
         updated_at = now()
   where q.id = p_id
  returning * into v_row;

  if not found then raise exception 'request not found'; end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'assigned_to', v_row.assigned_to);
end;
$$;

grant execute on function public.update_consulting_question(uuid, text, text) to authenticated;
