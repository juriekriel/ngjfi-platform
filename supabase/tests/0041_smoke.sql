-- Smoke test for migration 0041 (Collab Insights + retained activity).
-- NOT a migration: run by hand against a THROWAWAY database that has every
-- migration applied, with Supabase's auth schema stubbed. Never run against
-- production — it inserts fixture rows and runs the purge.
--
-- Checks:
--   unpublished live space → collab_insights() returns published:false, no data
--   surveys are stamped with the org's country when created, and keep it
--   a link's registered locality wins over its campaign's
--   timeline counts started vs completed per calendar year
--   countries_by_year / languages_by_year count distinct values per year
--   retention = completions(Y) ÷ completions(Y-1), capped at 1.00
--   first year is a baseline; a small year is suppressed and withholds next year's rate
--   a locality that went quiet reads 0.00
--   triangulation: share of respondents whose own country matches the registered locality
--   index_by_year carries scores only for years at/above critical_mass_gate
--   demo rows never appear in the live function, and vice versa
--   purge folds counts into retained_activity: the Insights are unchanged after it
--   collab_insights_for() is not callable by anon/authenticated
\set ON_ERROR_STOP 1

update platform_settings set value = '30'::jsonb  where key = 'critical_mass_gate';
update platform_settings set value = '5'::jsonb   where key = 'min_group_n';

insert into organisations (id, slug, name, region, country, is_demo) values
  ('00000000-0000-0000-0000-0000000000a1', 'org-za',   'Org ZA',   'Southern Africa', 'South Africa', false),
  ('00000000-0000-0000-0000-0000000000a2', 'org-br',   'Org BR',   'Latin America',   'Brazil',       false),
  ('00000000-0000-0000-0000-0000000000a3', 'org-demo', 'Org Demo', 'Europe',          'France',       true);
insert into instrument_versions (id, version, status) values ('00000000-0000-0000-0000-0000000000f1', 'v-smoke', 'active');
insert into campaigns (id, org_id, slug, instrument_version_id) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'default', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'default', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'default', '00000000-0000-0000-0000-0000000000f1');
-- ZA's org also runs a survey link registered to Namibia
insert into distribution_links (id, org_id, name, slug, registered_country) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Windhoek camp', 'windhoek', 'Namibia');

select 'S stamped from org', (select registered_country from campaigns where id = '00000000-0000-0000-0000-0000000000c1') = 'South Africa' as ok;
update organisations set country = 'Botswana' where id = '00000000-0000-0000-0000-0000000000a1';
select 'S kept after org moves', (select registered_country from campaigns where id = '00000000-0000-0000-0000-0000000000c1') = 'South Africa' as ok;
update organisations set country = 'South Africa' where id = '00000000-0000-0000-0000-0000000000a1';

-- 2024: ZA 50 started / 45 completed (en)   → baseline; 36 said "south africa ", 9 said "Lesotho" → match 0.80
--       BR  3 started /  3 completed (pt)   → suppressed (< 5)
-- 2025: ZA 30 started / 20 completed (en 20, zu 10) → retention 20/45 = 0.44
--       BR 12 started / 12 completed (pt)   → prev suppressed → no rate
--       NA  8 via the Windhoek link, completed → Namibia baseline
-- 2026: ZA none; BR 15 completed           → ZA 0.00; BR 15/12 → capped 1.00
-- demo: 2025 FR 99 sessions — must never appear in live
insert into sessions (campaign_id, locale, completed, created_at, country)
select '00000000-0000-0000-0000-0000000000c1', 'en', g <= 45, '2024-03-01'::timestamptz,
       case when g <= 36 then 'south africa ' when g <= 45 then 'Lesotho' end from generate_series(1, 50) g;
insert into sessions (campaign_id, locale, completed, created_at)
select '00000000-0000-0000-0000-0000000000c2', 'pt', true, '2024-05-01'::timestamptz from generate_series(1, 3) g;
insert into sessions (campaign_id, locale, completed, created_at)
select '00000000-0000-0000-0000-0000000000c1', case when g <= 20 then 'en' else 'zu' end, g <= 20, '2025-04-01'::timestamptz from generate_series(1, 30) g;
insert into sessions (campaign_id, locale, completed, created_at)
select '00000000-0000-0000-0000-0000000000c2', 'pt', true, '2025-06-01'::timestamptz from generate_series(1, 12) g;
insert into sessions (campaign_id, distribution_link_id, locale, completed, created_at, country)
select '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'en', true, '2025-07-01'::timestamptz, 'Namibia' from generate_series(1, 8) g;
insert into sessions (campaign_id, locale, completed, created_at)
select '00000000-0000-0000-0000-0000000000c2', 'pt', true, '2026-02-01'::timestamptz from generate_series(1, 15) g;
insert into sessions (campaign_id, locale, completed, created_at)
select '00000000-0000-0000-0000-0000000000c3', 'fr', true, '2025-06-01'::timestamptz from generate_series(1, 99) g;

