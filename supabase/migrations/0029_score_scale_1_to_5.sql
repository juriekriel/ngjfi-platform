-- ============================================================================
-- The Jesus Index — report scores on a 1–5 scale, not 0–100 (migration 0029)
--
-- Every scored item in the live instrument (instrument.v4.json) is a
-- likert_5 item, so "1–5" is not a rebrand of the same number — it is the
-- actual raw Likert mean of what respondents answered. A tier/domain/matrix
-- cell of "3.4" now means "the average answer across these items was a 3.4
-- on a 1–5 scale," which a researcher or ministry leader can read without
-- translation, the way "62.3 out of 100" never quite could.
--
-- What did NOT change, on purpose:
--   - ngjfi_normalize() and responses.normalized stay exactly as they were:
--     every response is still stored normalised to 0–100 internally. This
--     is deliberate, not an oversight — it is the one common scale that can
--     absorb yes_no/frequency items too if the instrument ever adds scored
--     ones (today it has none), it keeps every already-stored response
--     re-scorable without a backfill, and it keeps retained_aggregates
--     (the purge-and-archive table) internally consistent with freshly
--     computed live figures, so blended_trend() can keep blending them
--     together exactly as before.
--   - Every internal aggregation (avg(), the correlation in
--     findings.formation_corr/formation_mult_r2, the n-weighted blend in
--     blended_trend()) is computed on that same internal 0–100 figures,
--     completely unchanged. Correlation is scale-invariant under a linear
--     transform anyway, so formation_mult_r2/formation_corr need no change
--     at all.
--
-- What DID change: every function below that used to hand a 0–100 number to
-- a client now converts it to 1–5 at the exact point it becomes an output
-- value, via the new ngjfi_to_5() helper. Anywhere a number is DERIVED from
-- an already-converted value inside the same function (e.g. "index" is the
-- mean of four already-converted tier scores; a region's "index" is the
-- mean of its already-converted tier object) needed NO code change — the
-- transform is linear, so the mean of converted values equals the
-- converted mean, and that identity is relied on deliberately throughout
-- this migration rather than converting the same number twice.
--
-- SCORING_VERSION bumps from v0.1.0 to v0.2.0: the scoring MATH is
-- identical (same items, same weights, same aggregation), but what the
-- number returned to a client means changed, which is exactly the kind of
-- fact a report generated before vs. after this migration needs to be able
-- to tell apart. src/lib/scoring.ts gets the identical version bump.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. The single conversion point. new = 1 + (old / 100) * 4, rounded to one
-- decimal — the inverse of likert_5's own (v-1)/4*100 normalisation, so for
-- every currently-scored item this is exactly the raw Likert mean, not an
-- approximation of it.
-- ----------------------------------------------------------------------------
create or replace function public.ngjfi_to_5(p_v numeric)
returns numeric
language sql immutable as $$
  select case when p_v is null then null else round(1 + (p_v / 100.0) * 4, 1) end;
$$;

comment on function public.ngjfi_to_5(numeric) is
  'Converts an internal 0-100 normalised mean to the 1-5 scale every client-facing score is now reported on. Null-safe. Inverse of the likert_5 branch of ngjfi_normalize().';

-- ----------------------------------------------------------------------------
-- 1. org_dashboard() — tiers/domains/matrix/items and their exploration
-- twins are leaf outputs, converted. index/exploration_index are derived
-- from the (now-converted) tiers objects — unchanged, correct for free.
-- Structurally identical to migration 0026's version otherwise.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
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
  )
  select count(distinct sid) into v_n from r;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
  )
  select count(distinct sid) into v_explore_n from re;

  if v_n < v_min_group_n and v_explore_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
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
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
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

grant execute on function public.org_dashboard(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. org_dashboard_demo() — same treatment, structurally identical to 0023.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_demo(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype; result jsonb;
  v_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if not coalesce(v_org.is_demo, false) then
    raise exception 'demo preview is only available for demo organisations';
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

  if v_n < v_min_group_n then
    return jsonb_build_object(
      'demo', true,
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'scale', 5,
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
    'demo', true,
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', false,
    'scale', 5,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n
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

grant execute on function public.org_dashboard_demo(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. collab_intelligence() — funnel/domains/matrix/by_age/country+region
-- tiers/exploration_* are leaf outputs, converted. regions[].index is
-- derived from an already-converted tiers object — unchanged. mult_top/
-- mult_bottom ARE converted (they're displayed directly), which means the
-- formation_mult_r2/formation_corr/org_means (f, mm) intermediates stay on
-- the raw 0-100 scale throughout (untouched — correlation is scale
-- invariant, so this is correct either way), and the client-side ratio that
-- reads mult_top/mult_bottom needs its own fix — see IntelligenceView.tsx.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb; result2 jsonb; v_gate int; v_country_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
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
      'scale', 5,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0),
      'insights',  '{}'::jsonb,
      'exploration_n', 0, 'exploration_index', null,
      'exploration_funnel', '{}'::jsonb, 'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
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
      and (rsp.branch is distinct from 'unengaged')
  ),
  ctry_tier as (
    select country, tier, ngjfi_to_5(avg(normalized)) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, ngjfi_to_5(avg(normalized)) m from r where region is not null group by region, tier
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
    'scale', 5,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_country_gate),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, false, v_min_group_n)
  ) into result;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id as sid, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', (select count(distinct sid) from re),
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                  group by question_domain) y)
  ) into result2;

  result := result || result2;

  result := result || jsonb_build_object(
    'exploration_index',
    case when (result->>'exploration_n')::bigint >= v_min_group_n
      then (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_funnel','{}'::jsonb))
              where key in ('exposure','response','formation','multiplication'))
      else null
    end
  );

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. collab_intelligence_demo() — same treatment as #3, is_demo = true.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; result2 jsonb; v_min_group_n int;
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
      and (rsp.branch is distinct from 'unengaged')
  ),
  ctry_tier as (
    select country, tier, ngjfi_to_5(avg(normalized)) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, ngjfi_to_5(avg(normalized)) m from r where region is not null group by region, tier
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
    'scale', 5,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n from r
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
      'mult_top',          (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, true, v_min_group_n)
  ) into result;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id as sid, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', (select count(distinct sid) from re),
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                  group by question_domain) y)
  ) into result2;

  result := result || result2;

  result := result || jsonb_build_object(
    'exploration_index',
    case when (result->>'exploration_n')::bigint >= v_min_group_n
      then (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_funnel','{}'::jsonb))
              where key in ('exposure','response','formation','multiplication'))
      else null
    end
  );

  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. network_console() — funnel/domains and per-org index are leaf outputs.
