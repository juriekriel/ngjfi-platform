-- ============================================================================
-- The Jesus Index — privacy & metadata compliance confirmation (migration 0019)
--
-- Response to the closing data-model review. Four separate changes:
--
--   1. Metadata narrowed to exactly what was approved: organisation, country
--      (region is derived from the org, never stored per-session), age band,
--      language, survey date, survey version. gender and city are DROPPED —
--      not just stopped in the UI, the columns themselves are gone.
--   2. A general small-group floor (min_group_n, default 10) alongside the
--      existing critical-mass gate (400, for naming a geography). The two
--      are different things: 400 is "is this claim big enough to publish",
--      10 is "is this specific number too small to show at all, to anyone,
--      ever" — a k-anonymity floor, not a publication threshold.
--   3. org_dashboard() now honours that floor: an organisation with fewer
--      than min_group_n completions sees its own count (never hidden — "of
--      those who completed the Index" needs the n to mean anything) but no
--      derived score, the same way a country below 400 gets no score on
--      /intelligence.
--   4. by_age on collab_intelligence()/_demo() gets the same floor per age
--      band — it was the one breakdown on that page with no group-size
--      check at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Metadata: drop what was never approved.
-- ----------------------------------------------------------------------------
alter table public.sessions drop column if exists gender;
alter table public.sessions drop column if exists city;

create or replace function public.set_session_context(
  p_session_id uuid, p_field text, p_value text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;

  if p_field not in ('age_band', 'country') then
    raise exception 'field % is not settable from the survey', p_field;
  end if;

  if p_value is not null and length(p_value) > 64 then
    raise exception 'value too long for %', p_field;
  end if;

  if    p_field = 'age_band' then update sessions set age_band = p_value where id = p_session_id;
  elsif p_field = 'country'  then update sessions set country  = p_value where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.set_session_context(uuid, text, text) to anon, authenticated;

-- start_session() drops the gender/city parameters it accepted but the
-- frontend never actually passed (session context is set per-item via
-- set_session_context, above, not at session creation) -- keeping them would
-- have been a live way to write metadata that no longer has a column.
--
-- RECONCILED with migration 0016 (organisation activation status): that
-- migration's own start_session() redefinition still had gender/city and
-- runs before this one (16 < 19), so without this, 0019 would have silently
-- reverted 0016's organisation-status check the moment both were applied in
-- sequence. This version carries both: the pause/closed guard from 0016,
-- and the gender/city removal from this migration.
create or replace function public.start_session(
  p_campaign_id uuid,
  p_age_band text default null,
  p_country  text default null,
  p_locale   text default 'en',
  p_consent  jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; v_org_status text;
begin
  if not exists (select 1 from campaigns c where c.id = p_campaign_id and c.active) then
    raise exception 'campaign not found or inactive';
  end if;

  select o.status into v_org_status
  from campaigns c join organisations o on o.id = c.org_id
  where c.id = p_campaign_id;

  if v_org_status = 'paused' then
    raise exception 'organisation access is paused';
  elsif v_org_status = 'closed' then
    raise exception 'organisation access is closed';
  end if;

  insert into sessions (campaign_id, age_band, country, locale, consent)
  values (p_campaign_id, p_age_band, p_country,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.start_session(uuid,text,text,text,jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. The small-group floor, alongside (not instead of) critical_mass_gate.
-- ----------------------------------------------------------------------------
insert into platform_settings (key, value, note)
values ('min_group_n', '10'::jsonb, 'Any group, filter, or organisation below this many respondents shows n but no derived score, anywhere on the platform. Separate from critical_mass_gate (400), which governs when a GEOGRAPHY may be named at all.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. org_dashboard(): honour the floor. Also fixes a real pre-existing bug
-- caught while adding this -- 'n' was count(*) over response ROWS, not
-- count(distinct session), so a 3-respondent org answering a 24-item Index
-- reported n=72. That bug would have made a respondent-count gate meaningless,
-- so it's fixed here rather than filed separately.
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
      'items', '[]'::jsonb, 'trend', null
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
    'trend',   blended_trend(v_org.id, v_org.is_demo)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. by_age on collab_intelligence()/_demo(): the one breakdown on that page
-- with no group-size check at all until now. Everything else here is
-- identical to migration 0018 (regions[].tiers, the same-org region gate) --
-- only the by_age subquery and its new min_group_n variable are new.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
begin
  v_gate         := setting_int('critical_mass_gate', 400);
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
    -- min_group_n floor: an age band with too few respondents is omitted,
    -- not zero-filled -- the frontend already treats a missing key as "no
    -- data" for every other breakdown on this page.
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_gate),
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
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Retention: row-level data gone after 24 months, anonymous aggregate
-- kept -- AND that aggregate is actually read by the trend charts, not just
-- written. "Row-level" means sessions and responses -- individual answers
-- tied to one respondent's visit. Before deleting a batch, this folds its
-- contribution into a permanent, already-anonymous yearly aggregate (org +
-- year + domain + tier -> mean + n) so "movement over time" keeps years that
-- have aged out of the raw tables. The merge is weighted by n, so running
-- this monthly and having it repeatedly touch the same org/year bucket as
-- more of that year ages past the cutoff stays mathematically correct, not
-- just additive.
--
-- is_demo is captured at archive time (not looked up live at read time)
-- specifically so a trend query never needs to trust that an archived row's
-- parent organisation still exists and is still correctly flagged -- the
-- live/demo space split, which this platform treats as close to sacred, is
-- baked into the row itself and survives independently.
--
-- Deliberately a callable function, not a database-level cron job — pg_cron
-- may not be enabled on every tier, and Jurie should be able to see it run
-- (or run it by hand) rather than have it fire silently. A scheduled
-- workflow calling this via the Management API, the same pattern the repo
-- already uses for the weekly keepalive, is the natural way to automate it
-- once someone wants that.
-- ----------------------------------------------------------------------------
create table if not exists public.retained_aggregates (
  org_id          uuid not null references public.organisations(id) on delete cascade,
  is_demo         boolean not null,
  year            int not null,
  question_domain text not null,
  tier            text not null,
  mean            numeric,
  n               int not null,
  updated_at      timestamptz not null default now(),
  primary key (org_id, year, question_domain, tier)
);

alter table public.retained_aggregates enable row level security;
-- No policies: only ever read via the security-definer RPCs below, same
-- posture as every other aggregate table on this platform.

create or replace function public.purge_stale_respondent_data(p_cutoff_months int default 24)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cutoff timestamptz := now() - (p_cutoff_months || ' months')::interval;
  v_archived_rows int;
  v_deleted_sessions int;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can purge respondent data';
  end if;

  with stale as (
    select rsp.question_domain, rsp.tier, rsp.normalized,
           extract(year from s.created_at)::int as yr, c.org_id, o.is_demo
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where s.created_at < v_cutoff and rsp.normalized is not null
  ),
  agg as (
    select org_id, is_demo, yr, question_domain, tier, round(avg(normalized),1) m, count(*) n
    from stale group by org_id, is_demo, yr, question_domain, tier
  )
  insert into retained_aggregates (org_id, is_demo, year, question_domain, tier, mean, n)
  select org_id, is_demo, yr, question_domain, tier, m, n from agg
  on conflict (org_id, year, question_domain, tier) do update
    set mean = round(
          ((retained_aggregates.mean * retained_aggregates.n) + (excluded.mean * excluded.n))
          / nullif(retained_aggregates.n + excluded.n, 0), 1),
        n = retained_aggregates.n + excluded.n,
        updated_at = now();

  get diagnostics v_archived_rows = row_count;

  -- responses cascade-delete with their session (0001: on delete cascade)
  delete from sessions where created_at < v_cutoff;
  get diagnostics v_deleted_sessions = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'sessions_deleted', v_deleted_sessions,
    'aggregate_buckets_touched', v_archived_rows
  );
end;
$$;

grant execute on function public.purge_stale_respondent_data(int) to authenticated;

-- ----------------------------------------------------------------------------
-- Shared helper: a year-by-year index trend, blending live responses with
-- whatever's already been archived-and-deleted for the same years. One
-- function, called from org_dashboard() (p_org_id set) and both
-- collab_intelligence() variants (p_org_id null, p_is_demo chooses the
-- space). Centralised so the three trend queries can't quietly drift apart
-- the way start_session() just did across two branches.
--
-- DELIBERATELY NOT granted to anon/authenticated: it takes a raw org_id and
-- has no authorisation check of its own -- that check belongs to whichever
-- caller decided p_org_id was allowed. It only needs to be callable by the
-- functions below, which reach it as their own (already security-definer)
-- role, not as the original request's role -- granting it directly would
-- let anyone read any organisation's trend by guessing a uuid.
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
    -- n-weighted, so a year straddling the retention cutoff (partly archived,
    -- partly still live) still produces one correct mean, not two competing ones.
    select yr, tier, sum(m * n) / nullif(sum(n), 0) as tm
    from combined group by yr, tier
  )
  select coalesce(jsonb_agg(jsonb_build_object('year', yr, 'index', round(idx::numeric, 1)) order by yr), '[]'::jsonb)
  from (select yr, avg(tm) as idx from yearly_tier group by yr) y;
$$;

-- No grant to anon/authenticated -- see note above. org_dashboard() and
-- collab_intelligence()/_demo() already own or run as a role that can call
-- it directly; that's the only path to it.
