-- ============================================================================
-- The Jesus Index — non-followers: counted in completions, scored apart
-- (migration 0047)
--
-- Decided Oct 2026 with the Collab:
--   * Everyone who completes the Index counts in an organisation's completion
--     total — followers and those not yet following alike — and the total is
--     shown SEGMENTED (following / not yet following), never as one score.
--   * Non-followers' answers never enter the J12 matrix, its index, the trend
--     or any benchmark. They are scored only in their own Unengaged matrix
--     (the Exploration Index, 0026): same 3 × 4 model, same maths, its own n.
--   * The Unengaged matrix unlocks in any space — the house, a season, a
--     room (a distribution link) — once that space has the SAME minimum of
--     non-followers it needs of followers: min_group_n for the house and a
--     season, room_min_n for a room. No separate threshold exists.
--
-- Until now the house kept the two apart, but several aggregates did not:
-- they averaged every scored answer, so non-followers' answers ran into the
-- J12 figure they were compared with. Each is fixed here with ONE added
-- condition — (rsp.branch is distinct from 'unengaged') — and nothing else
-- in its body changes:
--     blended_trend()        the "movement over time" line, org and Collab
--     org_benchmark()        country and global baselines
--     network_console()      network roll-ups
--     org_dashboard_admin()  the Collab console's per-org view
-- and, for the archive a retention purge would leave behind:
--     retained_aggregates    gains a branch column (part of its key)
--     _purge_stale_respondent_data_unchecked()  archives each branch apart
--     blended_trend()        reads only the 'index' branch from the archive
-- No purge has run (respondent_retention_months is still unset), so the
-- archive is empty and nothing already archived is relabelled.
--
--   1. retained_aggregates.branch
--   2. the four aggregates + the purge, each with the branch condition
--   3. _gated_trend() — the trend's per-year floor counts followers only
--   4. _org_dashboard_core() — adds `completions` and `exploration_min_n`
--   5. _link_dashboard_core() — a room's own Unengaged matrix + completions
--   6. org_dashboard_demo() — the signed-out preview reads the same core,
--      so the sample organisation can never diverge from the product
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. retained_aggregates.branch — 'index' (followers, the J12) or 'unengaged'.
-- ----------------------------------------------------------------------------
alter table public.retained_aggregates
  add column if not exists branch text not null default 'index';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'retained_aggregates_branch_check') then
    alter table public.retained_aggregates
      add constraint retained_aggregates_branch_check check (branch in ('index', 'unengaged'));
  end if;
end $$;

alter table public.retained_aggregates drop constraint if exists retained_aggregates_pkey;
alter table public.retained_aggregates
  add constraint retained_aggregates_pkey primary key (org_id, year, question_domain, tier, branch);

comment on column public.retained_aggregates.branch is
  'Which matrix the archived answers belong to (0047): index = followers (the J12), unengaged = the Unengaged matrix. Never summed together.';


