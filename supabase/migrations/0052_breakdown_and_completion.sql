-- ============================================================================
-- The Jesus Index — "who answered" breakdown and survey completion (0052)
--
-- A. DEMOGRAPHIC BREAKDOWN — org_breakdown() / link_breakdown()
--    How an organisation's results differ by who answered, one dimension at
--    a time, without any breakdown becoming a way to find a person:
--      * dimensions are a WHITELIST: age_band, gender, faith_status
--        (the orientation screener), country, language, survey_version.
--        Group values come from the data; labels come from the instrument on
--        the client, so a new age band (31_45 …) appears with no code change.
--      * one dimension at a time. No cross-tabs for organisations.
--      * every group carries n. Scores only where the group clears the floor:
--        min_group_n (rooms: room_min_n); country groups need the place gate
--        (critical_mass_gate) before a country is named.
--      * COMPLEMENTARY SUPPRESSION: if exactly one group is hidden, the next
--        smallest is hidden too — otherwise total minus the visible groups
--        would reveal it. Hidden groups are never NAMED: they fold into one
--        '_hidden' row with no n (naming a hidden country or faith status
--        would itself disclose that someone from it answered).
--      * the follower / non-follower split of a visible group is shown only
--        when both parts clear the floor (or one is zero).
--      * followers' groups get the J12 Index; non-followers' the Exploration
--        Index. Never averaged together (CLAUDE.md #9, 0047).
--    Base = completions, as everywhere since 0047: sessions with at least one
--    scored answer.
--
-- B. SURVEY COMPLETION — org_completion() / link_completion()
--      * started   = live sessions (test links live in test_sessions; demo
--                    orgs only ever see their own; under-13 sessions are
--                    discarded by 0042 and never counted)
--      * completed = sessions.completed (finish_session)
--      * rate      = completed ÷ (completed + unfinished sessions started more
--                    than 48 hours ago) — a phone holding answers offline is
--                    not a drop-out. Shown only when that base clears the floor.
--      * stop points: for unfinished sessions, the last STAGE reached,
--        derived from each item's section + order in the instrument
--        definition (never a key list): age · screener · index ·
--        extras_offer · extras · about_you.
--      * extras opt-in rate: sessions that answered any module/driver/journey
--        item ÷ sessions that reached the extras offer.
--    collab_completion() adds the attention-check pass rate — a data-quality
--    line for researchers only, never shown to organisations.
--
-- Aggregates only. No session id, no row, ever leaves these functions.
-- (Volatile, not stable: they stage rows in on-commit-drop temp tables.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A1. The core (no auth). p_link null = the whole organisation.
-- ----------------------------------------------------------------------------
create or replace function public._breakdown_core(
  p_org uuid, p_link uuid, p_dimension text,
  p_start date default null, p_end date default null, p_min int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_min   int := coalesce(p_min, setting_int('min_group_n', 10));
  v_place int := setting_int('critical_mass_gate', 400);
  v_floor int;
  v_total bigint;
  v_groups jsonb;
begin
  if p_dimension not in ('age_band', 'gender', 'faith_status', 'country', 'language', 'survey_version') then
    raise exception 'unknown breakdown dimension "%"', p_dimension;
  end if;
  v_floor := case when p_dimension = 'country' then greatest(v_place, v_min) else v_min end;

  create temporary table if not exists _bd (
    sid uuid, grp text, branch text, tier text, normalized numeric
  ) on commit drop;
  truncate _bd;

  insert into _bd (sid, grp, branch, tier, normalized)
  select s.id,
         coalesce(nullif(btrim(case p_dimension
           when 'age_band'       then s.age_band
           when 'gender'         then s.gender
           when 'country'        then initcap(lower(btrim(s.country)))
           when 'language'       then s.locale
           when 'survey_version' then s.item_set
           when 'faith_status'   then (select o.raw_value #>> '{}' from responses o
                                        where o.session_id = s.id and o.item_key = 'orientation' limit 1)
         end), ''), '_not_given'),
         r.branch, r.tier, r.normalized
    from sessions s
    join campaigns c on c.id = s.campaign_id
    join responses r on r.session_id = s.id
   where c.org_id = p_org
     and (p_link is null or s.distribution_link_id = p_link)
     and r.normalized is not null
     and (p_start is null or s.created_at::date >= p_start)
     and (p_end   is null or s.created_at::date <= p_end);

  select count(distinct sid) into v_total from _bd;

  with g as (
    select grp,
           count(distinct sid) n,
           count(distinct sid) filter (where branch is distinct from 'unengaged') n_follow,
           count(distinct sid) filter (where branch = 'unengaged') n_explore
      from _bd group by grp
  ),
  ranked as (
    select g.*, (n < v_floor) as below,
           row_number() over (order by n asc, grp) as rk
      from g
  ),
  hidden as (
    -- complementary suppression: one hidden group → hide the next smallest too
    select r.*, r.below or (
             (select count(*) from ranked where below) = 1
             and r.rk = (select min(rk) from ranked where not below)
           ) as suppressed
      from ranked r
  ),
  tiers as (
    select grp, branch_kind, jsonb_object_agg(tier, m) t
      from (select grp,
                   case when branch = 'unengaged' then 'explore' else 'follow' end branch_kind,
                   tier, ngjfi_to_5(avg(normalized)) m
              from _bd group by 1, 2, 3) x
     group by grp, branch_kind
  )
  -- Visible groups are named; hidden ones are NEVER named — they fold into one
  -- '_hidden' row with no n and no score (naming a hidden country or faith
  -- status would itself disclose that someone from it answered).
  select coalesce(jsonb_agg(jsonb_build_object(
           'value',      h.grp,
           'n',          h.n,
           'suppressed', false,
           'share',      case when v_total = 0 then null else round(h.n::numeric / v_total, 3) end,
           -- the follower / non-follower split only when BOTH parts clear the floor
           'following_n',     case when least(h.n_follow, h.n_explore) = 0 or least(h.n_follow, h.n_explore) >= v_floor then h.n_follow end,
           'not_following_n', case when least(h.n_follow, h.n_explore) = 0 or least(h.n_follow, h.n_explore) >= v_floor then h.n_explore end,
           'tiers',  case when h.n_follow >= v_floor then tf.t end,
           'index',  case when h.n_follow >= v_floor then
                       (select round(avg(value::numeric), 1) from jsonb_each_text(tf.t)
                         where key in ('exposure', 'response', 'formation', 'multiplication')) end,
           'exploration_tiers', case when h.n_explore >= v_floor then te.t end,
           'exploration_index', case when h.n_explore >= v_floor then
                       (select round(avg(value::numeric), 1) from jsonb_each_text(te.t)
                         where key in ('exposure', 'response', 'formation', 'multiplication')) end
         ) order by h.n desc, h.grp), '[]'::jsonb)
         || case when exists (select 1 from hidden where suppressed)
                 then jsonb_build_array(jsonb_build_object(
                        'value', '_hidden', 'n', null, 'suppressed', true, 'share', null,
                        'following_n', null, 'not_following_n', null,
                        'tiers', null, 'index', null, 'exploration_tiers', null, 'exploration_index', null))
                 else '[]'::jsonb end
    into v_groups
    from hidden h
    left join tiers tf on tf.grp = h.grp and tf.branch_kind = 'follow'
    left join tiers te on te.grp = h.grp and te.branch_kind = 'explore'
   where not h.suppressed;

  return jsonb_build_object(
    'dimension', p_dimension,
    'total', v_total,
    'min_n', v_floor,
    'scale', 5,
    'groups', v_groups);
end;
$$;
revoke all on function public._breakdown_core(uuid, uuid, text, date, date, int) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- A2. Entry points — the same membership check as org_dashboard_season /
--     org_link_dashboard (0046).
-- ----------------------------------------------------------------------------
create or replace function public._require_org_member(p_org_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = p_org_slug or short_name = p_org_slug limit 1;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null or not (
       exists (select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active')
       or my_role() = 'admin') then
    raise exception 'not authorised for this organisation';
  end if;
  return v_org;
end $$;
revoke all on function public._require_org_member(text) from public, anon, authenticated;

create or replace function public.org_breakdown(
  p_org_slug text, p_dimension text, p_season_start date default null, p_season_end date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return _breakdown_core(_require_org_member(p_org_slug), null, p_dimension, p_season_start, p_season_end, null);
end $$;
grant execute on function public.org_breakdown(text, text, date, date) to authenticated;

create or replace function public.link_breakdown(p_org_slug text, p_link_id uuid, p_dimension text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_member(p_org_slug);
begin
  if not exists (select 1 from distribution_links where id = p_link_id and org_id = v_org) then
    raise exception 'link not found';
  end if;
  return _breakdown_core(v_org, p_link_id, p_dimension, null, null,
                         setting_int('room_min_n', setting_int('min_group_n', 10)));
end $$;
grant execute on function public.link_breakdown(text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- B1. Completion core (no auth).
-- ----------------------------------------------------------------------------
create or replace function public._completion_core(
  p_org uuid, p_link uuid, p_start date default null, p_end date default null,
  p_min int default null, p_quality boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_min int := coalesce(p_min, setting_int('min_group_n', 10));
  v_pending interval := make_interval(hours => setting_int('completion_pending_hours', 48));
  v_started bigint; v_completed bigint; v_base bigint; v_pending_n bigint;
  v_stops jsonb; v_reached bigint; v_opted bigint; v_att jsonb := null;
begin
  create temporary table if not exists _cs (sid uuid, completed boolean, created_at timestamptz, inst uuid) on commit drop;
  truncate _cs;
  insert into _cs
  select s.id, s.completed, s.created_at, c.instrument_version_id
    from sessions s join campaigns c on c.id = s.campaign_id
   where c.org_id = p_org
     and (p_link is null or s.distribution_link_id = p_link)
     and (p_start is null or s.created_at::date >= p_start)
     and (p_end   is null or s.created_at::date <= p_end);

  select count(*), count(*) filter (where completed),
         count(*) filter (where not completed and created_at >= now() - v_pending)
    into v_started, v_completed, v_pending_n from _cs;
  v_base := v_started - v_pending_n;

  -- each answered item's stage, from the instrument definition (section + order)
  create temporary table if not exists _st (sid uuid, stage text, ord int) on commit drop;
  truncate _st;
  -- key → stage, computed once per instrument version in play
  create temporary table if not exists _stagemap (inst uuid, item_key text, stage text, ord int) on commit drop;
  truncate _stagemap;
  insert into _stagemap
  select v.id, it->>'key',
         case
           when it->>'section' in ('module', 'driver', 'journey') then 'extras'
           when it->>'section' = 'index' then 'index'
           when it->>'section' = 'screener' and (it->>'order')::int > b.max_index then 'extras_offer'
           when it->>'section' = 'screener' then 'screener'
           when it->>'section' = 'demographic' and (it->>'order')::int < b.min_screener then 'age'
           else 'about_you'
         end,
         (it->>'order')::int
    from instrument_versions v
    cross join lateral jsonb_array_elements(coalesce(v.definition->'items', '[]'::jsonb)) it
    cross join lateral (
      select coalesce(max((x->>'order')::int) filter (where x->>'section' = 'index'), 0) max_index,
             coalesce(min((x->>'order')::int) filter (where x->>'section' = 'screener'), 0) min_screener
        from jsonb_array_elements(coalesce(v.definition->'items', '[]'::jsonb)) x
    ) b
   where v.id in (select distinct inst from _cs);

  insert into _st
  select cs.sid, m.stage, m.ord
    from _cs cs
    join responses r on r.session_id = cs.sid
    join _stagemap m on m.inst = cs.inst and m.item_key = r.item_key;

  select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) into v_stops
    from (select coalesce(last.stage, 'not_started') stage, count(*) n
            from _cs cs
            left join lateral (select stage from _st where _st.sid = cs.sid order by ord desc limit 1) last on true
           where not cs.completed and cs.created_at < now() - v_pending
           group by 1) x;

  select count(distinct sid) filter (where stage in ('extras_offer', 'extras', 'about_you')),
         count(distinct sid) filter (where stage = 'extras')
    into v_reached, v_opted from _st;

  if p_quality then
    select jsonb_build_object(
             'checked', count(*),
             'passed',  count(*) filter (where (r.raw_value #>> '{}') = (it->'attention_check'->>'expected')),
             'pass_rate', case when count(*) >= v_min then
               round((count(*) filter (where (r.raw_value #>> '{}') = (it->'attention_check'->>'expected')))::numeric / count(*), 3) end)
      into v_att
      from _cs cs
      join responses r on r.session_id = cs.sid
      join instrument_versions v on v.id = cs.inst
      cross join lateral jsonb_array_elements(coalesce(v.definition->'items', '[]'::jsonb)) it
     where it->>'key' = r.item_key and it ? 'attention_check';
  end if;

  return jsonb_build_object(
    'started', v_started,
    'completed', v_completed,
    'pending', v_pending_n,
    'rate_base', v_base,
    'min_n', v_min,
    'completion_rate', case when v_base >= v_min and v_base > 0 then round(v_completed::numeric / v_base, 3) end,
    'stop_points', case when v_base >= v_min then v_stops end,
    'extras_reached', v_reached,
    'extras_opt_in_rate', case when v_reached >= v_min then round(v_opted::numeric / v_reached, 3) end,
    'attention_check', v_att);
end;
$$;
revoke all on function public._completion_core(uuid, uuid, date, date, int, boolean) from public, anon, authenticated;

insert into public.platform_settings (key, value, note) values
  ('completion_pending_hours', '48'::jsonb,
   'Unfinished sessions younger than this are "pending" (a phone may still be holding answers offline), not drop-outs. Migration 0052.')
on conflict (key) do nothing;

create or replace function public.org_completion(
  p_org_slug text, p_season_start date default null, p_season_end date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return _completion_core(_require_org_member(p_org_slug), null, p_season_start, p_season_end, null, false);
end $$;
grant execute on function public.org_completion(text, date, date) to authenticated;

create or replace function public.link_completion(p_org_slug text, p_link_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_member(p_org_slug);
begin
  if not exists (select 1 from distribution_links where id = p_link_id and org_id = v_org) then
    raise exception 'link not found';
  end if;
  return _completion_core(v_org, p_link_id, null, null,
                          setting_int('room_min_n', setting_int('min_group_n', 10)), false);
end $$;
grant execute on function public.link_completion(text, uuid) to authenticated;

-- Collab console: every live organisation, plus the attention-check line.
create or replace function public.collab_completion()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'only the Collab can see completion across organisations';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('org', o.short_name, 'name', o.name)
                     || _completion_core(o.id, null, null, null, null, true) order by o.name)
      from organisations o where not o.is_demo and o.status = 'active'), '[]'::jsonb);
end $$;
grant execute on function public.collab_completion() to authenticated;
