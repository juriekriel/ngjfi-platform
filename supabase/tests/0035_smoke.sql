-- Smoke test for migration 0035 (instrument proposals). THROWAWAY database only.
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a','admin@collab.org'),('bbbbbbbb-0000-0000-0000-00000000000b','research@collab.org'),('cccccccc-0000-0000-0000-00000000000c','pastor@shoreline.org');
update app_users set role='admin' where id='aaaaaaaa-0000-0000-0000-00000000000a';
update app_users set role='collab' where id='bbbbbbbb-0000-0000-0000-00000000000b';
set request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-00000000000b';
select 'propose', propose_instrument_change('v4','pray_frequency','wording','Say "talk with God" instead of "pray to God"','Younger respondents read "pray" as formal', null) ? 'id';
select 'propose new', propose_instrument_change('v4',null,'new_item','Add a Sabbath/rest item','Gap in formation') ? 'id';
select 'list', jsonb_array_length(list_instrument_changes()), list_instrument_changes()->0->>'proposed_by';
do $$ begin perform decide_instrument_change((select id from instrument_change_requests limit 1),'accepted'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'collab cannot decide: ok'; end $$;
set request.jwt.claim.sub='cccccccc-0000-0000-0000-00000000000c';
do $$ begin perform list_instrument_changes(); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'org member cannot read proposals: ok'; end $$;
do $$ begin perform propose_instrument_change('v4','x','wording','y'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'org member cannot propose: ok'; end $$;
set request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-00000000000a';
select decide_instrument_change((select id from instrument_change_requests where item_key='pray_frequency'),'accepted','Take to researchers Oct 7');
do $$ begin perform propose_instrument_change('v4','x','bogus','y'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm like 'SHOULD%' then raise; end if; raise notice 'bad kind blocked: ok'; end $$;
