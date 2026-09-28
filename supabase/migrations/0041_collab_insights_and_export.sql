-- ============================================================================
-- The Jesus Index — Collab Intelligence "Insights" tab + Export (migration 0041)
--
-- Adds the data behind a third view on the Collab Intelligence frame
-- (beside "J12 matrix" and "Heat map"), and the year-keyed figures the new
-- Export section writes out:
--
--   timeline            per year: sessions started, sessions completed
--   countries_by_year   per year: distinct countries reached (+ distinct total)
--   languages_by_year   per year: distinct survey languages used, with counts
--   locality            per registered locality per year: year-on-year
--                       RETENTION — this year's completions ÷ last year's,
--                       capped at 1.00 — triangulated against where the
--                       respondents themselves said they are
--   index_by_year       per year: funnel / domains / J12 matrix, so an export
--                       filtered to a year is actually that year's figures
--
-- Definitions, chosen to agree with what already exists:
--   * YEAR is the calendar year the session started — the same basis as
--     blended_trend() (0019/0029). A completion counts toward the year its
--     session began. The org dashboard's season boundary (0030) is NOT used
--     here; the Collab-wide trend has always been calendar-year.
--   * LOCALITY is where the SURVEY was registered when it was created:
--     distribution_links.registered_country (the link a session came in
--     through), else campaigns.registered_country, else the organisation's
--     country. Both columns are new here and stamped at insert from the
--     organisation's country, so a later change to the organisation's
--     country does not move surveys that already exist. Existing rows are
--     backfilled the same way.
--   * TRIANGULATION: sessions.country is the respondent's own answer (free
--     text). Per locality-year we report the share of respondents who
--     answered it whose answer matches the registered locality
--     (case/space-insensitive). Reported only once min_group_n answered.
--   * STARTED is every session row (start_session() creates it on the first
--     screen); COMPLETED is sessions.completed. Both include respondents on
--     either branch — this is reach, not a score.
--
-- RETENTION for year Y = completions(Y) ÷ completions(Y-1), same locality,
-- capped at 1.00. A locality's first year, or a year after a gap, is a
-- baseline (no rate). A locality that had completions last year and none
-- this year reads 0.00 — the drop-off is the signal. If last year was
-- suppressed, this year's rate is withheld too (it would reveal last year's n).
--
-- New versioned config (non-negotiable #1/#3 — thresholds are data):
--   locality_rate_bands   the exceptional / healthy / average / low cut-offs
-- A placeholder proposed with the feature, for the researchers and the
-- Collab to move without a deploy.
--
-- Privacy, unchanged posture:
--   * Aggregates only. No row, no session id, no city, ever leaves.
--   * A locality×year cell below min_group_n returns neither n nor rate —
--     only `suppressed: true` — so a tiny country-year can't be read off.
--   * index_by_year only carries scores for a year whose completions clear
--     critical_mass_gate; below it the year returns n and nothing else.
--   * collab_insights() applies the SAME publish gate as
--     collab_intelligence(): nothing until publish_global_view is true and
--     the live space has cleared critical_mass_gate.
--
-- Data retention: purge_stale_respondent_data() (0019) deletes sessions older than
-- 24 months after folding their SCORES into retained_aggregates — but not
-- their counts, so a year-by-year timeline would quietly lose its early
-- years the first time the purge ran. This migration adds retained_activity
-- (org + year + locality + locale → started, completed, triangulation counts) and redefines the
-- purge to fold into it before deleting. Same shape and same reasoning as
-- retained_aggregates: already anonymous, is_demo captured at archive time.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Config
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('locality_rate_bands', '{"exceptional": 0.9, "healthy": 0.7, "average": 0.5, "low": 0.3}'::jsonb,
   'Cut-offs for the Insights locality retention rate (0–1: this year''s completions ÷ last year''s, same registered locality, capped at 1). At or above exceptional → exceptional; healthy → healthy; average → average; low → low; below low → not yet. Read by the UI from collab_insights(), never restated in code. A placeholder, not a finding.')
on conflict (key) do nothing;


-- ----------------------------------------------------------------------------
-- 2. Where a survey was registered, stamped when it is created
-- ----------------------------------------------------------------------------
alter table public.campaigns          add column if not exists registered_country text;
alter table public.distribution_links add column if not exists registered_country text;

comment on column public.campaigns.registered_country is
  'The locality this survey was registered to when created. Stamped from the organisation''s country at insert if not given; not moved by later changes to the organisation. The Insights locality unit.';
comment on column public.distribution_links.registered_country is
  'The locality this survey link was registered to when created. Stamped from the organisation''s country at insert if not given. Takes precedence over the campaign''s for sessions that came in through this link.';

create or replace function public.stamp_registered_country()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(new.registered_country, '')), '') is null then
    select nullif(btrim(o.country), '') into new.registered_country from organisations o where o.id = new.org_id;
  else
    new.registered_country := btrim(new.registered_country);
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_registered_country() from public, anon, authenticated;

