-- ============================================================================
-- The Jesus Index — Communication in stages (migration 0063, launch readiness)
-- ============================================================================
-- WHY
-- The Collab → Org Administrator emails (0056) were one sequence: setting up
-- and launching a survey. The relationship goes on after that. The board now
-- has four stages, each its own sequence of steps:
--   launch   Launch                       — set up, consent, first survey, pitch documents
--   support  Support and Encouragement    — check in; make asking for help easy
--   reading  Reading your Data            — results, Collab Intelligence, consulting
--   global   Global Perspective           — part of something bigger, with live figures
--
-- WHAT
-- 1. comms_templates.stage (default 'launch' — every existing template is a
--    Launch template). Positions number the steps WITHIN a stage.
-- 2. admin_comms_templates() returns the stage; admin_comms_save_template()
--    takes it. The old six-argument function is dropped first, so a call with
--    named arguments can never be ambiguous (the 0027 overload lesson).
-- 3. admin_comms_global_facts(): the live figures the Global Perspective
--    emails may quote — organisations taking part, the countries THOSE
--    ORGANISATIONS are based in, and one worldwide total of completed
--    surveys. Live space only. No per-country respondent figure, so an email
--    can never say more about a place than the map's critical-mass gate allows.
-- 4. The new templates, seeded once (a re-run never overwrites an edit).
-- 5. Launch step 2 said "about seven minutes"; the survey is about eight (five
--    for the J12-only version). Corrected only where nobody has edited it.
--
-- Everything here is about ADULT STAFF of organisations. No respondent data
-- is read except one count of completed surveys.
-- ============================================================================

alter table public.comms_templates
  add column if not exists stage text not null default 'launch';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comms_templates_stage_check') then
    alter table public.comms_templates
      add constraint comms_templates_stage_check check (stage in ('launch', 'support', 'reading', 'global'));
  end if;
end $$;


create or replace function public.admin_comms_templates()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', t.key, 'title', t.title, 'subject', t.subject, 'body', t.body,
             'kind', t.kind, 'position', t.position, 'stage', t.stage, 'updated_at', t.updated_at,
             'updated_by', (select coalesce(u.full_name, u.email) from app_users u where u.id = t.updated_by))
           order by array_position(array['launch','support','reading','global'], t.stage),
                    (t.kind = 'update'), t.position nulls last, t.title)
      from comms_templates t
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_comms_templates() to authenticated;


drop function if exists public.admin_comms_save_template(text, text, text, text, text, int);

create or replace function public.admin_comms_save_template(
  p_key text, p_title text, p_subject text, p_body text,
  p_kind text default 'update', p_position int default null, p_stage text default null
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
  if p_stage is not null and p_stage not in ('launch', 'support', 'reading', 'global') then
    raise exception 'stage must be launch, support, reading or global';
  end if;

  insert into comms_templates (key, title, subject, body, kind, position, stage, updated_at, updated_by)
  values (v_key, btrim(p_title), btrim(p_subject), p_body, p_kind,
          case when p_kind = 'sequence' then p_position end, coalesce(p_stage, 'launch'), now(), auth.uid())
  on conflict (key) do update
     set title = excluded.title, subject = excluded.subject, body = excluded.body,
         kind = excluded.kind, position = excluded.position,
         -- Saving without a stage keeps the template where it is.
         stage = coalesce(p_stage, comms_templates.stage),
         updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'key', v_key);
end;
$$;
grant execute on function public.admin_comms_save_template(text, text, text, text, text, int, text) to authenticated;


create or replace function public.admin_comms_global_facts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_platform_admin();
  return jsonb_build_object(
    'org_count', (select count(*) from organisations o where not o.is_demo and o.status = 'active'),
    'countries', coalesce((
       select jsonb_agg(c order by c)
         from (select distinct btrim(o.country) c
                 from organisations o
                where not o.is_demo and o.status = 'active' and nullif(btrim(o.country), '') is not null) x
     ), '[]'::jsonb),
    'completion_count', (
       select count(*)
         from sessions s
         join campaigns c on c.id = s.campaign_id
         join organisations o on o.id = c.org_id
        where not o.is_demo and s.completed),
    'checked_at', now()
  );
end;
$$;
revoke all on function public.admin_comms_global_facts() from public;
grant execute on function public.admin_comms_global_facts() to authenticated;


-- Launch step 2: the survey length, where nobody has edited the seeded text.
update public.comms_templates
   set body = replace(body, 'It takes about seven minutes on a phone',
                      'It takes about eight minutes on a phone (about five for the J12-only version)')
 where key = 'step_2_first_survey' and updated_by is null
   and body like '%It takes about seven minutes on a phone%';


insert into public.comms_templates (key, title, subject, body, kind, position, stage) values

-- ── Launch ──────────────────────────────────────────────────────────────────
('launch_pitch_docs', 'Share it with your team: the pitch documents',
 'Bring your team along — the Jesus Index in three documents',
$t$Hi {{first_name}},

Most ministries don't run the Index alone. A pastor, a board, volunteers or a partner usually want to understand it first. We've made that easy.

Three documents, ready to download, print or forward: {{pitch_docs_url}}

- **The leadership pitch** — why a shared measure, how it works, and the promises it keeps. For your senior leaders or board.
- **The two-pager** — what the Index is and what a young person answers. For anyone who asks "what is this?"
- **The pitch and demo guide** — how to walk someone through it in ten minutes, step by step.

Two more places that help people see it for themselves:

- The full pitch, online: {{pitch_url}}
- See a Demo, with a fictional ministry, organisation and church and every figure invented: {{demo_url}}

If someone on your team has a question we haven't answered, just reply. We'd love to help.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 7, 'launch'),

