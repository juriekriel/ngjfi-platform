-- ============================================================================
-- The Jesus Index — the Exploration Index (migration 0026)
--
-- Instrument v4 gives respondents on the Unengaged branch (see
-- instrument.v4.json's version note) a full 24-item parallel measure, using
-- the SAME domain x tier cells as the official Index. The draft this was
-- built from says outright: "it does not make the scores equivalent." This
-- migration is the database half of honouring that: a second, completely
-- separate figure (the "Exploration Index"), computed the exact same way as
-- the official Index, that never contributes to it and is never summed or
-- averaged with it anywhere.
--
-- Mechanism: items.branch and responses.branch carry the instrument's own
-- `branch` tag ("engaged" | "unengaged" | null) through to every stored
-- response — the same pattern tier/question_domain already use (denormalised
-- onto the response row at write time, from the versioned instrument, never
-- hard-coded as a list of item keys in SQL). org_dashboard(),
-- collab_intelligence() and collab_intelligence_demo() then aggregate twice:
-- once excluding branch = 'unengaged' (unchanged behaviour — this is
-- 'index'/'tiers'/'domains'/'matrix', exactly as before), and once including
-- ONLY branch = 'unengaged' (new — 'exploration_index' etc.), and the two
-- are never combined.
--
-- src/lib/scoring.ts (the TS engine used for any client-side/dev computation)
-- got the identical split in the same PR.
-- ============================================================================

alter table public.items     add column if not exists branch text; -- 'engaged' | 'unengaged' | null
alter table public.responses add column if not exists branch text;

-- ----------------------------------------------------------------------------
-- 1. save_response(): carry the item's branch tag onto the response row,
-- exactly like tier/question_domain already are.
-- ----------------------------------------------------------------------------
create or replace function public.save_response(
  p_session_id uuid, p_item_key text, p_raw jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_item public.items%rowtype; v_iv uuid; v_norm numeric;
begin
  select c.instrument_version_id into v_iv
  from sessions s join campaigns c on c.id = s.campaign_id
  where s.id = p_session_id;
  if v_iv is null then raise exception 'session not found'; end if;

  select * into v_item from items where instrument_version_id = v_iv and key = p_item_key;
  if not found then raise exception 'unknown item %', p_item_key; end if;

  v_norm := public.ngjfi_normalize(v_item.type, v_item.scored, v_item.reverse_scored, v_item.scale, p_raw);

  insert into responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain, branch)
  values (p_session_id, v_item.id, p_item_key, p_raw, v_norm, v_item.tier, v_item.question_domain, v_item.branch)
  on conflict (session_id, item_id)
    do update set raw_value = excluded.raw_value, normalized = excluded.normalized, branch = excluded.branch;
end;
$$;

grant execute on function public.save_response(uuid, text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. org_dashboard(): exclude branch = 'unengaged' from the existing 'r' CTE
-- (so 'tiers'/'domains'/'matrix'/'index'/'items'/'n' behave exactly as
-- before — this is the defensive half of "never blended"), and add a second
-- 're' CTE + 'exploration_*' keys computed the identical way. Suppression:
-- the official figures keep their existing v_n / v_min_group_n gate,
-- unchanged; the exploration figures get their OWN independent v_explore_n
-- gate against the same v_min_group_n floor, since an org can clear one
-- without clearing the other.
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

  -- Below the floor: n is real and always shown ("of those who completed the
  -- Index" needs it to mean something) -- everything derived from it is not.
  -- The official and exploration figures are suppressed independently.
  if v_n < v_min_group_n and v_explore_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
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
    'tiers',   case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t) end,
    'domains', case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d) end,
    'matrix',  case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y) end,
    'items',   case when v_n < v_min_group_n then '[]'::jsonb else
               (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(distinct sid) n
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
               (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from re group by tier) t) end,
    'exploration_domains', case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from re group by question_domain) d) end,
    'exploration_matrix',  case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from re group by question_domain, tier) x
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
-- 3. collab_intelligence(): same split. 'funnel'/'domains'/'matrix' exclude
-- branch = 'unengaged' (defensive, matches 0021's own comment that these
-- three never read question_domain in ('drivers','journey') -- now also
-- true of branch = 'unengaged'). 'exploration_funnel'/'exploration_domains'/
-- 'exploration_matrix'/'exploration_index'/'exploration_n' are new, gated by
-- the same platform-wide publish/critical-mass gate as everything else on
-- this page (unlike org_dashboard(), there is no separate per-org floor
-- here to apply independently).
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
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
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
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from re group by question_domain, tier) x
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
-- 4. collab_intelligence_demo(): same split, no publish/critical-mass gate
-- (matches every other field here, per 0021's own comment -- synthetic data
-- has never been gated).
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
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from re group by question_domain, tier) x
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
