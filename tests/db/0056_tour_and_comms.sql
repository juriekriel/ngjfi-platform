-- 0056: the first-visit dashboard walkthrough, and Collab comms to Org Administrators.
do $$
declare
  v_admin uuid := test.make_user('admin@comms.test', 'admin');
  v_oa    uuid := test.make_user('jurie.kriel@sunrise.test', 'org');
  v_co    uuid := test.make_user('helper@sunrise.test', 'org');
  v_out   uuid := test.make_user('stranger@elsewhere.test', 'org');
  v_org   uuid := test.make_org('sunrise', false);
  v_org2  uuid := test.make_org('harvest', false);
  v_demo  uuid := test.make_org('sandboxed', false);
  v_closed uuid := test.make_org('shut', false);
  r jsonb;
begin
  insert into org_members (org_id, user_id, role, status) values
    (v_org, v_oa, 'org_admin', 'active'), (v_org, v_co, 'coordinator', 'active');
  insert into org_invites (org_id, email, role) values (v_org2, 'new.lead@harvest.test', 'org_admin');
  update organisations set is_demo = true where id = v_demo;
  insert into org_invites (org_id, email, role) values (v_demo, 'demo@sandboxed.test', 'org_admin');
  update organisations set status = 'closed' where id = v_closed;
  insert into org_invites (org_id, email, role) values (v_closed, 'gone@shut.test', 'org_admin');

  -- ── the walkthrough ──────────────────────────────────────────────────
  perform test.login(v_co);
  r := public.my_dashboard_tour('sunrise');
  perform test.ok((r->>'show')::boolean and r->>'role' = 'coordinator', 'a new member sees it: ' || r::text);
  perform public.mark_dashboard_tour('sunrise', 'skipped');
  perform test.ok(not (public.my_dashboard_tour('sunrise')->>'show')::boolean, 'skipped: not shown again');
  perform public.mark_dashboard_tour('sunrise', 'done');
  perform public.mark_dashboard_tour('sunrise', 'skipped');
  perform test.ok((select tour_state = 'done' and tour_completed_at is not null from org_members where user_id = v_co), 'done is never downgraded to skipped');
  perform test.raises($q$select public.mark_dashboard_tour('sunrise', 'maybe')$q$, '%done or skipped%');

  perform test.login(v_oa);
  perform test.ok((public.my_dashboard_tour('sunrise')->>'show')::boolean, 'each member has their own first visit');

  perform test.login(v_admin);
  perform test.ok(not (public.my_dashboard_tour('sunrise')->>'show')::boolean, 'an administrator stepping in is never toured');
  perform test.login(v_out);
  perform test.ok(not (public.my_dashboard_tour('sunrise')->>'show')::boolean, 'a non-member is never toured');
  perform public.mark_dashboard_tour('sunrise', 'done');  -- harmless, touches nothing

  -- ── comms: administrators only ───────────────────────────────────────
  perform test.raises($q$select public.admin_comms_recipients()$q$, '%only an administrator%');
  perform test.raises($q$select public.admin_comms_templates()$q$, '%only an administrator%');
  perform test.raises($q$select public.admin_comms_log('[]'::jsonb)$q$, '%only an administrator%');
  perform test.login(v_oa);
  perform test.raises($q$select public.admin_comms_history()$q$, '%only an administrator%');

  perform test.login(v_admin);
  r := public.admin_comms_templates();
  -- 0063 added more stages after Launch; the six original steps still come first, in order.
  perform test.ok(jsonb_array_length(r) >= 6 and r->0->>'key' = 'step_1_dashboard' and r->5->>'key' = 'step_6_about_collab', 'six steps, in order');

  -- the audience: org admins + invited org admins; no coordinators, sandbox or closed orgs
  r := public.admin_comms_recipients();
  perform test.ok(jsonb_array_length(r) = 2, 'two org administrators: ' || r::text);
  perform test.ok(not r::text like '%helper@sunrise.test%', 'coordinators are not in the audience');
  perform test.ok(r::text like '%new.lead@harvest.test%' and r::text like '%"source": "invite"%', 'invited, not signed in yet, is included');
  perform test.ok(not r::text like '%gone@shut.test%', 'a closed organisation is left out');
  perform test.ok(jsonb_array_length(public.admin_comms_recipients(true, true, null)) = 3, 'the sandbox only when asked');
  perform test.ok(jsonb_array_length(public.admin_comms_recipients(false, false, null)) = 1, 'invites can be left out');
  perform test.ok(jsonb_array_length(public.admin_comms_recipients(false, true, 'JURIE.KRIEL@sunrise.test')) = 1, 'look-up by one email, any case');

  -- someone added after the first send is in the next one, automatically
  insert into org_invites (org_id, email, role) values (v_org2, 'second@harvest.test', 'coordinator');
  update org_members set role = 'coordinator' where user_id = v_oa;
  update org_members set role = 'org_admin' where user_id = v_co;
  r := public.admin_comms_recipients();
  perform test.ok(r::text like '%helper@sunrise.test%' and not r::text like '%jurie.kriel%', 'read live, never a stored list: ' || r::text);
  update org_members set role = 'coordinator' where user_id = v_co;
  update org_members set role = 'org_admin' where user_id = v_oa;

  -- logging: known org admins only, and the board sees it
  perform public.admin_comms_log(jsonb_build_array(jsonb_build_object(
    'email', 'jurie.kriel@sunrise.test', 'org_id', v_org, 'template_key', 'step_1_dashboard',
    'subject', 'Getting started', 'mode', 'single', 'status', 'sent')));
  perform test.raises(format($q$select public.admin_comms_log('[{"email": "random@spam.test", "org_id": "%s", "subject": "x"}]'::jsonb)$q$, v_org), '%not an Org Administrator%');
  perform test.raises(format($q$select public.admin_comms_log('[{"email": "helper@sunrise.test", "org_id": "%s", "subject": "x"}]'::jsonb)$q$, v_org), '%not an Org Administrator%');
  r := public.admin_comms_recipients(false, true, 'jurie.kriel@sunrise.test');
  perform test.ok(r->0->'sent' ? 'step_1_dashboard', 'the board knows step 1 went: ' || r::text);
  r := public.admin_comms_history();
  perform test.ok(jsonb_array_length(r) = 1 and r->0->>'sent_by' = 'admin@comms.test' and r->0->>'org_name' = 'Sunrise', 'history with who sent it: ' || r::text);

  -- templates: edit a step, add and delete an update; steps cannot be deleted
  perform public.admin_comms_save_template('step_1_dashboard', 'Getting started', 'New subject', 'Hi {{first_name}}', 'sequence', 1);
  perform test.ok((select subject = 'New subject' and updated_by = v_admin from comms_templates where key = 'step_1_dashboard'), 'a step can be edited');
  r := public.admin_comms_save_template('', 'Pilot opens!', 'Live answers start today', 'Hi', 'update', 3);
  perform test.ok(r->>'key' = 'pilot_opens', 'a new update gets a key from its title: ' || r::text);
  perform test.ok((select position is null from comms_templates where key = 'pilot_opens'), 'updates carry no step position');
  perform public.admin_comms_delete_template('pilot_opens');
  perform test.raises($q$select public.admin_comms_delete_template('step_2_first_survey')$q$, '%one-off update%');

  -- a saved name greets them next time — for members and invitations alike
  perform public.admin_comms_set_name('NEW.LEAD@harvest.test', 'Ana Silva');
  perform test.ok((select full_name = 'Ana Silva' from org_invites where email = 'new.lead@harvest.test'), 'name kept on the invitation');
  perform public.admin_comms_set_name('jurie.kriel@sunrise.test', 'Jurie');
  perform test.ok((select full_name = 'Jurie' from app_users where id = v_oa), 'name kept on the account');
end $$;
