-- Smoke test for 0042 (pilot safeguards). THROWAWAY database only, with every
-- migration applied and Supabase's auth schema stubbed. Never run against
-- production — it inserts fixture rows.
--
-- Checks:
--   A  a live organisation that has not attested cannot start a session
--   A  test links still work before attestation
--   A  a facilitator cannot attest; an org admin can; a stale statement version is refused
--   A  attestation is logged, and the organisation then collects
--   B  discard_session deletes an in-progress session and its answers
--   B  a completed session cannot be discarded; a repeated discard is a no-op
--   C  emails, phones, URLs and @handles are redacted from free text, city and country
--   C  option codes and age bands are untouched
--   D  purge refuses until a retention period is set, and refuses to go below it
--   E  pilot_readiness is admin-only and reports unattested organisations
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin@collab.org'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'pastor@church.org'),
  ('cccccccc-0000-0000-0000-00000000000c', 'helper@church.org');
update app_users set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
insert into instrument_versions (id, version, status) values ('bbbbbbbb-1111-0000-0000-000000000001', 'v-smoke', 'active');
insert into items (instrument_version_id, key, question_domain, tier, type, scored, ord, scale) values
  ('bbbbbbbb-1111-0000-0000-000000000001', 'q1', 'follow', 'exposure', 'likert_5', true, 1, '{"points":5}'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'who_is_jesus', 'screener', 'na', 'open_text', false, 2, null),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'orientation', 'screener', 'na', 'single_select', false, 3, null);

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select admin_create_org('Church Test', 'church-test', 'pastor@church.org');
reset request.jwt.claim.sub;
update organisations set status = 'active' where short_name = 'church-test';
insert into org_members (org_id, user_id, role)
  select id, 'cccccccc-0000-0000-0000-00000000000c', 'facilitator' from organisations where short_name = 'church-test'
  on conflict do nothing;
select id as camp from campaigns where org_id = (select id from organisations where short_name = 'church-test') and slug = 'default' \gset

-- A. unattested live org: refused
do $$ begin
  perform start_session((select id from campaigns where org_id = (select id from organisations where short_name = 'church-test') and slug = 'default'));
  raise exception 'FAIL: unattested org accepted a session';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'A refused before attestation: %', sqlerrm;
end $$;

-- A. but a test link still works
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
select upsert_distribution_link('church-test', 'Try it', 'try-it') ->> 'id' as test_link \gset
select set_link_test('church-test', :'test_link', true);
reset request.jwt.claim.sub;
select start_session(:'camp', null, null, 'en', null, 'try-it') as tsid \gset
select 'A test link before attestation', exists (select 1 from test_sessions where id = :'tsid') as ok;

-- A. facilitator refused, stale version refused, admin of the org accepted
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-00000000000c';
do $$ begin
  perform attest_edge_consent('church-test', '2026-10-v1');
  raise exception 'FAIL: facilitator attested';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'A facilitator refused: %', sqlerrm;
end $$;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
do $$ begin
  perform attest_edge_consent('church-test', 'old-version');
  raise exception 'FAIL: stale version accepted';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'A stale version refused: %', sqlerrm;
end $$;
select 'A attest', (attest_edge_consent('church-test', '2026-10-v1') ->> 'attested')::boolean as ok;
select 'A logged', exists (select 1 from campaign_action_log where action = 'attest_edge_consent') as ok;
reset request.jwt.claim.sub;

-- A. now it collects
select start_session(:'camp') as sid \gset
select save_response(:'sid', 'q1', '4'::jsonb);
select 'A collects after attestation', (select count(*) from responses where session_id = :'sid') = 1 as ok;

-- B. discard an in-progress session
select discard_session(:'sid');
select 'B discarded session', not exists (select 1 from sessions where id = :'sid') as ok;
select 'B discarded answers', not exists (select 1 from responses where session_id = :'sid') as ok;
select discard_session(:'sid');
select 'B repeat discard is a no-op', true as ok;
select discard_session(:'tsid');
select 'B discards a test session too', not exists (select 1 from test_sessions where id = :'tsid') as ok;

select start_session(:'camp') as sid2 \gset
select finish_session(:'sid2');
do $$ declare v uuid; begin
  select id into v from sessions where completed limit 1;
  perform discard_session(v);
  raise exception 'FAIL: completed session discarded';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'B completed session protected: %', sqlerrm;
end $$;

-- C. redaction
select start_session(:'camp') as sid3 \gset
select save_response(:'sid3', 'who_is_jesus',
  to_jsonb('He is my friend. Email me at thabo.m@gmail.com or call +27 82 555 1234, insta @thabo_m, see https://x.com/t'::text));
