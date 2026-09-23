-- Smoke test for migration 0034 (onboarding). Run by hand against a THROWAWAY database
-- with every migration applied and Supabase auth stubbed. Never against production.
-- NOTE: read results back in a separate statement — a SELECT in the same statement as
-- the change it checks sees the snapshot from before the change.
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a','admin@collab.org'),('bbbbbbbb-0000-0000-0000-00000000000b','pastor@shoreline.org'),('cccccccc-0000-0000-0000-00000000000c','lead@harbour.org'),('dddddddd-0000-0000-0000-00000000000d','someone@gmail.com');
update app_users set role='admin' where id='aaaaaaaa-0000-0000-0000-00000000000a';
insert into instrument_versions(version,status) values ('v4','active');
insert into waitlist_contacts(email,org_name,role) values ('pastor@shoreline.org','Shoreline Church','Youth pastor'),('new@later.org','Later Org','Lead');
insert into access_requests(email,reason) values ('x@y.org','please');
-- ADMIN PATH
set request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-00000000000a';
select 'apps', jsonb_array_length(admin_applications()->'join'), jsonb_array_length(admin_applications()->'access');
select 'create', admin_create_org('Shoreline Church','shoreline','pastor@shoreline.org','shoreline.org','South Africa','active',(select id from waitlist_contacts where email='pastor@shoreline.org'));
select 'create-uninvited', admin_create_org('Later Org','later','new@later.org','later.org');
select 'apps after', jsonb_array_length(admin_applications()->'join');
select 'update', admin_update_org('shoreline','{"brand_color":"#1f5f8b","country":"Kenya"}'::jsonb), (select country||' '||brand_color from organisations where short_name='shoreline');
select 'add', admin_add_member('shoreline','youth@shoreline.org','facilitator');
select 'team', admin_org_members('shoreline');
do $$ begin perform admin_create_org('Dup','shoreline','a@b.org'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'dup short name blocked: %', sqlerrm; end $$;
do $$ begin perform admin_update_org('shoreline','{"brand_color":"red"}'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'bad colour blocked'; end $$;
-- owner already had an account -> attached immediately
set request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-00000000000b';
select 'pastor ctx', my_context()->'orgs';
do $$ begin perform admin_applications(); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'non-admin blocked'; end $$;
-- INVITE ON FIRST SIGN-IN: new@later.org signs in for the first time now
insert into auth.users values ('eeeeeeee-0000-0000-0000-00000000000e','new@later.org');
set request.jwt.claim.sub='eeeeeeee-0000-0000-0000-00000000000e';
select 'before claim', jsonb_array_length(coalesce(my_context()->'orgs','[]'));
select 'claim', claim_my_invites();
select 'after claim', my_context()->'orgs'->0->>'slug';
select 'claim again', claim_my_invites();
-- SELF-SERVE
set request.jwt.claim.sub='cccccccc-0000-0000-0000-00000000000c';
select 'onboarding', my_onboarding();
do $$ begin perform self_serve_create_org('Harbour','harbour','othersite.org'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'domain mismatch blocked: %', sqlerrm; end $$;
select 'self-serve', self_serve_create_org('Harbour Youth','harbour','https://www.harbour.org/about','Brazil');
do $$ begin perform self_serve_create_org('Second','harbour2','harbour.org'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'second pending blocked: %', sqlerrm; end $$;
select 'harbour status', (select status from organisations where short_name='harbour');
-- pending org cannot collect
do $$ begin insert into sessions(campaign_id) select c.id from campaigns c join organisations o on o.id=c.org_id where o.short_name='harbour'; raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'pending org session blocked: %', sqlerrm; end $$;
set request.jwt.claim.sub='dddddddd-0000-0000-0000-00000000000d';
select 'gmail onboarding', my_onboarding()->>'free_mail';
do $$ begin perform self_serve_create_org('Mine','mine','gmail.com'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'free mail blocked'; end $$;
-- admin sees pending, activates, then sessions work
set request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-00000000000a';
select 'pending list', admin_applications()->'pending_orgs'->0->>'short_name';
select set_org_status('harbour','active');
insert into sessions(campaign_id) select c.id from campaigns c join organisations o on o.id=c.org_id where o.short_name='harbour';
select 'active org session ok';
select 'remove', admin_remove_member('shoreline','youth@shoreline.org');
select 'decline', admin_decline_application('access',(select id from access_requests limit 1)), (select status from access_requests limit 1);
