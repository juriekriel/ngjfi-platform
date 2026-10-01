-- Smoke test for migration 0046 (view-only share links). NOT a migration:
-- run by hand against a THROWAWAY database with every migration applied and
-- Supabase's auth schema stubbed (auth.users, auth.uid() reading
-- request.jwt.claim.sub, roles anon/authenticated). Never run against
-- production — it inserts fixture rows. Fails loudly (ON_ERROR_STOP) on the
-- first broken expectation.
--
-- Checked when 0046 was written (local Postgres 16, all 46 migrations):
--   A  coordinator + org admin can create; an outsider can't; test links, bad
--      day counts and empty names are refused; the token is returned once
--   B  anon reads a house link: own matrix + n; no Collab figure anywhere;
--      a room below room_min_n shows its count only; a room has no detail
--   C  revoked, expired and malformed tokens all answer 'unavailable'
--   D  passcode: required → wrong → locks after N failures → stays locked
--      even for the right passcode → opens once the lock has passed
--   E  show_detail = false strips per-item rows, insights and trend
--   F  map: country colours are exactly collab_intelligence()'s (all data per
--      country, the publish switch, the 2,000 gate); outlines at the scope's floor
--   G  list has no tokens; another org's admin can't revoke; revoking works
--   H  deleting a room deletes its share links (never widens to the house)
--   I  anon can't call the internal cores; trend drops years below the floor
\set ON_ERROR_STOP 1
alter table public.sessions disable trigger sessions_refuse_without_consent;

insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','pastor@shoreline.org'),
  ('22222222-2222-2222-2222-222222222222','coord@shoreline.org'),
  ('33333333-3333-3333-3333-333333333333','admin@elsewhere.org');
insert into organisations(id,slug,name,country) values
  ('aaaaaaaa-0000-0000-0000-000000000001','shoreline','Shoreline Church','South Africa'),
  ('aaaaaaaa-0000-0000-0000-000000000002','elsewhere','Elsewhere','Kenya');
insert into org_members(org_id,user_id,role) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','org_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','coordinator'),
  ('aaaaaaaa-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333','org_admin');
insert into instrument_versions(id,version) values ('bbbbbbbb-0000-0000-0000-000000000001','v-smoke');
insert into campaigns(id,org_id,instrument_version_id) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001');
insert into distribution_links(id,org_id,name,slug) values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Kenya team','kenya'),
  ('dddddddd-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Tiny camp','tiny');
insert into distribution_links(id,org_id,name,slug,is_test) values
  ('dddddddd-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','Try it','try',true);
-- 30 via kenya (Kenya, 2025) · 3 via tiny (Chad, 2025) · 12 house (Ghana, 2024) · 4 house (Ghana, 2023)
insert into sessions(id,campaign_id,completed,country,distribution_link_id,created_at)
  select gen_random_uuid(),'cccccccc-0000-0000-0000-000000000001'::uuid,true,'Kenya','dddddddd-0000-0000-0000-000000000001'::uuid,'2025-08-01'::timestamptz from generate_series(1,30)
  union all select gen_random_uuid(),'cccccccc-0000-0000-0000-000000000001'::uuid,true,'Chad','dddddddd-0000-0000-0000-000000000002'::uuid,'2025-08-01' from generate_series(1,3)
  union all select gen_random_uuid(),'cccccccc-0000-0000-0000-000000000001'::uuid,true,'Ghana',null,'2024-08-01' from generate_series(1,12)
  union all select gen_random_uuid(),'cccccccc-0000-0000-0000-000000000001'::uuid,true,'Ghana',null,'2023-08-01' from generate_series(1,4);
insert into responses(session_id,item_key,normalized,tier,question_domain)
  select s.id, 'k_'||d||t, 40+random()*50, t, d
    from sessions s, unnest(array['exposure','response','formation','multiplication']) t, unnest(array['follow','mission','world']) d;

-- A. create -----------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';  -- coordinator
select create_share_link('shoreline', 'Field leaders', null, 30) ->> 'token' as house_tok \gset
select create_share_link('shoreline', 'Kenya leaders', 'dddddddd-0000-0000-0000-000000000001', 30, null, true, true) ->> 'token' as room_tok \gset
select create_share_link('shoreline', 'Tiny', 'dddddddd-0000-0000-0000-000000000002') ->> 'token' as tiny_tok \gset
select create_share_link('shoreline', 'Board', null, 30, '  4821  ') ->> 'token' as pass_tok \gset
select create_share_link('shoreline', 'Headline only', null, 30, null, false, false) ->> 'token' as lean_tok \gset
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';  -- org admin can too
select create_share_link('shoreline', 'To revoke') ->> 'token' as rev_tok \gset
select set_config('smoke.house_tok', :'house_tok', false), set_config('smoke.room_tok', :'room_tok', false),
       set_config('smoke.tiny_tok', :'tiny_tok', false), set_config('smoke.pass_tok', :'pass_tok', false),
       set_config('smoke.lean_tok', :'lean_tok', false), set_config('smoke.rev_tok', :'rev_tok', false) \g /dev/null

