-- ============================================================================
-- NGJFI platform — fix the collab_intelligence() data contract regression
-- introduced by 0009_data_spaces.sql (migration 0015)
--
-- ROOT CAUSE OF THE "Application error: a client-side exception has occurred"
-- crash on /intelligence and /demo/intelligence:
--
-- 0009 rewrote collab_intelligence() and collab_intelligence_demo() to add the
-- is_demo split (a real and necessary fix — demo data must never contaminate
-- the real global view). Its own comment claims "same return shape, so
-- nothing in the app changes except what it is allowed to see." That was not
-- accurate. Three things changed silently:
--
--   1. The summary object's key changed from 'totals' (0005, and still what
--      src/components/index/IntelligenceView.tsx reads) to 'headline'. The
--      component does `d.totals.responses` with no optional chaining — once
--      `published` data as actually returned, `d.totals` is `undefined` and
--      that line throws a TypeError, which Next.js surfaces as the generic
--      "Application error" screen. /demo/intelligence hits this on every
--      load, because collab_intelligence_demo() has no publish gate at all.
--   2. 'trend' and 'findings' were dropped entirely from both functions —
--      the "Movement over time" and "What the data reveals" sections on
--      /intelligence silently stopped rendering (no crash, just missing).
--   3. 'countries[].tiers' (used to colour the tier-by-tier map) was dropped
--      — only 'country' and 'n' remained, so the map always shows every
--      country as "no data" grey regardless of the selected tier.
--
-- This migration keeps the one thing 0009 needed to add (is_demo filtering)
-- and restores everything 0005 used to return on top of it. No frontend
-- change is required — IntelligenceView.tsx already expects this exact shape.
-- ============================================================================

create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_gate int; v_total bigint; v_publish boolean;
begin
  v_gate    := setting_int('critical_mass_gate', 400);
  v_publish := setting_bool('publish_global_view', false);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  -- Never overclaim. Below the gate there is no global picture to report.
  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'completions', v_total,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0)
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false          -- the line 0009 exists for; kept
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    -- Only geographies past the gate are ever named with a score — same rule
    -- 0009 applied, now carrying per-tier detail so the map can switch tiers.
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Demo mirror. Same restoration, demo space, no publish gate (the sandbox is
-- always "on" by design — see 0006 / 0009).
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true           -- the fiction, aggregated only within itself
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Verify: run against a project with demo data seeded.
--   select public.collab_intelligence_demo() -> 'totals';        -- populated
--   select public.collab_intelligence_demo() -> 'trend';         -- non-null if >1 year of demo data
--   select public.collab_intelligence_demo() -> 'findings';      -- populated
--   select public.collab_intelligence_demo() -> 'countries' -> 0 -> 'tiers'; -- populated
-- ============================================================================
