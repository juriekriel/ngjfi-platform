-- Migration 0063: Communication in four stages; live figures are admin-only,
-- live-space only, and coarse.
do $$
declare
  v_admin uuid := test.make_user('admin@test.org', 'admin');
  v_org   uuid := test.make_user('someone@test.org', 'org');
  v_live  uuid;
  v_demo  uuid;
  v       jsonb;
begin
  -- Every stage has steps; the original six stay Launch.
  perform test.ok((select count(distinct stage) from comms_templates where kind = 'sequence') = 4, 'four stages seeded');
  perform test.ok((select stage from comms_templates where key = 'step_1_dashboard') = 'launch', 'the original steps are Launch');
  perform test.ok((select body from comms_templates where key = 'step_2_first_survey') like '%about eight minutes%', 'step 2 has the v6+ length');
  perform test.ok(exists (select 1 from comms_templates where key = 'launch_pitch_docs' and stage = 'launch'), 'Launch points to the pitch documents');

  -- Live figures: administrators only.
  perform test.login(v_org);
  perform test.raises($q$select admin_comms_global_facts()$q$, '%only an administrator%');

  perform test.login(v_admin);
  v_live := test.make_org('grace-live', true);
  update organisations set country = 'Argentina' where id = v_live;
  perform test.make_session(v_live, interval '1 day');
  insert into organisations (slug, name, short_name, is_demo, country, status)
  values ('sandbox-x', 'Sandbox X', 'sandbox-x', true, 'Narnia', 'active') returning id into v_demo;

  v := admin_comms_global_facts();
  perform test.ok((v->>'org_count')::int >= 1, 'live organisations counted');
  perform test.ok(v->'countries' ? 'Argentina', 'a live organisation''s country is listed');
  perform test.ok(not (v->'countries' ? 'Narnia'), 'the sandbox is never listed');
  perform test.ok((v->>'completion_count')::int >= 1, 'completed surveys counted');
  perform test.ok(not (v ? 'by_country'), 'no per-country respondent figures');

  -- Saving keeps a template's stage unless a new one is given.
  perform admin_comms_save_template('support_check_in', 'T', 'S', 'B', 'sequence', 1);
  perform test.ok((select stage from comms_templates where key = 'support_check_in') = 'support', 'stage kept on save');
  perform admin_comms_save_template('', 'A one-off', 'S', 'B', 'update', null, 'global');
  perform test.ok((select stage from comms_templates where key = 'a_one_off') = 'global', 'a new update can be filed under a stage');
  perform test.raises($q$select admin_comms_save_template('', 'x', 'y', 'z', 'update', null, 'nope')$q$, '%stage must be%');
end $$;