do $$
begin
  -- outsider
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  begin perform create_share_link('shoreline', 'x'); raise exception 'FAIL: outsider created a link';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  begin perform create_share_link('shoreline', 'x', 'dddddddd-0000-0000-0000-000000000003'); raise exception 'FAIL: test link shared';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform create_share_link('shoreline', 'x', null, 400); raise exception 'FAIL: 400 days accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform create_share_link('shoreline', '   '); raise exception 'FAIL: empty name accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform create_share_link('shoreline', 'x', null, 30, '12'); raise exception 'FAIL: 2-char passcode accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  if exists (select 1 from share_links where token_hash ~ '^[0-9a-f]{64}$' is not true) then
    raise exception 'FAIL: a token_hash is not a sha256';
  end if;
  raise notice 'A ok';
end $$;

-- B. anon reads -------------------------------------------------------------
reset request.jwt.claim.sub;
set role anon;
select shared_dashboard(:'house_tok') as house \gset
select shared_dashboard(:'room_tok')  as room \gset
select shared_dashboard(:'tiny_tok')  as tiny \gset
reset role;
select set_config('smoke.house', :'house', false), set_config('smoke.room', :'room', false),
       set_config('smoke.tiny', :'tiny', false) \g /dev/null
do $$
declare h jsonb := current_setting('smoke.house')::jsonb;
        r jsonb := current_setting('smoke.room')::jsonb;
        t jsonb := current_setting('smoke.tiny')::jsonb;
begin
  if h->>'status' <> 'ok' then raise exception 'FAIL B house status %', h->>'status'; end if;
  if (h->'dashboard'->>'n')::int <> 49 then raise exception 'FAIL B house n %', h->'dashboard'->>'n'; end if;
  if h->'dashboard'->'matrix'->'follow'->>'exposure' is null then raise exception 'FAIL B house matrix empty'; end if;
  if (h->'dashboard')::text ~* '(collab|benchmark|compare|baseline)' then raise exception 'FAIL B Collab data on the org figures: %', h; end if;
  if h->'dashboard' ? 'org' or h->'dashboard' ? 'season' then raise exception 'FAIL B internal keys left in'; end if;
  if r->'scope'->>'kind' <> 'room' or (r->'dashboard'->>'n')::int <> 30 then raise exception 'FAIL B room %', r; end if;
  if r->'dashboard' ? 'items' or (r->>'show_detail')::boolean then raise exception 'FAIL B room has detail'; end if;
  if not (t->'dashboard'->>'suppressed')::boolean or t->'dashboard'->>'index' is not null
     or (t->'dashboard'->>'n')::int <> 3 then raise exception 'FAIL B tiny room not suppressed: %', t; end if;
  raise notice 'B ok';
end $$;

-- C. unavailable ------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select revoke_share_link('shoreline', (select id from share_links where label = 'To revoke'));
update share_links set expires_at = now() - interval '1 minute' where label = 'Tiny';
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  if shared_dashboard(current_setting('smoke.rev_tok'))->>'status' <> 'unavailable' then raise exception 'FAIL C revoked'; end if;
  if shared_dashboard(current_setting('smoke.tiny_tok'))->>'status' <> 'unavailable' then raise exception 'FAIL C expired'; end if;
  if shared_dashboard('not-a-token')->>'status' <> 'unavailable' then raise exception 'FAIL C malformed'; end if;
  if shared_dashboard(repeat('a', 64))->>'status' <> 'unavailable' then raise exception 'FAIL C unknown'; end if;
  raise notice 'C ok';
end $$;
reset role;

-- D. passcode ---------------------------------------------------------------
update platform_settings set value = '3'::jsonb where key = 'share_link_passcode_max_failures';
set role anon;
do $$
declare tok text := current_setting('smoke.pass_tok'); v jsonb;
begin
  v := shared_dashboard(tok);
  if v->>'status' <> 'passcode_required' or v ? 'dashboard' then raise exception 'FAIL D no passcode → %', v; end if;
  if shared_dashboard(tok, '4821')->>'status' <> 'ok' then raise exception 'FAIL D right passcode (trimmed)'; end if;
  if shared_dashboard(tok, '0000')->>'status' <> 'passcode_wrong' then raise exception 'FAIL D wrong 1'; end if;
  if shared_dashboard(tok, '0001')->>'status' <> 'passcode_wrong' then raise exception 'FAIL D wrong 2'; end if;
  if shared_dashboard(tok, '0002')->>'status' <> 'locked' then raise exception 'FAIL D 3rd wrong should lock'; end if;
  v := shared_dashboard(tok, '4821');
  if v->>'status' <> 'locked' or v ? 'dashboard' then raise exception 'FAIL D right passcode during lock → %', v; end if;
  raise notice 'D ok (locked)';
