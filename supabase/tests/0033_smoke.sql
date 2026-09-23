-- Smoke test for migration 0033 (rooms scoring, reach, consulting requests).
-- NOT a migration: run by hand against a THROWAWAY database that has every
-- migration applied, with Supabase's auth schema stubbed. Never run against
-- production — it inserts fixture rows.
--
-- Checked when 0033 was written (local Postgres 16, all 33 migrations):
--   room with 12 completions → scored; room with 3 → suppressed (room_min_n 10)
--   org_reach_countries → only countries with ≥ min_group_n completions
--   submit_consulting_question → unknown context keys stripped; 2-arg call still works
--   org member cannot list requests; non-member cannot read a room or submit
--   Collab can list (with asker email), assign (→ assigned), mark answered
\set ON_ERROR_STOP 1
update app_users set role = 'collab' where id = '22222222-2222-2222-2222-222222222222';
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111','pastor@shoreline.org'),('22222222-2222-2222-2222-222222222222','research@collab.org'),('33333333-3333-3333-3333-333333333333','other@else.org');
update app_users set role='collab' where id='22222222-2222-2222-2222-222222222222';
insert into organisations(id,slug,name,country) values ('aaaaaaaa-0000-0000-0000-000000000001','shoreline','Shoreline Church','South Africa');
insert into org_members(org_id,user_id) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
insert into instrument_versions(id,version) values ('bbbbbbbb-0000-0000-0000-000000000001','v4');
insert into campaigns(id,org_id,instrument_version_id) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001');
insert into distribution_links(id,org_id,name,slug) values ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Kenya team','kenya'),('dddddddd-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Tiny','tiny');
-- 12 completed sessions through kenya link, 3 through tiny
insert into sessions(id,campaign_id,completed,country,distribution_link_id)
 select gen_random_uuid(),'cccccccc-0000-0000-0000-000000000001'::uuid,true, 'Kenya', 'dddddddd-0000-0000-0000-000000000001'::uuid from generate_series(1,12)
 union all select gen_random_uuid(),'cccccccc-0000-0000-0000-000000000001'::uuid,true,'Chad','dddddddd-0000-0000-0000-000000000002'::uuid from generate_series(1,3);
insert into responses(session_id,item_key,normalized,tier,question_domain)
 select s.id, 'k_'||d||t, 40+random()*50, t, d from sessions s, unnest(array['exposure','response','formation','multiplication']) t, unnest(array['follow','mission','world']) d;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'room ok', (x->>'n'), (x->>'suppressed'), (x->>'index') is not null, jsonb_typeof(x->'matrix') from (select org_link_dashboard('shoreline','dddddddd-0000-0000-0000-000000000001') x) q;
select 'room tiny', (x->>'n'), (x->>'suppressed'), x->>'index' from (select org_link_dashboard('shoreline','dddddddd-0000-0000-0000-000000000002') x) q;
select 'reach', org_reach_countries('shoreline');
select 'submit', submit_consulting_question('shoreline','Why does Multiplication drop?', '{"tab":"org","view":"matrix","overlay":true,"evil":{"rows":[1,2]},"summary":"x"}'::jsonb) ? 'id';
select 'submit-2arg', submit_consulting_question('shoreline','Two arg still works') ? 'id';
select 'ctx stored', context from consulting_questions order by created_at limit 1;
do $$ begin perform list_consulting_questions(); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'org cannot list: ok'; end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin perform org_link_dashboard('shoreline','dddddddd-0000-0000-0000-000000000001'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'non-member blocked: ok'; end $$;
do $$ begin perform submit_consulting_question('shoreline','hi'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'non-member submit blocked: ok'; end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'list', jsonb_array_length(list_consulting_questions()), list_consulting_questions()->0->>'requested_by', list_consulting_questions()->0->>'status';
select 'assign', update_consulting_question((select id from consulting_questions order by created_at limit 1), null, 'Facilitator A');
select 'answer', update_consulting_question((select id from consulting_questions order by created_at limit 1), 'answered', null);
