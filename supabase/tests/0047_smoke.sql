-- Smoke test for migration 0047 (non-followers: counted in completions,
-- scored apart). NOT a migration: THROWAWAY database only, every migration
-- applied, Supabase auth stubbed. Never run against production.
--
-- Fixture: followers answer 100 (→ 5.0 on the 1–5 scale), non-followers
-- answer 0 (→ 1.0). So any J12 figure that isn't exactly 5.0 has had a
-- non-follower's answer run into it.
--
-- Checked when 0047 was written (local Postgres 16, all 47 migrations):
--   A  house: completions = followers + non-followers, segmented; the J12 is
--      followers only; the Unengaged matrix unlocks at min_group_n
--   B  room: its own Unengaged matrix, unlocked at room_min_n — and locked
--      below it while the room's J12 still shows
--   C  trend, benchmark, Collab console and Collab trend: followers only
--   D  the demo preview reads the same core (completions, Unengaged matrix)
--   E  a share link carries the room's Unengaged matrix behind the same floor
--   F  a retention purge archives each branch apart; the trend reads only
--      the followers' archive
\set ON_ERROR_STOP 1
alter table public.sessions disable trigger sessions_refuse_without_consent;

insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','pastor@shoreline.org'),
  ('aaaaaaaa-1111-1111-1111-111111111111','admin@collab.org');
update app_users set role = 'admin' where id = 'aaaaaaaa-1111-1111-1111-111111111111';
insert into organisations(id,slug,name,country) values
  ('aaaaaaaa-0000-0000-0000-000000000001','shoreline','Shoreline Church','South Africa');
insert into organisations(id,slug,name,country,is_demo) values
  ('aaaaaaaa-0000-0000-0000-000000000009','sample-demo','Sample Demo','Kenya',true);
insert into org_members(org_id,user_id,role) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','org_admin');
insert into instrument_versions(id,version) values ('bbbbbbbb-0000-0000-0000-000000000001','v-smoke');
insert into campaigns(id,org_id,instrument_version_id) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000001');
insert into distribution_links(id,org_id,name,slug) values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Camp A','camp-a'),
  ('dddddddd-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Camp B','camp-b');

-- Camp A: 15 followers + 12 non-followers · Camp B: 15 followers + 4 non-followers
-- Demo org: 12 followers + 11 non-followers. All 2025.
create temp table fx (sid uuid, camp uuid, link uuid, branch text);
insert into fx select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'engaged'   from generate_series(1,15);
insert into fx select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'unengaged' from generate_series(1,12);
insert into fx select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'engaged'   from generate_series(1,15);
insert into fx select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'unengaged' from generate_series(1,4);
insert into fx select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000009', null, 'engaged'   from generate_series(1,12);
insert into fx select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000009', null, 'unengaged' from generate_series(1,11);
insert into sessions(id,campaign_id,completed,country,distribution_link_id,created_at)
  select sid, camp, true, 'Kenya', link, '2025-08-01' from fx;
insert into responses(session_id,item_key,normalized,tier,question_domain,branch)
  select fx.sid, 'k_'||d||t, case when fx.branch = 'unengaged' then 0 else 100 end, t, d, fx.branch
    from fx, unnest(array['exposure','response','formation','multiplication']) t, unnest(array['follow','mission','world']) d;

-- A. house -------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare h jsonb := org_dashboard_season('shoreline', null, null); begin
  if h->'completions' <> '{"total": 46, "following": 30, "not_following": 16}'::jsonb then raise exception 'FAIL A completions %', h->'completions'; end if;
  if (h->>'n')::int <> 30 then raise exception 'FAIL A the J12''s n must stay followers only: %', h->>'n'; end if;
  if (h->>'index')::numeric <> 5.0 or (h->'matrix'->'follow'->>'exposure')::numeric <> 5.0 then raise exception 'FAIL A non-followers ran into the J12: %', h->'matrix'; end if;
  if (h->>'exploration_suppressed')::boolean or (h->>'exploration_index')::numeric <> 1.0 then raise exception 'FAIL A Unengaged matrix: %', h; end if;
  if (h->>'exploration_min_n')::int <> 10 then raise exception 'FAIL A floor'; end if;
  raise notice 'A ok';
end $$;