end $$;
reset role;
update share_links set locked_until = now() - interval '1 second' where label = 'Board';
set role anon;
do $$ begin
  if shared_dashboard(current_setting('smoke.pass_tok'), '4821')->>'status' <> 'ok' then raise exception 'FAIL D after lock'; end if;
  raise notice 'D ok (reopened)';
end $$;

-- E. headline only ----------------------------------------------------------
do $$ declare v jsonb := shared_dashboard(current_setting('smoke.lean_tok')); begin
  if v->'dashboard' ?| array['items','insights','trend','exploration_index'] then raise exception 'FAIL E detail kept: %', v->'dashboard'; end if;
  if v->'map' <> 'null'::jsonb then raise exception 'FAIL E map kept'; end if;
  if v->'dashboard'->'matrix' = '{}'::jsonb then raise exception 'FAIL E matrix lost'; end if;
  raise notice 'E ok';
end $$;
reset role;

-- F. map: every country's full data (collab_intelligence), outlines from the scope
set role anon;
do $$ declare m jsonb := shared_dashboard(current_setting('smoke.house_tok'))->'map'; begin
  if (m->>'published')::boolean or jsonb_array_length(m->'countries') <> 0 then
    raise exception 'FAIL F coloured a country before the Collab published: %', m;
  end if;
  raise notice 'F ok (unpublished → no colour)';
end $$;
reset role;
update platform_settings set value = 'true'::jsonb where key = 'publish_global_view';
update platform_settings set value = '1'::jsonb   where key = 'critical_mass_gate';
update platform_settings set value = '25'::jsonb  where key = 'country_critical_mass_gate';
set role anon;
do $$ declare m jsonb := shared_dashboard(current_setting('smoke.house_tok'))->'map';
             rm jsonb := shared_dashboard(current_setting('smoke.room_tok'))->'map';
             ci jsonb;
begin
  ci := collab_intelligence();
  if m->'countries' is distinct from ci->'countries' then raise exception 'FAIL F map differs from the dashboard''s: % vs %', m->'countries', ci->'countries'; end if;
  if jsonb_array_length(m->'countries') < 1 then raise exception 'FAIL F nothing coloured at gate 25'; end if;
  -- outlines: Ghana 16, Kenya 30 ≥ 10; Chad 3 never
  if m->'reached' <> '["Ghana","Kenya"]'::jsonb then raise exception 'FAIL F reached %', m->'reached'; end if;
  if rm->'reached' <> '["Kenya"]'::jsonb then raise exception 'FAIL F room reached %', rm->'reached'; end if;
  raise notice 'F ok (all data per country, same as dashboard)';
end $$;
reset role;
update platform_settings set value = 'false'::jsonb where key = 'publish_global_view';
update platform_settings set value = '400'::jsonb   where key = 'critical_mass_gate';
update platform_settings set value = '2000'::jsonb  where key = 'country_critical_mass_gate';

-- G. list & revoke ----------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare l jsonb := org_share_links('shoreline'); begin
  if l::text ~ 'token' then raise exception 'FAIL G list mentions a token'; end if;
  if (select count(*) from jsonb_array_elements(l) x where (x->>'live')::boolean) <> 4 then raise exception 'FAIL G live count %', l; end if;
  if (select (x->>'view_count')::int from jsonb_array_elements(l) x where x->>'label' = 'Field leaders') < 1 then raise exception 'FAIL G views not counted'; end if;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  begin perform revoke_share_link('shoreline', (select id from share_links where label = 'Board')); raise exception 'FAIL G outsider revoked';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'G ok';
end $$;

-- H. room deleted → its links go ---------------------------------------------
delete from distribution_links where id = 'dddddddd-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from share_links where label = 'Kenya leaders') then raise exception 'FAIL H room link survived'; end if;
  raise notice 'H ok';
end $$;

-- I. internals & trend --------------------------------------------------------
do $$ begin
  if has_function_privilege('anon', 'public._org_dashboard_core(uuid,date,date)', 'execute')
     or has_function_privilege('anon', 'public._link_dashboard_core(uuid)', 'execute')
     or has_function_privilege('anon', 'public._scope_country_map(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public._gated_trend(uuid,boolean,int)', 'execute')
     or has_function_privilege('authenticated', 'public._org_dashboard_core(uuid,date,date)', 'execute')
     or has_function_privilege('anon', 'public.create_share_link(text,text,uuid,int,text,boolean,boolean)', 'execute') then
    raise exception 'FAIL I an internal function is callable by a client role';
  end if;
  if exists (select 1 from jsonb_array_elements(
       _gated_trend('aaaaaaaa-0000-0000-0000-000000000001', false, 10)) t where (t->>'year')::int = 2023) then
    raise exception 'FAIL I 2023 (n = 4) still in the trend';
  end if;
  raise notice 'I ok';
end $$;

select 'ALL 0046 CHECKS PASSED' as result;
