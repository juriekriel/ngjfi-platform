-- ============================================================================
-- The Jesus Index — platform totals, org dashboard season picker, and the
-- consulting-question feature (migration 0030)
--
-- Three independent, additive pieces for this PR. Nothing here touches an
-- existing function's signature or behaviour — org_dashboard(),
-- collab_intelligence() and every other 0029 body are untouched.
--
--   1. platform_totals()        — ungated public counter for the homepage.
--   2. org_seasons() /
--      org_dashboard_season()   — a full season picker for the org dashboard.
--   3. consulting_questions +
--      submit_consulting_question() /
--      list_consulting_questions() — "what do we do with this?" repository.
-- ============================================================================


-- ============================================================================
-- 1. platform_totals() — ungated public counter for the homepage.
--
-- A bare count of live organisations-with-at-least-one-response and live
-- responses. Deliberately NOT gated behind the critical-mass check that
-- guards every SCORE on the platform (collab_intelligence(), org_benchmark()):
-- CLAUDE.md non-negotiable #1 is "never overclaim" about a BENCHMARK — a raw
-- headcount carries no score, no tier, no domain and no geography breakdown,
-- so it is not the thing that gate protects. Mirrors the existing is_demo
-- split pattern (0009): explicit `o.is_demo = false`, enforced inside the
-- SECURITY DEFINER body, not left to the caller.
--
-- "responses" counts distinct completed-response SESSIONS, matching this
-- repo's existing vocabulary for that word everywhere a totals object is
-- returned (collab_intelligence()'s totals.responses, admin_org_detail()'s
-- responses) — never a raw response-row count, which would silently read as
-- a much bigger, more confusing number than "how many people took the Index".
--
-- Returns: jsonb { "orgs": int, "responses": int }
-- ----------------------------------------------------------------------------
create or replace function public.platform_totals()
returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (
    select s.id as sid, c.org_id
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
  )
  select jsonb_build_object(
    'orgs',      (select count(distinct org_id) from r),
    'responses', (select count(distinct sid) from r)
  );
$$;

comment on function public.platform_totals() is
  'Ungated public counter for the marketing homepage: live org count + live response count only. No score, no benchmark, so it is exempt from the critical-mass gate that guards collab_intelligence()/org_benchmark() — see CLAUDE.md non-negotiable #1.';

grant execute on function public.platform_totals() to anon, authenticated;


