-- ============================================================================
-- The Jesus Index — Drivers & Journey reporting (migration 0021)
--
-- CLAUDE.md non-negotiables #6 and #9: Drivers and Journey are unscored
-- ("insight layers") but they are still respondent data, and they were being
-- collected (instrument v3, PR #21/#23) with nowhere to see them — not on the
-- org dashboard, not on Collab Intelligence. This closes that gap:
--
--   #6 — "report them as aggregate option-selection rates only, never tied
--        to an individual, and gate them behind the same critical-mass rule
--        as scores."
--   #9 — "reported alongside the Index, not folded into it by default."
--
-- One new function, insight_aggregates(), computes option-selection rates
-- for every item tagged question_domain in ('drivers','journey'), scoped
-- either to one org or to a whole live/demo population. It is added as a new
-- top-level 'insights' key on org_dashboard(), collab_intelligence() and
-- collab_intelligence_demo() — never merged into 'tiers', 'domains', 'matrix'
-- or 'index', which stay exactly as they were. Non-negotiable #9 in the
-- database itself, not just convention: those three functions never read
-- question_domain in ('drivers','journey') anywhere in their score
-- computation, and this migration doesn't add any.
--
-- WHY OPTION COUNTS, NOT MEANS: Drivers/Journey items are multi_select
-- (respondents pick 0..N of a fixed list) — there is no numeric "mean" to a
-- set of choices, so the only honest aggregate is "what share of respondents
-- picked each option", per item, never per respondent.
--
-- PRIVACY: same floor as everywhere else. insight_aggregates() takes
-- min_group_n and, per item, returns n always (so "we asked this of N
-- people" is never hidden) but 'options' only once that item's own n clears
-- the floor — an item with fewer respondents than the floor (plausible here
-- specifically because Drivers/Journey sit behind an extra opt-in step,
-- continue_to_extras, so their n can be smaller than the org's overall
-- completions) shows n and nothing else, exactly like org_dashboard()'s
-- existing organisation-level suppression.
--
-- SCOPE, deliberately: org_dashboard_demo() (the signed-out /demo/dashboard
-- preview) is NOT touched here. It was already stale before this PR — it
-- never picked up 0019's min_group_n floor or the count(distinct session)
-- fix, and it computes trend inline instead of via blended_trend(). Bolting
-- insights onto it would mean reconciling all of that first, which is a
-- separate, pre-existing gap and not part of this change. The signed-out
-- demo preview will not show a Drivers/Journey panel until that's done.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. insight_aggregates(): the shared helper. Not granted to anon/authenticated
-- — same posture as blended_trend() — it takes a raw org_id with no
-- authorisation check of its own; that check belongs to whichever caller
-- decided p_org_id was allowed, and callers reach it as their own
-- (already security-definer) role.
-- ----------------------------------------------------------------------------
create or replace function public.insight_aggregates(
  p_org_id uuid, p_is_demo boolean, p_min_group_n int
)
returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (
    select rsp.item_key, rsp.raw_value, s.id as sid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.question_domain in ('drivers', 'journey')
      and o.is_demo = p_is_demo
      and (p_org_id is null or o.id = p_org_id)
  ),
  -- n per item = respondents who reached and submitted it, even with an
  -- empty selection ("none of these") — same "n is always real" principle
  -- as org_dashboard()'s own suppression.
  item_n as (
    select item_key, count(distinct sid) as n from r group by item_key
  ),
  -- One row per (item, selected option, respondent). Defensive typeof guard:
  -- these items are multi_select today (a JSON array), but question_domain
  -- is versioned config, not a type guarantee — a future single_select or
  -- open_text item tagged into these domains must degrade to zero option
  -- rows rather than throw, since jsonb_array_elements_text errors on a
  -- non-array scalar.
  opt_counts as (
    select r.item_key, opt.value as option_value, count(distinct r.sid) as n
    from r,
      jsonb_array_elements_text(
        case when jsonb_typeof(r.raw_value) = 'array' then r.raw_value else '[]'::jsonb end
      ) as opt(value)
    group by r.item_key, opt.value
  )
  select coalesce(jsonb_object_agg(
    item_n.item_key,
    jsonb_build_object(
      'n', item_n.n,
      'options', case when item_n.n >= p_min_group_n
        then coalesce(
          (select jsonb_object_agg(oc.option_value, oc.n) from opt_counts oc where oc.item_key = item_n.item_key),
          '{}'::jsonb
        )
        else null end
    )
  ), '{}'::jsonb)
  from item_n;
$$;

-- ----------------------------------------------------------------------------
-- 2. org_dashboard(): add 'insights'. Below the org's own min_group_n floor,
-- everything is already suppressed (including, now, insights); above it,
-- insight_aggregates() applies its own per-item floor on top, since an
-- individual Drivers/Journey item's n can be smaller than the org's overall
-- completions (continue_to_extras is an opt-in step, not everyone who
-- finishes the Index says yes to the extras).
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb;
  v_n bigint; v_min_group_n int;
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
  )
  select count(distinct sid) into v_n from r;

  -- Below the floor: n is real and always shown ("of those who completed the
  -- Index" needs it to mean something) -- everything derived from it is not.
  if v_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', false,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. collab_intelligence(): add 'insights', gated the same way the rest of
-- the page is — the early "not published yet" stub gets an empty object;
-- the real computation only runs once the platform-wide publish gate has
-- already passed, on top of which insight_aggregates() applies its own
-- per-item min_group_n floor.
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
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0),
      'insights',  '{}'::jsonb
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
    ),
    'insights', insight_aggregates(null, false, v_min_group_n)
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. collab_intelligence_demo(): add 'insights'. No publish/critical-mass
-- gate here at all, matching every other field this function already
-- returns — synthetic data has never been gated, by existing convention
-- (see migration 0020). insight_aggregates()'s own min_group_n floor still
-- applies, since the demo data's per-item n can genuinely vary.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_min_group_n int;
begin
  v_min_group_n := setting_int('min_group_n', 10);

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
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, true),
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
    ),
    'insights', insight_aggregates(null, true, v_min_group_n)
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;
