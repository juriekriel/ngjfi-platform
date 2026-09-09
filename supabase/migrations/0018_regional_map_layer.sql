-- ============================================================================
-- NGJFI platform — regional heat map layer (migration 0018)
--
-- Items 6/8/7's remaining piece: the world map only ever showed individual
-- countries, positioned by a hand-placed pixel grid (TILES in
-- IntelligenceView.tsx) that only covers the ~26 demo countries. That's fine
-- for the sandbox but doesn't scale to a real organisation in a country
-- nobody hand-positioned. Regions (the 11 NXT Move regions, already a column
-- on organisations) don't have that problem — there are only 11 of them, so
-- the map can lay them out generically instead of by hardcoded pixel.
--
-- collab_intelligence() already returned a 'regions' array, but only a single
-- blended index — no per-tier breakdown, so the map's existing tier switcher
-- couldn't drive a regional view the way it already drives the country one.
-- This adds regions[].tiers, the same shape countries[].tiers already has.
--
-- Also closes a real gap while touching this code: regions were NEVER
-- critical-mass gated, unlike countries. A region with one small org in it
-- could be named with a score. Now gated identically.
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
      and o.is_demo = false
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
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
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_gate),
    -- Same gate as countries — a region is only ever named with a score once
    -- ITS OWN n passes the critical-mass threshold, never inherited from the
    -- global total being published.
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
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
-- Demo mirror. Same addition, demo space, no gate (matches how countries
-- already work here — the sandbox is always "on" by design, see 0006/0009).
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
      and o.is_demo = true
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
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
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region),
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
