-- ============================================================================
-- The Jesus Index — tiered critical-mass gate: country vs. everything else
-- (migration 0020)
--
-- CLAUDE.md §3 non-negotiable #1 was updated: the critical-mass gate is now
-- explicitly TIERED by geography level, not one global number.
--
--   City/area level  — the existing gate, critical_mass_gate (400). Applies
--                       to naming an organisation, a region, or the platform
--                       as a whole (the "is there enough here to say anything
--                       at all" check already in collab_intelligence()).
--   Country level     — a SEPARATE, higher threshold. A country view only
--                       activates once that country's respondents reach
--                       country_critical_mass_gate (2000). Below that, the
--                       country stays hidden exactly like any other
--                       under-threshold geography — even if individual orgs
--                       or the org's region inside it have independently
--                       cleared their own, smaller gate. Each level is
--                       checked independently; clearing one says nothing
--                       about the other.
--
-- Before this migration, every call site reused critical_mass_gate (400) for
-- countries too — collab_intelligence()'s countries[] array, and
-- org_benchmark()'s country baseline. A country with as few as 400
-- respondents (plausibly one or two active orgs) could be named on
-- /intelligence and in an org's own benchmark comparison. That is exactly
-- the small-town-style over-disclosure risk the non-negotiable now calls out
-- explicitly, one level up: a country is a bigger bucket than a city, but a
-- handful of concentrated orgs can still make 400 respondents in one country
-- functionally identify which two or three organisations they came from.
--
-- Deliberately NOT touched:
--   * collab_intelligence_demo() — synthetic data is never gated by either
--     threshold, matching the platform's existing convention that the demo
--     space illustrates what the product looks like at scale rather than
--     enforcing real-world disclosure limits on invented respondents.
--   * regions[] — a region (11 NXT Move regions) is coarser than a country,
--     not finer, so it stays on critical_mass_gate (400), unchanged.
--   * the platform-wide "is anything published yet" check in
--     collab_intelligence() (v_total < v_gate) — that gates whether the page
--     shows anything at all, not whether one specific country is named.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The new setting. Versioned config, per non-negotiable #3 — not a
-- constant baked into a function body.
-- ----------------------------------------------------------------------------
insert into platform_settings (key, value, note)
values (
  'country_critical_mass_gate',
  '2000'::jsonb,
  'Completed responses required from a single country before that country may be named with a score anywhere on the platform (collab_intelligence() countries[], org_benchmark()''s country baseline). Separate from and higher than critical_mass_gate (400), which continues to govern organisations, regions, and the platform-wide publish check. Clearing this says nothing about whether any city/org inside the country has cleared its own, smaller gate, or vice versa — the two levels are checked independently.'
)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. collab_intelligence(): countries[] now gated on the country threshold,
-- not the general one. Everything else (regions[], the top-level publish
-- check, funnel/domains/matrix/by_age/trend) is unchanged from 0019.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb; v_gate int; v_country_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
begin
  v_gate         := setting_int('critical_mass_gate', 400);
  v_country_gate := setting_int('country_critical_mass_gate', 2000);
  v_publish      := setting_bool('publish_global_view', false);
  v_min_group_n  := setting_int('min_group_n', 10);

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
      'country_gate', v_country_gate,
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
    'country_gate', v_country_gate,
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
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    -- COUNTRY: gated on v_country_gate (2000), not v_gate. A country with
    -- 400-1999 respondents now shows in totals.countries (it's counted) but
    -- is never named with a score in this array until it independently
    -- clears the higher bar.
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_country_gate),
    -- REGION: unchanged, still v_gate (400) — coarser than a country, not finer.
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
-- 3. org_benchmark(): the country baseline now needs v_country_gate (2000)
-- respondents from that country (excluding the requesting org's own, as
-- before), not the general 400. The global baseline is unchanged — it is not
-- "a geography" being named, it is the whole live population, and stays
-- behind the existing publish_global_view + critical_mass_gate pairing.
-- ----------------------------------------------------------------------------
create or replace function public.org_benchmark(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_gate int;
  v_country_gate int;
  v_publish_global boolean;
  v_country_n bigint;
  v_country_tiers jsonb;
  v_country_index numeric;
  v_global_n bigint;
  v_global_tiers jsonb;
  v_global_index numeric;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_gate           := setting_int('critical_mass_gate', 400);
  v_country_gate   := setting_int('country_critical_mass_gate', 2000);
  v_publish_global := setting_bool('publish_global_view', false);

  -- Country baseline: same country, live space, every org except this one.
  if v_org.country is not null then
    with country_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.country = v_org.country
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from country_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from country_r group by tier) t)
    into v_country_n, v_country_tiers;
  end if;

  if v_country_n >= v_country_gate then
    select round(avg(value::numeric),1) into v_country_index
    from jsonb_each_text(coalesce(v_country_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_country_tiers := null;
  end if;

  -- Global baseline: every country, live space, every org except this one —
  -- gated on BOTH the critical-mass count and the separate publish_global_view
  -- switch, matching collab_intelligence()'s own public-facing gate. A number
  -- not fit to publish on /intelligence should not reach an org privately either.
  if v_publish_global then
    with global_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from global_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from global_r group by tier) t)
    into v_global_n, v_global_tiers;
  end if;

  if v_global_n >= v_gate then
    select round(avg(value::numeric),1) into v_global_index
    from jsonb_each_text(coalesce(v_global_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_global_tiers := null;
  end if;

  return jsonb_build_object(
    'gate', v_gate,
    'country', jsonb_build_object(
      'geography', v_org.country,
      'available', v_country_n >= v_country_gate,
      'gate', v_country_gate,
      'n', coalesce(v_country_n, 0),
      'index', v_country_index,
      'tiers', v_country_tiers
    ),
    'global', jsonb_build_object(
      'available', v_publish_global and v_global_n >= v_gate,
      'n', coalesce(v_global_n, 0),
      'index', v_global_index,
      'tiers', v_global_tiers
    )
  );
end;
$$;

grant execute on function public.org_benchmark(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. data_space_report(): surface the new threshold alongside the existing
-- one so the admin console (and anyone auditing settings) sees both tiers,
-- not just one.
-- ----------------------------------------------------------------------------
create or replace function public.data_space_report()
returns jsonb
language sql security definer set search_path = public as $$
  with per as (
    select o.is_demo,
           count(distinct o.id)  as orgs,
           count(distinct s.id)  as sessions,
           count(rsp.id)         as responses
      from organisations o
      left join campaigns c on c.org_id = o.id
      left join sessions  s on s.campaign_id = c.id
      left join responses rsp on rsp.session_id = s.id
     group by o.is_demo
  )
  select jsonb_build_object(
    'live', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = false), jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'demo', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = true),  jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'gate', setting_int('critical_mass_gate', 400),
    'country_gate', setting_int('country_critical_mass_gate', 2000),
    'global_view_published', setting_bool('publish_global_view', false),
    'checked_at', now()
  );
$$;

grant execute on function public.data_space_report() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. collab_worklist(): the same inconsistency, caught by the same review.
-- This is the Collab-facing worklist ("Norway is 140 completions from its
-- first benchmark") — it is entirely ABOUT which countries are closing in on
-- a nameable benchmark, so it must use country_critical_mass_gate, not the
-- general 400. Left as 400, it would tell an admin a country is "done" at a
-- count the platform will then refuse to actually publish on /intelligence —
-- the worklist and the publish gate silently disagreeing with each other.
--
-- The returned 'gate' key keeps its name (no frontend change needed — Console
-- reads it generically as "the gate this worklist is about") but now carries
-- the country value. org/region readiness has no equivalent worklist item
-- today; if one is added later it should return its own key rather than
-- overload this one.
-- ----------------------------------------------------------------------------
create or replace function public.collab_worklist()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_gate int; v_c bigint;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  v_gate := setting_int('country_critical_mass_gate', 2000);

  -- Coverage, not volume. The same sixty organisations spread across forty
  -- countries unlocks nothing; concentrated in ten it unlocks all ten. So the
  -- worklist ranks by who is CLOSEST to a benchmark, not by who has the most.
  v_items := (
    select coalesce(jsonb_agg(jsonb_build_object(
             'urgency', 'high',
             'label', x.country || ' is ' || (v_gate - x.completions)
                      || ' completions from its first benchmark',
             'meta', x.completions || ' / ' || v_gate,
             'action', 'See who can close it')
           order by x.completions desc), '[]'::jsonb)
      from (
        select s.country, count(*) as completions
          from sessions s
          join campaigns c on c.id = s.campaign_id
          join organisations o on o.id = c.org_id
         where s.completed and o.is_demo = false and s.country is not null
         group by s.country
        having count(*) < v_gate
      ) x
  );

  select count(*) into v_c
    from organisations o
   where o.is_demo = false
     and not exists (select 1 from campaigns c where c.org_id = o.id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high',
      'label', v_c || ' organisation' || case when v_c = 1 then '' else 's' end
        || ' joined and never fielded', 'action', 'Nudge');
  end if;

  return jsonb_build_object(
    'gate',  v_gate,
    'waves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', w.short_name, 'name', w.name, 'item_set', w.item_set,
               'audiences', w.audiences, 'opens_on', w.opens_on, 'closes_on', w.closes_on,
               'adopted', (select count(*) from wave_adoptions a where a.wave_id = w.id))
             order by w.created_at desc)
        from waves w where w.is_demo = false), '[]'::jsonb),
    'items', v_items
  );
end;
$$;

grant execute on function public.collab_worklist() to authenticated;