drop trigger if exists campaigns_stamp_registered_country on public.campaigns;
create trigger campaigns_stamp_registered_country
  before insert on public.campaigns
  for each row execute function public.stamp_registered_country();

drop trigger if exists distribution_links_stamp_registered_country on public.distribution_links;
create trigger distribution_links_stamp_registered_country
  before insert on public.distribution_links
  for each row execute function public.stamp_registered_country();

-- Backfill: existing surveys take their organisation's country as it is now,
-- which is the best record available of where they were registered.
update public.campaigns c set registered_country = nullif(btrim(o.country), '')
  from public.organisations o where o.id = c.org_id and c.registered_country is null;
update public.distribution_links l set registered_country = nullif(btrim(o.country), '')
  from public.organisations o where o.id = l.org_id and l.registered_country is null;

-- The one definition of a session's locality, shared by the rollup and the
-- purge so the two can never disagree.
create or replace function public.session_locality(p_link uuid, p_campaign uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(btrim(registered_country), '') from distribution_links where id = p_link),
    (select nullif(btrim(c.registered_country), '') from campaigns c where c.id = p_campaign),
    (select nullif(btrim(o.country), '') from campaigns c join organisations o on o.id = c.org_id where c.id = p_campaign));
$$;
revoke all on function public.session_locality(uuid, uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. retained_activity — counts that survive the respondent-data purge
-- ----------------------------------------------------------------------------
create table if not exists public.retained_activity (
  org_id      uuid not null references public.organisations(id) on delete cascade,
  is_demo     boolean not null,
  year        int not null,
  country     text not null default '',   -- the registered locality; '' = not recorded (a PK column can't be null)
  locale      text not null default '',
  started     int not null default 0,
  completed   int not null default 0,
  answered    int not null default 0,     -- completed sessions that gave a country
  matched     int not null default 0,     -- …whose answer matched the registered locality
  updated_at  timestamptz not null default now(),
  primary key (org_id, year, country, locale)
);

alter table public.retained_activity enable row level security;
-- No policies: read only through the security-definer functions below.

comment on table public.retained_activity is
  'Per org/year/registered-locality/locale session counts for sessions deleted by purge_stale_respondent_data(). Lets the Insights timeline and retention keep years that have aged out of the raw tables. Already anonymous: counts only.';


-- ----------------------------------------------------------------------------
-- 4. purge_stale_respondent_data() — now also folds counts before deleting.
--    Body is 0019's, unchanged, plus the retained_activity insert.
-- ----------------------------------------------------------------------------
create or replace function public.purge_stale_respondent_data(p_cutoff_months int default 24)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
$$;

grant execute on function public.purge_stale_respondent_data(int) to authenticated;


-- ----------------------------------------------------------------------------
-- 5a. collab_insights_for(p_is_demo) — the shared body. NOT granted to
--     anon/authenticated (same posture as blended_trend / insight_aggregates):
--     it has no gate of its own; the wrappers below decide that.
-- ----------------------------------------------------------------------------
create or replace function public.collab_insights_for(p_is_demo boolean)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_gate        int   := setting_int('critical_mass_gate', 400);
  v_min_group_n int   := setting_int('min_group_n', 10);
  v_bands       jsonb := coalesce((select value from platform_settings where key = 'locality_rate_bands'),
                                  '{"exceptional":0.9,"healthy":0.7,"average":0.5,"low":0.3}'::jsonb);
  j_counts jsonb;
  j_index  jsonb;
begin
  -- Built as two statements rather than one: each half is quick on its own,
  -- but a single statement joining both gave the planner room for a plan
  -- ~30× slower on the demo seed (17 s vs < 0.5 s).

  -- ── A. Counts: timeline, countries, languages, locality ──────────────────
  -- Pre-grouped to locality × year × locale before anything reads it, so
  -- every figure below scans a few hundred rows, not every session.
  with ses as materialized (
    select extract(year from s.created_at)::int yr, o.region,
           -- inlined session_locality(): a join, not a lookup per row
           coalesce(nullif(btrim(dl.registered_country), ''), nullif(btrim(c.registered_country), ''), nullif(btrim(o.country), '')) loc,
           nullif(s.locale, '') locale, s.completed, nullif(btrim(s.country), '') said
      from sessions s
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      left join distribution_links dl on dl.id = s.distribution_link_id
     where o.is_demo = p_is_demo
  ),
  act as materialized (
    select yr, loc country, min(region) region, locale,
           count(*)::bigint started, (count(*) filter (where completed))::bigint completed,
           (count(*) filter (where completed and said is not null))::bigint answered,
           (count(*) filter (where completed and said is not null and lower(said) = lower(loc)))::bigint matched
      from ses group by yr, loc, locale
    union all
    -- … plus whatever the purge has already folded away
    select ra.year, nullif(ra.country, ''), min(o.region), nullif(ra.locale, ''),
           sum(ra.started)::bigint, sum(ra.completed)::bigint, sum(ra.answered)::bigint, sum(ra.matched)::bigint
      from retained_activity ra
      join organisations o on o.id = ra.org_id
     where ra.is_demo = p_is_demo
     group by ra.year, 2, 4
  ),
  -- one row per locality per year from its first year to the latest year
  -- anywhere, so a locality that went quiet shows as a 0, not a gap
  ly as (
    select country, min(region) region, yr, sum(completed) n, sum(answered) answered, sum(matched) matched
      from act where country is not null group by country, yr
  ),
  grid as (
    select l.country, l.region, y.yr, coalesce(ly.n, 0) n, coalesce(ly.answered, 0) answered, coalesce(ly.matched, 0) matched,
           ly.yr is not null present
      from (select country, min(region) region, min(yr) first_yr from ly group by country) l
      cross join (select distinct yr from act) y
      left join ly on ly.country = l.country and ly.yr = y.yr
     where y.yr >= l.first_yr
  ),
  ret as (
    select g.*, p.n prev_n, p.present prev_present
      from grid g left join grid p on p.country = g.country and p.yr = g.yr - 1
  )
  select jsonb_build_object(
    'years',     coalesce((select jsonb_agg(yr order by yr) from (select distinct yr from act) y), '[]'::jsonb),
    'timeline',  coalesce((select jsonb_agg(jsonb_build_object('year', yr, 'started', st, 'completed', co) order by yr)
                             from (select yr, sum(started) st, sum(completed) co from act group by yr) t), '[]'::jsonb),
    'countries_by_year', coalesce((select jsonb_agg(jsonb_build_object('year', yr, 'countries', n) order by yr)
                             from (select yr, count(distinct country) n from act group by yr) t), '[]'::jsonb),
    'countries_total',   (select count(distinct country) from act),
    'languages_by_year', coalesce((select jsonb_agg(jsonb_build_object('year', yr, 'languages', langs, 'locales', locales) order by yr)
                             from (select yr, count(*) filter (where locale is not null) langs,
                                          coalesce(jsonb_agg(jsonb_build_object('code', locale, 'n', n) order by n desc, locale)
                                                     filter (where locale is not null), '[]'::jsonb) locales
                                     from (select yr, locale, sum(started) n from act group by yr, locale) l
                                    group by yr) t), '[]'::jsonb),
    'languages_total',   (select count(distinct locale) from act),
    'locality_rates', coalesce((
        select jsonb_agg(jsonb_build_object('locality', country, 'region', region, 'cells', cells) order by total desc, country)
          from (select country, min(region) region, sum(n) total,
                       jsonb_object_agg(yr::text,
                         case
                           -- 0 identifies no one: a locality that went quiet shows its drop-off
                           when n = 0 and prev_n >= v_min_group_n
                             then jsonb_build_object('n', 0, 'prev_n', prev_n, 'rate', 0)
                           when n = 0 and prev_n > 0 then jsonb_build_object('n', 0, 'prev_suppressed', true)
                           when n = 0 then jsonb_build_object('n', 0)
                           when n < v_min_group_n then jsonb_build_object('suppressed', true)
                           else jsonb_build_object('n', n)
                             || case
                                  when prev_n is null or prev_n = 0 then jsonb_build_object('baseline', true)
                                  when prev_n < v_min_group_n then jsonb_build_object('prev_suppressed', true)
                                  else jsonb_build_object('prev_n', prev_n, 'rate', round(least(1.0, n::numeric / prev_n), 2))
                                end
                             || case when answered >= v_min_group_n
                                  then jsonb_build_object('answered', answered, 'match', round(matched::numeric / answered, 2))
                                  else '{}'::jsonb end
                         end) cells
                  from ret group by country) x), '[]'::jsonb)
  ) into j_counts;

  -- ── B. Per-year scores, blended with archived score buckets exactly as
  --      blended_trend() does (weighted by response count, 0–100 until the
  --      final ngjfi_to_5). A year carries scores only once its n clears
  --      critical_mass_gate. ─────────────────────────────────────────────────
  with sc_live as (
    select extract(year from s.created_at)::int yr, rsp.question_domain dom, rsp.tier,
           avg(rsp.normalized) m, count(*) n
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
     where rsp.normalized is not null
       and o.is_demo = p_is_demo
       and (rsp.branch is distinct from 'unengaged')
     group by 1, 2, 3
  ),
  sc as (
    select yr, dom, tier, m, n from sc_live
    union all
    select year, question_domain, tier, mean, n from retained_aggregates where is_demo = p_is_demo
  ),
  -- n behind a year's scores: live sessions with a scored engaged answer,
  -- plus archived completions (the archive can't split by branch)
  yr_n as (
    select yr, sum(n) n from (
      select extract(year from s.created_at)::int yr, count(distinct s.id) n
        from responses rsp
        join sessions s      on s.id = rsp.session_id
        join campaigns c     on c.id = s.campaign_id
        join organisations o on o.id = c.org_id
       where rsp.normalized is not null and o.is_demo = p_is_demo
         and (rsp.branch is distinct from 'unengaged')
       group by 1
      union all
      select year, sum(completed) from retained_activity where is_demo = p_is_demo group by year
    ) u group by yr
  ),
  cell as (select yr, dom, tier, ngjfi_to_5(sum(m * n) / nullif(sum(n), 0)) v from sc group by yr, dom, tier),
  fun  as (select yr, tier,      ngjfi_to_5(sum(m * n) / nullif(sum(n), 0)) v from sc group by yr, tier),
  dmn  as (select yr, dom,       ngjfi_to_5(sum(m * n) / nullif(sum(n), 0)) v from sc group by yr, dom)
  select coalesce(jsonb_agg(
           case when yn.n >= v_gate then jsonb_build_object(
             'year', yn.yr, 'n', yn.n,
             'funnel',  (select jsonb_object_agg(tier, v) from fun where fun.yr = yn.yr),
             'domains', (select jsonb_object_agg(dom, v)  from dmn where dmn.yr = yn.yr),
             'matrix',  (select jsonb_object_agg(dom, tiers) from
                          (select dom, jsonb_object_agg(tier, v) tiers from cell where cell.yr = yn.yr group by dom) z))
           else jsonb_build_object('year', yn.yr, 'n', yn.n, 'suppressed', true) end
         order by yn.yr), '[]'::jsonb)
    into j_index
    from yr_n yn;

  return jsonb_build_object(
    'gate',        v_gate,
    'min_group_n', v_min_group_n,
    'locality',    jsonb_build_object('unit', 'registered_country', 'measure', 'retention', 'bands', v_bands)
  ) || j_counts || jsonb_build_object('index_by_year', j_index);
end;
$$;

revoke all on function public.collab_insights_for(boolean) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5b. The two callable wrappers — the same live/demo pair as
--    collab_intelligence() / collab_intelligence_demo().
-- ----------------------------------------------------------------------------
create or replace function public.collab_insights()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_gate    int     := setting_int('critical_mass_gate', 400);
  v_publish boolean := setting_bool('publish_global_view', false);
  v_total   bigint;
begin
  -- collab_intelligence()'s publish check, plus sessions the purge has
  -- already folded into retained_activity. Without that second term the
  -- first purge would drop the live space back under the gate and switch
  -- this whole view off. (collab_intelligence() carries the same latent
  -- gap; left for its own change rather than widened here.)
  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;
  v_total := v_total + coalesce((select sum(started) from retained_activity where is_demo = false), 0);

  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space', 'live', 'published', false,
      'reason', case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate', v_gate, 'completions', v_total);
  end if;

  return jsonb_build_object('space', 'live', 'published', true) || collab_insights_for(false);
end;
$$;

create or replace function public.collab_insights_demo()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('space', 'demo', 'published', true) || collab_insights_for(true);
$$;

grant execute on function public.collab_insights()      to anon, authenticated;
grant execute on function public.collab_insights_demo() to anon, authenticated;