-- B. rooms ------------------------------------------------------------------
do $$ declare a jsonb := org_link_dashboard('shoreline','dddddddd-0000-0000-0000-000000000001');
             b jsonb := org_link_dashboard('shoreline','dddddddd-0000-0000-0000-000000000002'); begin
  if a->'completions' <> '{"total": 27, "following": 15, "not_following": 12}'::jsonb then raise exception 'FAIL B completions %', a->'completions'; end if;
  if (a->>'index')::numeric <> 5.0 then raise exception 'FAIL B room J12 %', a->>'index'; end if;
  if (a->>'exploration_suppressed')::boolean or (a->'exploration_matrix'->'world'->>'formation')::numeric <> 1.0 then raise exception 'FAIL B room Unengaged %', a; end if;
  if not (b->>'exploration_suppressed')::boolean or b->'exploration_matrix' <> '{}'::jsonb or b->>'exploration_index' is not null then raise exception 'FAIL B 4 non-followers unlocked a matrix: %', b; end if;
  if (b->>'suppressed')::boolean or (b->>'index')::numeric <> 5.0 then raise exception 'FAIL B room B J12 should still show'; end if;
  if (b->'completions'->>'total')::int <> 19 then raise exception 'FAIL B room B total'; end if;
  raise notice 'B ok';
end $$;

-- C. every other score: followers only ---------------------------------------
do $$ begin
  if exists (select 1 from jsonb_array_elements(blended_trend('aaaaaaaa-0000-0000-0000-000000000001', false)) t where (t->>'index')::numeric <> 5.0) then
    raise exception 'FAIL C org trend blended: %', blended_trend('aaaaaaaa-0000-0000-0000-000000000001', false);
  end if;
  if exists (select 1 from jsonb_array_elements(blended_trend(null, true)) t where (t->>'index')::numeric <> 5.0) then
    raise exception 'FAIL C demo-space trend blended';
  end if;
  if (select prosrc from pg_proc where proname = 'org_benchmark') !~ 'distinct from ''unengaged''' then raise exception 'FAIL C benchmark'; end if;
  if (select prosrc from pg_proc where proname = 'network_console') !~ 'distinct from ''unengaged''' then raise exception 'FAIL C network'; end if;
  raise notice 'C ok';
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-1111-1111-1111-111111111111';
do $$ declare a jsonb := org_dashboard_admin('shoreline'); begin
  if (a->'tiers'->>'formation')::numeric <> 5.0 then raise exception 'FAIL C admin view blended: %', a->'tiers'; end if;
  raise notice 'C ok (admin)';
end $$;

-- D. demo preview = the product ---------------------------------------------
reset request.jwt.claim.sub;
set role anon;
do $$ declare d jsonb := org_dashboard_demo('sample-demo'); begin
  if not (d->>'demo')::boolean then raise exception 'FAIL D demo flag'; end if;
  if d->'completions' <> '{"total": 23, "following": 12, "not_following": 11}'::jsonb then raise exception 'FAIL D completions %', d->'completions'; end if;
  if (d->>'index')::numeric <> 5.0 or (d->>'exploration_index')::numeric <> 1.0 then raise exception 'FAIL D scores %', d; end if;
  raise notice 'D ok';
end $$;
reset role;

-- E. share link: the room's Unengaged matrix, same floor --------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select set_config('smoke.ta', create_share_link('shoreline','A','dddddddd-0000-0000-0000-000000000001') ->> 'token', false) \g /dev/null
select set_config('smoke.tb', create_share_link('shoreline','B','dddddddd-0000-0000-0000-000000000002') ->> 'token', false) \g /dev/null
reset request.jwt.claim.sub;
set role anon;
do $$ declare a jsonb := shared_dashboard(current_setting('smoke.ta'))->'dashboard';
             b jsonb := shared_dashboard(current_setting('smoke.tb'))->'dashboard'; begin
  if (a->>'exploration_index')::numeric <> 1.0 or (a->'completions'->>'not_following')::int <> 12 then raise exception 'FAIL E room A %', a; end if;
  if not (b->>'exploration_suppressed')::boolean or b->'exploration_matrix' <> '{}'::jsonb then raise exception 'FAIL E room B unlocked'; end if;
  raise notice 'E ok';
end $$;
reset role;

-- F. retention purge keeps the branches apart --------------------------------
update platform_settings set value = '1'::jsonb where key = 'respondent_retention_months';
update sessions set created_at = '2020-08-01' where campaign_id = 'cccccccc-0000-0000-0000-000000000001';
set request.jwt.claim.sub = 'aaaaaaaa-1111-1111-1111-111111111111';
select purge_stale_respondent_data() \g /dev/null
reset request.jwt.claim.sub;
do $$ begin
  if (select count(distinct branch) from retained_aggregates where org_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FAIL F archive did not keep the branches apart';
  end if;
  if (select ngjfi_to_5(mean) from retained_aggregates where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
        and branch = 'index' and question_domain = 'follow' and tier = 'formation') <> 5.0 then
    raise exception 'FAIL F archived J12 blended';
  end if;
  if exists (select 1 from jsonb_array_elements(blended_trend('aaaaaaaa-0000-0000-0000-000000000001', false)) t where (t->>'index')::numeric <> 5.0) then
    raise exception 'FAIL F trend read the non-followers'' archive';
  end if;
  raise notice 'F ok';
end $$;

select 'ALL 0047 CHECKS PASSED' as result;