-- ============================================================================
-- 2. Season picker — org_seasons() + org_dashboard_season()
--
-- The season boundary is VERSIONED CONFIG (CLAUDE.md "never hardcode"), not a
-- June-1 constant baked into function logic. Reuses the existing generic
-- key-value config table, platform_settings (introduced in 0009 for exactly
-- this purpose — the critical-mass gate is already stored the same way), so
-- no new config table is created. One new row:
--   ('season_boundary', '{"month": 6, "day": 1}')
-- Editable by an administrator without a deploy, the same as every other
-- platform_settings row.
--
-- A "season" is a rolling window starting on (season_boundary.month,
-- season_boundary.day) of some year Y and ending the day before the same
-- date in year Y+1 — e.g. with the default boundary, season 2025 runs
-- 2025-06-01 .. 2026-05-31 and is labelled "2025–2026". Which years exist is
-- never hardcoded: org_seasons() derives them from the org's own response
-- timestamps.
--
-- Both functions use sessions.created_at as the respondent-completion
-- timestamp for bucketing — the same column blended_trend() (0029) already
-- reads for its own year-based bucketing, and the column org_dashboard()'s
-- own `r` CTE already selects (s.created_at) for exactly this kind of use.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2a. season_boundary config row. `on conflict do nothing` so re-running this
-- migration (or a fresh bootstrap that already seeded it) is a no-op.
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('season_boundary', '{"month": 6, "day": 1}'::jsonb,
   'Month/day a "season" starts on for the org dashboard season picker (default: Jun 1, so a season reads like a school year, e.g. 2025-06-01..2026-05-31 = "2025-2026"). Data, not a hardcoded constant in org_seasons()/org_dashboard_season() — move it without a deploy.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2b. org_seasons(p_org_slug) — every season the org has at least one live
-- response in, most recent first, plus a leading "All time" pseudo-entry.
-- Same authorisation contract as org_dashboard()/org_distribution_links():
-- an active member of the org only.
--
-- Returns: jsonb array of
--   { "label": text, "start": date|null, "end": date|null, "n": int }
-- ----------------------------------------------------------------------------
create or replace function public.org_seasons(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_boundary jsonb;
  v_month int;
  v_day int;
  v_total bigint;
  v_seasons jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_boundary := coalesce((select value from platform_settings where key = 'season_boundary'), '{"month":6,"day":1}'::jsonb);
  v_month := coalesce((v_boundary->>'month')::int, 6);
  v_day   := coalesce((v_boundary->>'day')::int, 1);

  with r as (
    select distinct s.id as sid, s.created_at
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  ),
  bucketed as (
    select sid,
           -- Which season-year a session's completion timestamp falls in:
           -- on/after this year's boundary date -> this year; before it ->
           -- the previous year's season (which started the prior boundary
           -- date and is still running).
           case when ROW(extract(month from created_at)::int, extract(day from created_at)::int)
                     >= ROW(v_month, v_day)
                then extract(year from created_at)::int
                else extract(year from created_at)::int - 1
           end as season_year
    from r
  ),
  per_season as (
    select season_year, count(*) as n
    from bucketed
    group by season_year
  )
  select jsonb_agg(
           jsonb_build_object(
             'label', season_year::text || '–' || (season_year + 1)::text,
             'start', make_date(season_year, v_month, v_day),
             'end',   make_date(season_year + 1, v_month, v_day) - 1,
             'n', n
           ) order by season_year desc
         )
    into v_seasons
    from per_season;

  select count(*) into v_total from r;

  return jsonb_build_array(
           jsonb_build_object('label', 'All time', 'start', null, 'end', null, 'n', v_total)
         ) || coalesce(v_seasons, '[]'::jsonb);
end;
$$;

comment on function public.org_seasons(text) is
  'Every season (rolling window from platform_settings.season_boundary) the org has at least one live response in, most recent first, prefixed with an "All time" pseudo-entry. Drives the org dashboard season-picker dropdown.';

grant execute on function public.org_seasons(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2c. org_dashboard_season(p_org_slug, p_season_start, p_season_end) — same
-- output shape/contract as org_dashboard() (0029), with an optional date
-- range applied on sessions.created_at. When both bounds are null this is
-- behaviourally identical to org_dashboard() (the "All time" case), so the
-- frontend can call this one function for every entry in org_seasons().
--
-- Structurally a straight copy of org_dashboard()'s body (0029) with one
-- addition: `v_season_filter` (a boolean built once from the two params) is
-- ANDed into each of the four response-selecting CTEs. blended_trend() and
-- insight_aggregates() are left calling with the org's full history, exactly
-- as org_dashboard() does — those are their own already-time-aware views
-- (the year-by-year trend, and the insight thresholds), not the season-cut
-- headline this function adds.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_season(
  p_org_slug text,
  p_season_start date default null,
  p_season_end date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb; result2 jsonb;
  v_n bigint; v_explore_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select count(distinct sid) into v_n from r;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select count(distinct sid) into v_explore_n from re;

  if v_n < v_min_group_n and v_explore_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'season', jsonb_build_object('start', p_season_start, 'end', p_season_end),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'scale', 5,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb,
      'exploration_n', v_explore_n, 'exploration_suppressed', true,
      'exploration_index', null, 'exploration_tiers', '{}'::jsonb,
      'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'season', jsonb_build_object('start', p_season_start, 'end', p_season_end),
    'n', v_n,
    'suppressed', v_n < v_min_group_n,
    'scale', 5,
    'tiers',   case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t) end,
    'domains', case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d) end,
    'matrix',  case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y) end,
    'items',   case when v_n < v_min_group_n then '[]'::jsonb else
               (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z) end,
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  if v_n >= v_min_group_n then
    result := result || jsonb_build_object('index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('index', null);
  end if;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select jsonb_build_object(
    'exploration_n', v_explore_n,
    'exploration_suppressed', v_explore_n < v_min_group_n,
    'exploration_tiers',   case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t) end,
    'exploration_domains', case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d) end,
    'exploration_matrix',  case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                  group by question_domain) y) end
  ) into result2;

  result := result || result2;

  if v_explore_n >= v_min_group_n then
    result := result || jsonb_build_object('exploration_index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('exploration_index', null);
  end if;

  return result;
end;
$$;

comment on function public.org_dashboard_season(text, date, date) is
  'Same contract as org_dashboard(), with an optional [p_season_start, p_season_end] filter on sessions.created_at. Both null = identical to org_dashboard() (the "All time" case) — the frontend can call this one function for every org_seasons() entry.';

grant execute on function public.org_dashboard_season(text, date, date) to authenticated;


-- ============================================================================
-- 3. Consulting-question feature — "what do we do with this?"
--
-- A free-text question an org submits from its dashboard, landing in a
-- repository the Collab/admin can review. Aggregate-adjacent staff tooling,
-- not a score — no individual response is exposed either way, but this is
-- still org-identified free text, so writes require an authenticated,
-- active org member (mirrors upsert_distribution_link(), 0028) and the
-- review list requires staff tier (mirrors admin_org_detail(), 0028).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 3a. consulting_questions. No direct client SELECT/INSERT policies — every
-- read and write goes through the SECURITY DEFINER RPCs below, matching this
-- repo's existing convention for every org- or respondent-scoped table
-- (distribution_links, sessions, responses, scores).
-- ----------------------------------------------------------------------------
create table if not exists public.consulting_questions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  prompt     text not null,
  created_at timestamptz not null default now()
);