insert into responses (session_id, item_key, normalized, tier, question_domain)
select id, 'q1', 75, 'formation', 'follow' from sessions where completed;

create temp view loc as
  select r ->> 'locality' locality, r -> 'cells' cells
    from jsonb_array_elements(collab_insights() -> 'locality_rates') r;

-- A. unpublished → nothing
select 'A unpublished', collab_insights() ->> 'published' = 'false' as ok,
       collab_insights() ? 'timeline' = false as no_data;

update platform_settings set value = 'true'::jsonb where key = 'publish_global_view';

-- B. timeline, countries, languages
select 'B timeline', collab_insights() -> 'timeline' =
  '[{"year":2024,"started":53,"completed":48},{"year":2025,"started":50,"completed":40},{"year":2026,"started":15,"completed":15}]'::jsonb as ok;
select 'B countries', collab_insights() -> 'countries_by_year' =
  '[{"year":2024,"countries":2},{"year":2025,"countries":3},{"year":2026,"countries":1}]'::jsonb as ok,
  (collab_insights() ->> 'countries_total')::int = 3 as total_ok;
select 'B languages', jsonb_path_query_array(collab_insights() -> 'languages_by_year', '$[*].languages') = '[2,3,1]'::jsonb as ok;

-- C. retention + suppression + triangulation
select 'C za 2024 baseline + match', (select cells -> '2024' from loc where locality = 'South Africa')
  = '{"n":45,"baseline":true,"answered":45,"match":0.80}'::jsonb as ok;
select 'C za 2025 retention', (select cells -> '2025' from loc where locality = 'South Africa') = '{"n":20,"prev_n":45,"rate":0.44}'::jsonb as ok;
select 'C za 2026 went quiet', (select cells -> '2026' from loc where locality = 'South Africa') = '{"n":0,"prev_n":20,"rate":0}'::jsonb as ok;
select 'C br 2024 suppressed', (select cells -> '2024' from loc where locality = 'Brazil') = '{"suppressed":true}'::jsonb as ok;
select 'C br 2025 withholds', (select cells -> '2025' from loc where locality = 'Brazil') = '{"n":12,"prev_suppressed":true}'::jsonb as ok;
select 'C br 2026 capped', (select cells -> '2026' from loc where locality = 'Brazil') = '{"n":15,"prev_n":12,"rate":1.00}'::jsonb as ok;
select 'C link locality wins', (select cells -> '2025' from loc where locality = 'Namibia') = '{"n":8,"baseline":true,"answered":8,"match":1.00}'::jsonb as ok,
       (select cells ? '2024' from loc where locality = 'Namibia') = false as no_year_before_first;
select 'C bands are config', collab_insights() #> '{locality,bands,healthy}' = '0.7'::jsonb as ok;

-- D. index_by_year: 2024 n=48, 2025 n=40, 2026 n=15 vs gate 30
select 'D 2024 scored', (collab_insights() #>> '{index_by_year,0,matrix,follow,formation}')::numeric = 4.0 as ok;
select 'D 2026 suppressed', collab_insights() #> '{index_by_year,2}' = '{"n":15,"year":2026,"suppressed":true}'::jsonb as ok;

-- E. space split
select 'E live has no France', not exists (select 1 from loc where locality = 'France') as ok;
select 'E demo has only France', collab_insights_demo() -> 'locality_rates' @> '[{"locality":"France"}]'
       and jsonb_array_length(collab_insights_demo() -> 'locality_rates') = 1 as ok;

-- F. the purge keeps the Insights whole
create temp table before_purge as select collab_insights() -> 'timeline' t, collab_insights() -> 'locality_rates' l,
  collab_insights() -> 'languages_by_year' g;
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin@collab.org') on conflict do nothing;
insert into app_users (id, email) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin@collab.org') on conflict (id) do nothing;
update app_users set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select 'F purge', purge_stale_respondent_data(0) ->> 'sessions_deleted';
reset request.jwt.claim.sub;
select 'F raw sessions gone', (select count(*) from sessions) = 0 as ok;
select 'F timeline unchanged', (select t from before_purge) = collab_insights() -> 'timeline' as ok;
select 'F locality unchanged', (select l from before_purge) = collab_insights() -> 'locality_rates' as ok;
select 'F languages unchanged', (select g from before_purge) = collab_insights() -> 'languages_by_year' as ok;

-- G. the shared body is not a public door
select 'G helper not granted',
       not has_function_privilege('anon', 'public.collab_insights_for(boolean)', 'execute')
   and not has_function_privilege('authenticated', 'public.collab_insights_for(boolean)', 'execute') as ok,
       has_function_privilege('anon', 'public.collab_insights()', 'execute') as wrapper_ok;