-- ----------------------------------------------------------------------------
-- 2. Non-followers out of every score that is not their own.
-- ----------------------------------------------------------------------------
create or replace function public.blended_trend(p_org_id uuid, p_is_demo boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with live as (
    select extract(year from s.created_at)::int as yr, rsp.question_domain as dom, rsp.tier,
           avg(rsp.normalized) as m, count(*) as n
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
      and o.is_demo = p_is_demo
      and (p_org_id is null or o.id = p_org_id)
    group by 1, 2, 3
  ),
  archived as (
    select year as yr, question_domain as dom, tier, mean as m, n
    from retained_aggregates
    where is_demo = p_is_demo
      and branch = 'index'
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
$function$;

create or replace function public.org_benchmark(p_org_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        and (rsp.branch is distinct from 'unengaged')
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
        and (rsp.branch is distinct from 'unengaged')
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
$function$;

create or replace function public.network_console(p_short_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       and (rsp.branch is distinct from 'unengaged')
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
$function$;

create or replace function public.org_dashboard_admin(p_short_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       and (rsp.branch is distinct from 'unengaged')
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
$function$;

create or replace function public._purge_stale_respondent_data_unchecked(p_cutoff_months integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cutoff timestamptz := now() - (p_cutoff_months || ' months')::interval;
  v_archived_rows int;
  v_activity_rows int;
  v_deleted_sessions int;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can purge respondent data';
  end if;

  with stale as (
    select rsp.question_domain, rsp.tier, rsp.normalized,
           case when rsp.branch = 'unengaged' then 'unengaged' else 'index' end as branch,
           extract(year from s.created_at)::int as yr, c.org_id, o.is_demo
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where s.created_at < v_cutoff and rsp.normalized is not null
  ),
  agg as (
    select org_id, is_demo, yr, question_domain, tier, branch, round(avg(normalized),1) m, count(*) n
    from stale group by org_id, is_demo, yr, question_domain, tier, branch
  )
  insert into retained_aggregates (org_id, is_demo, year, question_domain, tier, branch, mean, n)
  select org_id, is_demo, yr, question_domain, tier, branch, m, n from agg
  on conflict (org_id, year, question_domain, tier, branch) do update
    set mean = round(
          ((retained_aggregates.mean * retained_aggregates.n) + (excluded.mean * excluded.n))
          / nullif(retained_aggregates.n + excluded.n, 0), 1),
        n = retained_aggregates.n + excluded.n,
        updated_at = now();

  get diagnostics v_archived_rows = row_count;

  -- New in 0041: the counts behind the Insights timeline and retention, additive.
  insert into retained_activity (org_id, is_demo, year, country, locale, started, completed, answered, matched)
  select org_id, is_demo, yr, coalesce(loc, ''), locale,
         count(*), count(*) filter (where completed),
         count(*) filter (where completed and said is not null),
         count(*) filter (where completed and said is not null and lower(said) = lower(loc))
  from (
    select c.org_id, o.is_demo, extract(year from s.created_at)::int yr,
           session_locality(s.distribution_link_id, s.campaign_id) loc,
           coalesce(s.locale, '') locale, s.completed, nullif(btrim(s.country), '') said
      from sessions s
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
     where s.created_at < v_cutoff
  ) x
  group by 1, 2, 3, 4, 5
  on conflict (org_id, year, country, locale) do update
    set started    = retained_activity.started   + excluded.started,
        completed  = retained_activity.completed + excluded.completed,
        answered   = retained_activity.answered  + excluded.answered,
        matched    = retained_activity.matched   + excluded.matched,
        updated_at = now();

  get diagnostics v_activity_rows = row_count;

  -- responses cascade-delete with their session (0001: on delete cascade)
  delete from sessions where created_at < v_cutoff;
  get diagnostics v_deleted_sessions = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'sessions_deleted', v_deleted_sessions,
    'aggregate_buckets_touched', v_archived_rows,
    'activity_buckets_touched', v_activity_rows
  );
end;
$function$;


-- ----------------------------------------------------------------------------
-- 3. _gated_trend() (0046): a trend year is the followers' J12, so its floor
-- counts followers.
-- ----------------------------------------------------------------------------
create or replace function public._gated_trend(p_org_id uuid, p_is_demo boolean, p_min int)
returns jsonb
language sql stable security definer set search_path = public as $$
  with yearly as (
    select extract(year from s.created_at)::int as yr, count(distinct s.id) as n
      from sessions s
      join campaigns c  on c.id = s.campaign_id
      join responses r  on r.session_id = s.id
     where c.org_id = p_org_id and r.normalized is not null
       and (r.branch is distinct from 'unengaged')
     group by 1
  )
  select coalesce(jsonb_agg(t order by (t->>'year')::int), '[]'::jsonb)
    from jsonb_array_elements(coalesce(blended_trend(p_org_id, p_is_demo), '[]'::jsonb)) t
    join yearly y on y.yr = (t->>'year')::int
   where y.n >= p_min;
$$;

revoke all on function public._gated_trend(uuid, boolean, int) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. _org_dashboard_core() (0046) — unchanged except:
--      completions        {total, following, not_following}: everyone counted,
--                         segmented. `n` stays the J12's own n (followers).
--      exploration_min_n  the floor the Unengaged matrix unlocks at — the
--                         same min_group_n the J12 holds.
-- ----------------------------------------------------------------------------
create or replace function public._org_dashboard_core(
  p_org_id uuid,
  p_season_start date default null,
  p_season_end date default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype; result jsonb; result2 jsonb;
  v_n bigint; v_explore_n bigint; v_total bigint; v_min_group_n int; v_completions jsonb;
begin
  select * into v_org from organisations where id = p_org_id;
  if not found then raise exception 'org not found'; end if;

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

  -- Everyone who completed scored questions, on either branch. Followers'
  -- answers make the J12; non-followers' make the Unengaged matrix. Both
  -- count as completions — one total, segmented, never one score.
  select count(distinct s.id) into v_total
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
   where c.org_id = v_org.id and rsp.normalized is not null
     and (p_season_start is null or s.created_at::date >= p_season_start)
     and (p_season_end   is null or s.created_at::date <= p_season_end);
  v_completions := jsonb_build_object('total', v_total, 'following', v_n, 'not_following', v_explore_n);

  if v_n < v_min_group_n and v_explore_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'season', jsonb_build_object('start', p_season_start, 'end', p_season_end),
      'n', v_n,
      'completions', v_completions,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'scale', 5,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb,
      'exploration_n', v_explore_n, 'exploration_min_n', v_min_group_n, 'exploration_suppressed', true,
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
    'completions', v_completions,
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
    'trend',   _gated_trend(v_org.id, v_org.is_demo, v_min_group_n),
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
    'exploration_min_n', v_min_group_n,
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

revoke all on function public._org_dashboard_core(uuid, date, date) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. _link_dashboard_core() (0046) — a room now carries its own Unengaged
-- matrix, unlocked at room_min_n non-followers (the same room_min_n its J12
-- holds), and its segmented completions. Its J12 is unchanged. Still no
-- per-item rows and no insight layers for a room.
-- ----------------------------------------------------------------------------
create or replace function public._link_dashboard_core(p_link_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_link public.distribution_links%rowtype;
  v_min int;
  v_n bigint; v_explore_n bigint;
  result jsonb; ex jsonb;
begin
  select * into v_link from distribution_links where id = p_link_id;
  if not found then raise exception 'link not found'; end if;

  v_min := setting_int('room_min_n', setting_int('min_group_n', 10));

  select count(distinct s.id) filter (where rsp.branch is distinct from 'unengaged'),
         count(distinct s.id) filter (where rsp.branch = 'unengaged')
    into v_n, v_explore_n
    from sessions s
    join responses rsp on rsp.session_id = s.id
   where s.distribution_link_id = v_link.id
     and rsp.normalized is not null;

  result := jsonb_build_object(
    'link', jsonb_build_object('id', v_link.id, 'name', v_link.name, 'slug', v_link.slug),
    'n', v_n, 'suppressed', v_n < v_min, 'min_n', v_min, 'scale', 5,
    'completions', jsonb_build_object('total',
        (select count(distinct s.id) from sessions s join responses rsp on rsp.session_id = s.id
          where s.distribution_link_id = v_link.id and rsp.normalized is not null),
        'following', v_n, 'not_following', v_explore_n),
    'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
    'exploration_n', v_explore_n, 'exploration_min_n', v_min,
    'exploration_suppressed', v_explore_n < v_min,
    'exploration_index', null, 'exploration_tiers', '{}'::jsonb,
    'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
  );

  -- The room's J12 — followers only, behind room_min_n (unchanged from 0033).
  if v_n >= v_min then
    with r as (
      select rsp.tier, rsp.question_domain, rsp.normalized
      from responses rsp
      join sessions s on s.id = rsp.session_id
      where s.distribution_link_id = v_link.id
        and rsp.normalized is not null
        and (rsp.branch is distinct from 'unengaged')
    )
    select jsonb_build_object(
      'tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
      'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
      'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                   (select question_domain, jsonb_object_agg(tier, m) tiers from
                      (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                    group by question_domain) y)
    ) into ex;
    result := result || ex;
    result := result || jsonb_build_object('index',
      (select round(avg(value::numeric), 1) from jsonb_each_text(coalesce(result->'tiers', '{}'::jsonb))
        where key in ('exposure', 'response', 'formation', 'multiplication')));
  end if;

  -- The room's Unengaged matrix — non-followers only, behind the SAME floor.
  if v_explore_n >= v_min then
    with re as (
      select rsp.tier, rsp.question_domain, rsp.normalized
      from responses rsp
      join sessions s on s.id = rsp.session_id
      where s.distribution_link_id = v_link.id
        and rsp.normalized is not null
        and rsp.branch = 'unengaged'
    )
    select jsonb_build_object(
      'exploration_tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t),
      'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d),
      'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                   (select question_domain, jsonb_object_agg(tier, m) tiers from
                      (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                    group by question_domain) y)
    ) into ex;
    result := result || ex;
    result := result || jsonb_build_object('exploration_index',
      (select round(avg(value::numeric), 1) from jsonb_each_text(coalesce(result->'exploration_tiers', '{}'::jsonb))
        where key in ('exposure', 'response', 'formation', 'multiplication')));
  end if;

  return result;
end;
$$;

revoke all on function public._link_dashboard_core(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6. org_dashboard_demo() — the open preview of a demo organisation reads
-- the same core as a real dashboard (CLAUDE.md: the demo must never diverge
-- from the product). Before this it was a separate copy with no branch
-- condition, so its J12 included non-followers.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_demo(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org public.organisations%rowtype;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if not coalesce(v_org.is_demo, false) then
    raise exception 'demo preview is only available for demo organisations';
  end if;
  return _org_dashboard_core(v_org.id, null, null) || jsonb_build_object('demo', true);
end;
$$;

grant execute on function public.org_dashboard_demo(text) to anon, authenticated;
