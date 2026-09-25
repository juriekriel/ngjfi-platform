-- Smoke test for 0036. THROWAWAY database only. Part A reproduces the public-link bug; part B checks the fix and org settings.
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a','admin@collab.org'),('bbbbbbbb-0000-0000-0000-00000000000b','ulalom@gmail.com'),('cccccccc-0000-0000-0000-00000000000c','viewer@x.org');
update app_users set role='admin' where id='aaaaaaaa-0000-0000-0000-00000000000a';
insert into instrument_versions(version,status) values ('v4','active');
set request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-00000000000a';
select admin_create_org('Church Test','church-test','ulalom@gmail.com',null,'South Africa');
insert into distribution_links(org_id,name,slug,audience,active_from,active_to) select id,'WOL camp','wol-camp','public',now()-interval '1 hour',now()+interval '2 days' from organisations where short_name='church-test';
\set ON_ERROR_STOP 1
set request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-00000000000a';
select admin_create_org('New Org','new-org','viewer@x.org');
select 'new org campaigns', string_agg(c.slug, ',' order by c.slug) from campaigns c join organisations o on o.id=c.org_id where o.short_name='new-org';
-- a real public session on the WOL camp link
select 'session on public link', start_session((select c.id from campaigns c join organisations o on o.id=c.org_id where o.short_name='church-test' and c.slug='open'), null, null, 'en', null, 'wol-camp') is not null;
-- org admin edits settings
set request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-00000000000b';
select 'settings', org_settings('church-test')->>'can_edit', org_settings('church-test')->>'item_set';
select org_update_settings('church-test','{"name":"Church Test SA","brand_color":"#7c3aed","logo_url":"https://example.org/logo.png","welcome_message":"Welcome, camp!"}');
select org_set_duration('church-test','core');
do $$ begin perform org_update_settings('church-test','{"logo_url":"http://insecure.org/x.png"}'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'http logo blocked'; end $$;
do $$ begin perform org_update_settings('church-test','{"brand_color":"purple"}'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'bad colour blocked'; end $$;
-- a non-member cannot
set request.jwt.claim.sub='cccccccc-0000-0000-0000-00000000000c';
do $$ begin perform org_update_settings('church-test','{"name":"Hacked"}'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'non-member blocked'; end $$;