alter table public.consulting_questions enable row level security;

revoke all on public.consulting_questions from anon, authenticated;

create index if not exists idx_consulting_questions_org on public.consulting_questions(org_id);

-- ----------------------------------------------------------------------------
-- 3b. submit_consulting_question(p_org_slug, p_prompt) — an authenticated,
-- active org member asks "what do we do with this?" from their own
-- dashboard. Same org-slug lookup + org_members authorisation check as
-- upsert_distribution_link() (0028). Anonymous respondents can never call
-- this (it is not part of the respondent survey path, and is granted to
-- `authenticated` only, not `anon`).
-- ----------------------------------------------------------------------------
create or replace function public.submit_consulting_question(p_org_slug text, p_prompt text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; v_id uuid; v_prompt text;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_prompt := trim(p_prompt);
  if v_prompt is null or length(v_prompt) = 0 then
    raise exception 'a question is required';
  end if;
  if length(v_prompt) > 4000 then
    raise exception 'question is too long';
  end if;

  insert into consulting_questions (org_id, prompt)
  values (v_org.id, v_prompt)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.submit_consulting_question(text, text) is
  'Org dashboard "what do we do with this?" submission. Inserts one consulting_questions row for the calling user''s own org. Requires an authenticated, active org member — see org_members check.';

grant execute on function public.submit_consulting_question(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3c. list_consulting_questions() — the Collab/admin-facing repository view.
-- Staff tooling, not an org-scoped endpoint: gated with the same my_role()
-- check admin_org_detail() (0028) uses for its own staff-only surface, not
-- the org_members check above. Granted to `authenticated` only (matching
-- every other my_role()-gated RPC in this schema) — the my_role() check
-- inside the body is the actual admission control; the admin console's own
-- existing role-check pattern (redirecting a non-admin/collab session away
-- from /build) should additionally apply on the frontend, same as it does
-- for admin_org_detail() and admin_worklist().
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
      'created_at', q.created_at
    ) order by q.created_at desc)
    from consulting_questions q
    join organisations o on o.id = q.org_id
  ), '[]'::jsonb);
end;
$$;

comment on function public.list_consulting_questions() is
  'Staff-facing consulting-question repository: every question, with org name and date asked, newest first. Administrator/Collab tier only (my_role()) — mirrors admin_org_detail() (0028).';

grant execute on function public.list_consulting_questions() to authenticated;
