-- Smoke test for 0037 (logo uploads). THROWAWAY database only, with a stand-in storage schema (see the note in the PR). Run as the authenticated role so RLS applies.
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a','admin@collab.org'),('bbbbbbbb-0000-0000-0000-00000000000b','ulalom@gmail.com'),('cccccccc-0000-0000-0000-00000000000c','other@else.org'),('dddddddd-0000-0000-0000-00000000000d','helper@church.org');
update app_users set role='admin' where id='aaaaaaaa-0000-0000-0000-00000000000a';
insert into instrument_versions(version,status) values ('v4','active');
set request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-00000000000a';
select admin_create_org('Church Test','church-test','ulalom@gmail.com');
select admin_create_org('Other Org','other-org','other@else.org');
select admin_add_member('church-test','helper@church.org','facilitator');
select 'bucket', id||' public='||public||' limit='||file_size_limit||' types='||array_to_string(allowed_mime_types,',') from storage.buckets;
\set ct `echo`
-- then, with :CT set to Church Test's id:
set role authenticated;
-- Church Test's admin uploads into Church Test's folder
set request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-00000000000b';
insert into storage.objects(bucket_id,name) values ('org-logos','ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-1.png');
select 'admin upload: ok';
select 'settings id matches folder', (org_settings('church-test')->>'id') = 'cfae9be6-2fcc-4b58-9190-8dd5c7c056cc';
update storage.objects set name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png' where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-1.png';
select 'admin replace: ' || (select count(*) from storage.objects where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png');
-- another org's admin tries Church Test's folder
set request.jwt.claim.sub='cccccccc-0000-0000-0000-00000000000c';
do $$ begin insert into storage.objects(bucket_id,name) values ('org-logos','ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/evil.png'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'other org blocked: %', sqlerrm; end $$;
delete from storage.objects where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png';
-- a facilitator on Church Test (not an admin)
set request.jwt.claim.sub='dddddddd-0000-0000-0000-00000000000d';
do $$ begin insert into storage.objects(bucket_id,name) values ('org-logos','ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/f.png'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'facilitator blocked'; end $$;
-- a path that isn't an organisation folder
set request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-00000000000b';
do $$ begin insert into storage.objects(bucket_id,name) values ('org-logos','../logo.png'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'bad path blocked'; end $$;
-- signed out
reset request.jwt.claim.sub;
do $$ begin insert into storage.objects(bucket_id,name) values ('org-logos','ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/anon.png'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'signed-out blocked'; end $$;
reset role;
select 'survives other org delete attempt: ' || (select count(*) from storage.objects where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png');
set role authenticated; set request.jwt.claim.sub='cccccccc-0000-0000-0000-00000000000c';
delete from storage.objects where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png';
reset role; select 'after other org delete attempt, Church Test logo still there: ' || (select count(*) from storage.objects where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png');
set role authenticated; set request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-00000000000b';
delete from storage.objects where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png';
reset role; select 'own admin removes it: ' || (select count(*) = 0 from storage.objects where name='ebc0afb4-5aeb-4c77-bead-4bfcfc47e7c9/logo-2.png');
