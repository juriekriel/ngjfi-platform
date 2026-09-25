-- Smoke test for 0038 (test links, admin deletion). THROWAWAY database only. Read counts in separate statements (same-statement snapshot).
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a','admin@collab.org'),('bbbbbbbb-0000-0000-0000-00000000000b','pastor@church.org');
update app_users set role='admin' where id='aaaaaaaa-0000-0000-0000-00000000000a';
insert into instrument_versions(id,version,status) values ('bbbbbbbb-1111-0000-0000-000000000001','v4','active');
insert into items(instrument_version_id,key,question_domain,tier,type,scored,ord,scale) values ('bbbbbbbb-1111-0000-0000-000000000001','q1','follow','exposure','likert_5',true,1,'{"points":5}');
set request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-00000000000a';
select admin_create_org('Church Test','church-test','pastor@church.org');
set request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-00000000000b';
select upsert_distribution_link('church-test','Demo for leaders','demo-test') ->> 'id' as test_link \gset
select upsert_distribution_link('church-test','Youth night','youth') ->> 'id' as real_link \gset
select 'mark test', set_link_test('church-test', :'test_link', true);
-- a respondent answers through the TEST link
select start_session((select id from campaigns c where c.org_id=(select id from organisations where short_name='church-test') and slug='default'), '18_22', 'South Africa', 'en', null, 'demo-test') as tsid \gset
select save_response(:'tsid', 'q1', '4'::jsonb);
select set_session_context(:'tsid', 'age_band', '18_22');
select finish_session(:'tsid');
-- and one through the REAL link
select start_session((select id from campaigns c where c.org_id=(select id from organisations where short_name='church-test') and slug='default'), null, null, 'en', null, 'youth') as rsid \gset
select save_response(:'rsid', 'q1', '5'::jsonb);