select save_response(:'sid3', 'orientation', '"committed_growing"'::jsonb);
select set_session_context(:'sid3', 'city', 'Soweto 011-555-0199');
select set_session_context(:'sid3', 'age_band', '13_17');
select 'C text', raw_value #>> '{}' as redacted from responses where session_id = :'sid3' and item_key = 'who_is_jesus';
select 'C no email',  (select raw_value #>> '{}' from responses where session_id = :'sid3' and item_key = 'who_is_jesus') not like '%@gmail%' as ok;
select 'C no phone',  (select raw_value #>> '{}' from responses where session_id = :'sid3' and item_key = 'who_is_jesus') !~ '[0-9]{3}' as ok;
select 'C no url',    (select raw_value #>> '{}' from responses where session_id = :'sid3' and item_key = 'who_is_jesus') not like '%x.com%' as ok;
select 'C no handle', (select raw_value #>> '{}' from responses where session_id = :'sid3' and item_key = 'who_is_jesus') not like '%thabo_m%' as ok;
select 'C prose kept', (select raw_value #>> '{}' from responses where session_id = :'sid3' and item_key = 'who_is_jesus') like 'He is my friend.%' as ok;
select 'C option untouched', (select raw_value #>> '{}' from responses where session_id = :'sid3' and item_key = 'orientation') = 'committed_growing' as ok;
select 'C city redacted', (select city from sessions where id = :'sid3') = 'Soweto [removed]' as ok;
select 'C age band untouched', (select age_band from sessions where id = :'sid3') = '13_17' as ok;

-- D. retention
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$ begin
  perform purge_stale_respondent_data();
  raise exception 'FAIL: purge ran with no retention decision';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'D purge refused without a decision: %', sqlerrm;
end $$;
update platform_settings set value = '36'::jsonb where key = 'respondent_retention_months';
do $$ begin
  perform purge_stale_respondent_data(12);
  raise exception 'FAIL: purge went below the policy';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'D purge below policy refused: %', sqlerrm;
end $$;
select 'D purge at policy runs', (purge_stale_respondent_data() ->> 'sessions_deleted')::int = 0 as ok;
update platform_settings set value = 'null'::jsonb where key = 'respondent_retention_months';

-- E. readiness
select 'E readiness shape', jsonb_array_length(pilot_readiness() -> 'checks') >= 5 as ok;
reset request.jwt.claim.sub;
insert into organisations (slug, name, status, is_demo) values ('second-church', 'Second Church', 'active', false);
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select 'E flags unattested', (select c ->> 'detail' from jsonb_array_elements(pilot_readiness() -> 'checks') c
                               where c ->> 'check' like '%attested%') like '%second-church%' as ok;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
do $$ begin
  perform pilot_readiness();
  raise exception 'FAIL: non-admin ran readiness';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'E non-admin refused: %', sqlerrm;
end $$;
reset request.jwt.claim.sub;

-- F. rooms never name a small place; resolve reports test links
update platform_settings set value = '3'::jsonb where key = 'min_group_n';
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
select upsert_distribution_link('church-test', 'Camp', 'camp') ->> 'id' as camp_link \gset
reset request.jwt.claim.sub;
do $$ declare v uuid; i int; c uuid := (select id from campaigns where org_id = (select id from organisations where short_name = 'church-test') and slug = 'default');
begin
  for i in 1..3 loop  -- three from a bigger place
    v := start_session(c, null, null, 'en', null, 'camp');
    perform set_session_context(v, 'city', 'Johannesburg'); perform set_session_context(v, 'country', 'South Africa');
    perform finish_session(v);
  end loop;
  v := start_session(c, null, null, 'en', null, 'camp');  -- one from a tiny town
  perform set_session_context(v, 'city', 'Tinytown'); perform set_session_context(v, 'country', 'South Africa');
  perform finish_session(v);
end $$;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
select 'F big place named', (select l -> 'places' from jsonb_array_elements(org_distribution_links('church-test')) l where l ->> 'slug' = 'camp') ? 'Johannesburg, South Africa' as ok;
select 'F small place hidden', not ((select l -> 'places' from jsonb_array_elements(org_distribution_links('church-test')) l where l ->> 'slug' = 'camp')::text like '%Tinytown%') as ok;
select 'F room still counts everyone', (select (l ->> 'n')::int from jsonb_array_elements(org_distribution_links('church-test')) l where l ->> 'slug' = 'camp') = 4 as ok;
reset request.jwt.claim.sub;
select 'F resolve is_test', (resolve_distribution_link('church-test', 'try-it') ->> 'is_test')::boolean
                        and not (resolve_distribution_link('church-test', 'camp') ->> 'is_test')::boolean as ok;
update platform_settings set value = '10'::jsonb where key = 'min_group_n';