-- ── Support and Encouragement ──────────────────────────────────────────────
('support_check_in', 'Checking in — how is it going?',
 'How is the Jesus Index going for {{org_name}}?',
$t$Hi {{first_name}},

A quick check-in from the Jesus Index team. How is it going for {{org_name}}?

Whatever stage you're at, if anything is unclear or stuck, we'd genuinely like to help. Just reply to this email — a real person reads it. People most often ask us about:

- **Getting set up** — your logo, colour and welcome message, or adding a colleague: {{team_url}}
- **Consent** — what to gather, especially for 13–17s, and how to confirm it: {{consent_url}}
- **Sending a survey** — test links, a link for each camp or group, printing a QR code: {{dashboard_url}}
- **Reading results** — what a number means and what to do about it: {{consult_url}}

A two-minute walkthrough of your dashboard is here any time: {{tour_url}}

No question is too small. Asking early saves a lot of time later.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 1, 'support'),

('support_encouragement', 'Keep going — what you are doing matters',
 'Keep going, {{first_name}} — this matters',
$t$Hi {{first_name}},

We wanted to say thank you. Taking time to ask young people how they are really following Jesus — not just whether they turned up — is not a small thing. You're helping {{org_name}} see what God is doing, and where the next step is.

A few things that help other ministries get more young people through the survey:

- **Give it time in the room.** Ten minutes at the start of a youth night beats "do it later" every time.
- **Say why.** Tell them it's anonymous, that nobody sees their answers, and that it helps you serve them better.
- **One link per moment.** A camp, a youth night and a small group each get their own link, so you can see each one: {{dashboard_url}}
- **Let them skip.** Every young person can skip a question or stop; that's part of what makes the answers honest.

If response is slower than you hoped, or something isn't working the way you expected, reply and tell us. We'll think it through with you.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 2, 'support'),

-- ── Reading your Data ──────────────────────────────────────────────────────
('reading_your_results', 'Reading your data',
 'Reading the {{org_name}} results',
$t$Hi {{first_name}},

Your dashboard is where {{org_name}}'s results live: {{dashboard_url}}

A few things to know as you read it:

- **Every number is about those who have completed the Index** — never your whole ministry or community. The number of people behind each score sits right beside it.
- **Small groups stay private.** A score appears once 10 people have completed the Index, so no number can point back to one young person.
- **Read the matrix as a journey.** Left to right is depth — Exposure, Response, Formation, Multiplication. Where a row narrows is where young people are getting stuck.
- **Two pictures, never mixed.** Those following Jesus feed the J12; those not yet following answer their own questions, shown separately.

Then look wider. **Collab Intelligence** shows the pooled picture across every ministry taking part, so you can see where {{org_name}} is like everyone else and where it's different: {{intelligence_url}}

Comparisons for a place open only once enough people there have completed the Index, so some views stay grey for a while. That's the Index being honest, not empty.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 1, 'reading'),

('reading_consulting', 'From a score to a strategy — consulting',
 'What should {{org_name}} do with these results?',
$t$Hi {{first_name}},

A score is only useful if it changes what you do next.

That's what the **"What does this mean?"** button on your dashboard is for. Ask anything about the view you're looking at — "why is Mission lower than Follow?", "what do we do about Formation?", "is this normal for a church our size?" — and it goes to a Collab facilitator with that view attached:

{{consult_url}}

A facilitator will come back to you to help turn what you see into a plan: one or two things to change this season, and how you'll know next year whether they worked.

Before you ask, it can help to look at Collab Intelligence, so you know how {{org_name}} compares with the pooled picture: {{intelligence_url}}

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 2, 'reading'),

-- ── Global Perspective ─────────────────────────────────────────────────────
('global_something_bigger', 'You are part of something bigger',
 '{{org_name}} is one of {{org_count}} organisations in the Jesus Index',
$t$Hi {{first_name}},

When {{org_name}} runs the Jesus Index, you're not doing it alone.

Right now **{{org_count}} organisations** in **{{country_count}} countries** are taking part: {{country_list}}.

Together, young people have completed the Index **{{completion_count}} times** so far. Every one of those answers stays anonymous, and every finding is about those who have completed the Index — never a whole country or community.

That's the point of a shared measure. Each ministry sees its own young people clearly. Together, we start to see what none of us could see alone: where young people are meeting Jesus, where the journey narrows, and what helps them go deeper — on the road to every young person having a real opportunity to follow Jesus by 2033.

The pooled picture grows here: {{intelligence_url}}

Thank you for being part of it.

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 1, 'global'),

('global_invite_peers', 'Bring the ministries around you',
 'Who else should be in the picture with {{org_name}}?',
$t$Hi {{first_name}},

Comparisons for a place switch on only once enough young people there have completed the Index — 400 for a city or area, 2,000 for a country. Until then, the map stays grey. Honestly.

The fastest way to get there is the ministries you already know. Today **{{org_count}} organisations** in **{{country_count}} countries** are taking part. Every church, school ministry or network that joins near you brings your area closer to comparisons you can all use.

It's free for every ministry, and it stays free. If you know someone who should be in the picture, send them here: {{site_url}}/join

And if you'd like to share why you're doing it, the pitch documents are ready to forward: {{pitch_docs_url}}

{{sender_name}}
The Jesus Index · jfindx.org$t$,
 'sequence', 2, 'global')

on conflict (key) do nothing;
