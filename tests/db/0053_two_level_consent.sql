-- 0053: one consent per organisation, one per survey sent; no consent, no participation.
do $$
declare
  v_admin  uuid := test.make_user('admin@test.local', 'admin');
  v_oa     uuid := test.make_user('lead@ministry.test', 'org');
  v_member uuid := test.make_user('helper@ministry.test', 'org');
  v_org    uuid := test.make_org('two-level', false);
  v_camp   uuid;
  v_room   uuid;
  r jsonb; e text; reg jsonb; o jsonb;
begin
  perform test.unlock();
  update instrument_versions set status = 'archived' where status = 'active';
  perform test.make_instrument();
  update instrument_versions set status = 'active' where version = 'vtest';
  v_camp := test.campaign(v_org);
  update app_users set full_name = 'Ana Lead' where id = v_oa;
  insert into org_members (org_id, user_id, role, status) values
    (v_org, v_oa, 'org_admin', 'active'), (v_org, v_member, 'coordinator', 'active');
  insert into distribution_links (org_id, name, slug) values (v_org, 'Camp night', 'camp') returning id into v_room;

  perform test.ok(public._invitable_age_bands() = '{13_17,18_22,23_30}', 'age bands come from the active instrument (under-13 excluded)');
  perform test.ok((select count(*) = 21 from consent_country_rules), '21 countries seeded');

  -- no organisation consent yet → survey consent refused
  perform test.login(v_oa);
  e := test.raises($q$select public.confirm_survey_consent('two-level', null, '{AR}', '{18_22}', 'not_applicable_adults_only', null, null, '2026-10-v1', '2026-10-v1')$q$,
                   '%confirm consent for your organisation first%');

  update organisations set consent_attested_at = now(), consent_attested_by = v_oa,
         consent_statement_version = (select value #>> '{}' from platform_settings where key = 'consent_statement_version')
   where id = v_org;

  -- org consent alone is not enough: no session without a survey consent
  perform test.raises(format($q$insert into sessions (campaign_id, locale) values (%L, 'en')$q$, v_camp), '%not been confirmed for consent%');

  -- only org admins; a coordinator can't
  perform test.ok(test.via_api(v_member, $q$select public.confirm_survey_consent('two-level', null, '{AR}', '{18_22}', 'not_applicable_adults_only', null, null, '2026-10-v1', '2026-10-v1')$q$)
                  like '%only an organisation admin%', 'coordinators cannot confirm');
  perform test.login(v_oa);

  -- validation
  perform test.raises($q$select public.confirm_survey_consent('two-level', null, '{AR}', '{13_17}', 'not_applicable_adults_only', null, null, '2026-10-v1', '2026-10-v1')$q$, '%say how parental consent was gathered%');
  perform test.raises($q$select public.confirm_survey_consent('two-level', null, '{AR}', '{31_45}', 'written_form', null, null, '2026-10-v1', '2026-10-v1')$q$, '%age groups must be among%');
  perform test.raises($q$select public.confirm_survey_consent('two-level', null, '{XX}', '{18_22}', 'written_form', null, null, '2026-10-v1', '2026-10-v1')$q$, '%unknown country%');
  perform test.raises($q$select public.confirm_survey_consent('two-level', null, '{PK}', '{18_22}', 'written_form', null, null, '2026-10-v1', '2026-10-v1')$q$, '%local legal advice%Pakistan%');
  perform test.raises($q$select public.confirm_survey_consent('two-level', null, '{AR}', '{18_22}', 'written_form', null, null, '2026-09-v0', '2026-10-v1')$q$, '%consent text has changed%');

  -- the house link, 18+ only
  r := public.confirm_survey_consent('two-level', null, '{AR,OTHER:Uruguay}', '{18_22,23_30}', 'written_form', 'REC-12', null, '2026-10-v1', '2026-10-v1');
  perform test.ok(r->>'state' = 'current' and r->>'confirmed_by' = 'Ana Lead', 'confirmed, with who: ' || r::text);
  perform test.ok(r->>'parental_consent_method' = 'not_applicable_adults_only' and not (r->>'includes_minors')::boolean, 'adults-only is recorded as such');

  -- sessions: allowed band yes, a 13–17 no — on insert and on update
  insert into sessions (campaign_id, locale, age_band) values (v_camp, 'en', '18_22');
  perform test.raises(format($q$insert into sessions (campaign_id, locale, age_band) values (%L, 'en', '13_17')$q$, v_camp), '%not open to this age group%');
  perform test.raises(format($q$update sessions set age_band = '13_17' where campaign_id = %L$q$, v_camp), '%not open to this age group%');

  -- the room has no consent of its own yet
  perform test.raises(format($q$insert into sessions (campaign_id, locale, distribution_link_id) values (%L, 'en', %L)$q$, v_camp, v_room), '%not been confirmed%');
  r := public.confirm_survey_consent('two-level', v_room, '{AR}', '{13_17,18_22}', 'written_form', null, null, '2026-10-v1', '2026-10-v1');
  perform test.ok((r->>'includes_minors')::boolean, 'room invites minors');
  insert into sessions (campaign_id, locale, distribution_link_id, age_band) values (v_camp, 'en', v_room, '13_17');

  -- what the phone learns: open + bands, nothing about staff
  perform test.login(null);
  r := public.survey_consent_public('two-level', 'camp');
  perform test.ok((r->>'open')::boolean and r->'age_bands' = '["13_17", "18_22"]'::jsonb and not (r ? 'confirmed_by'), 'public status: ' || r::text);

  -- revoke stops new sessions immediately; history is kept
  perform test.login(v_oa);
  r := public.revoke_survey_consent('two-level', v_room, 'camp cancelled');
  perform test.ok(r->>'state' = 'revoked', 'revoked');
  perform test.raises(format($q$insert into sessions (campaign_id, locale, distribution_link_id) values (%L, 'en', %L)$q$, v_camp, v_room), '%not been confirmed%');

  -- a statement bump: older consents keep collecting for the grace period, then stop
  update platform_settings set value = '"2027-01-v2"' where key = 'survey_consent_statement_version';
  perform test.ok(public._survey_consent_state(v_org, null) = 'outdated', 'outdated, still in grace');
  insert into sessions (campaign_id, locale) values (v_camp, 'en');
  update platform_settings set value = to_jsonb(now() - interval '15 days') where key = 'survey_consent_statement_since';
  perform test.ok(public._survey_consent_state(v_org, null) = 'expired', 'expired after the grace period');
  perform test.raises(format($q$insert into sessions (campaign_id, locale) values (%L, 'en')$q$, v_camp), '%not been confirmed%');

  -- the admin register: who agreed, for what, when; no respondent data
  perform test.login(v_admin);
  reg := public.admin_consent_register();
  select x into o from jsonb_array_elements(reg) x where x->>'short_name' = 'two-level';
  perform test.ok((o->'org_consent'->>'attested')::boolean, 'org consent shown');
  perform test.ok(o->'org_consent'->>'why_consent_version' = '2026-10-v1', 'org consent records the Why consent version');
  perform test.ok(jsonb_array_length(o->'surveys') = 2, 'house + room listed');
  perform test.ok(exists (select 1 from jsonb_array_elements(o->'surveys') s
                           where s->>'name' = 'Camp night' and s->>'state' = 'revoked'
                             and (s->'history'->0->>'revoke_reason') = 'camp cancelled'), 'room history kept with the reason');
  perform test.ok(reg::text not like '%"age_band":%' and reg::text not like '%session%', 'no respondent data in the register');
  perform test.ok(test.via_api(v_oa, 'select public.admin_consent_register()') like '%only an administrator%', 'org admins cannot see the register');

  -- demo organisations are exempt
  declare v_demo uuid; v_dc uuid;
  begin
    insert into organisations (slug, name, short_name, is_demo) values ('demo-x', 'Demo', 'demo-x', true) returning id into v_demo;
    v_dc := test.campaign(v_demo);
    insert into sessions (campaign_id, locale, age_band) values (v_dc, 'en', '13_17');
  end;
end $$;