-- ----------------------------------------------------------------------------
create or replace function public.network_console(p_short_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_net public.networks%rowtype; v_uid uuid := auth.uid(); result jsonb;
begin
  select * into v_net from networks where short_name = lower(btrim(p_short_name));
  if not found then raise exception 'network not found'; end if;

  if my_role() <> 'admin' and not exists (
    select 1 from network_members_users m
     where m.network_id = v_net.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this network';
  end if;

  with mem as (
    select o.id, o.short_name, o.name, o.country, nm.shares_index
      from network_members nm join organisations o on o.id = nm.org_id
     where nm.network_id = v_net.id
  ),
  r as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id sid, m.id oid, m.shares_index
      from mem m
      join campaigns c on c.org_id = m.id
      join sessions s on s.campaign_id = c.id
      join responses rsp on rsp.session_id = s.id
     where rsp.normalized is not null
  )
  select jsonb_build_object(
    'network', jsonb_build_object('short_name', v_net.short_name, 'name', v_net.name, 'kind', v_net.kind),
    'members', (select count(*) from mem),
    'scale', 5,
    'headline', jsonb_build_object(
      'organisations', (select count(distinct oid) from r),
      'responses',     (select count(distinct sid) from r)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from
                 (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from
                 (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'short_name', m.short_name, 'name', m.name, 'country', m.country,
        'shares_index', m.shares_index,
        'index', case when m.shares_index then (
          select ngjfi_to_5(avg(x.normalized)) from r x where x.oid = m.id
        ) else null end,
        'responses', (select count(distinct x.sid) from r x where x.oid = m.id)
      ) order by m.name) from mem m
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.network_console(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. org_dashboard_admin() — tiers/domains/by_audience are leaf outputs.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_admin(p_short_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org public.organisations%rowtype; result jsonb;
begin
  if my_role() <> 'admin' then raise exception 'administrators only'; end if;
  select * into v_org from organisations where short_name = lower(btrim(p_short_name));
  if not found then raise exception 'organisation not found'; end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id sid, c.audience
      from responses rsp
      join sessions s on s.id = rsp.session_id
      join campaigns c on c.id = s.campaign_id
     where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('short_name', v_org.short_name, 'name', v_org.name,
                              'country', v_org.country, 'verified', v_org.verified),
    'n', (select count(distinct sid) from r),
    'scale', 5,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'by_audience', (select jsonb_object_agg(audience, m) from
                     (select audience, ngjfi_to_5(avg(normalized)) m from r group by audience) a)
  ) into result;
  return result;
end;
$$;

grant execute on function public.org_dashboard_admin(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. org_benchmark() — country/global tiers objects are leaf outputs; the
-- country_index/global_index scalars are derived from those same
-- (now-converted) tiers objects and need no separate change.
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
      (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from country_r group by tier) t)
    into v_country_n, v_country_tiers;
  end if;

  if v_country_n >= v_country_gate then
    select round(avg(value::numeric),1) into v_country_index
    from jsonb_each_text(coalesce(v_country_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_country_tiers := null;
  end if;

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
      (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from global_r group by tier) t)
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
    'scale', 5,
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
-- 8. blended_trend() — the ONLY change is the final conversion at the return
-- statement. `live`/`archived`/`combined`/`yearly_tier` all keep computing
-- on the raw 0-100 scale internally, so a live figure and an archived
-- retained_aggregates.mean (which is NOT rescaled by this migration, and
-- never will need to be) blend together exactly as they did before —
-- there is no scale-mixing hazard here precisely because the conversion
-- happens once, at the very end, after the blend.
-- ----------------------------------------------------------------------------
create or replace function public.blended_trend(p_org_id uuid, p_is_demo boolean)
returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (
    select extract(year from s.created_at)::int as yr, rsp.question_domain as dom, rsp.tier,
           avg(rsp.normalized) as m, count(*) as n
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = p_is_demo
      and (p_org_id is null or o.id = p_org_id)
    group by 1, 2, 3
  ),
  archived as (
    select year as yr, question_domain as dom, tier, mean as m, n
    from retained_aggregates
    where is_demo = p_is_demo
      and (p_org_id is null or org_id = p_org_id)
  ),
  combined as (
    select yr, dom, tier, m, n from live
    union all
    select yr, dom, tier, m, n from archived
  ),
  yearly_tier as (
    select yr, tier, sum(m * n) / nullif(sum(n), 0) as tm
    from combined group by yr, tier
  )
  select coalesce(jsonb_agg(jsonb_build_object('year', yr, 'index', ngjfi_to_5(idx)) order by yr), '[]'::jsonb)
  from (select yr, avg(tm) as idx from yearly_tier group by yr) y;
$$;
