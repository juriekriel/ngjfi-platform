-- 0055: the 30-minute setup call is kept (yes / maybe / no), listed for admins, and ticked off.
do $$
declare
  v_admin uuid := test.make_user('admin@calls.test', 'admin');
  v_org   uuid := test.make_user('lead@calls.test', 'org');
  v_yes uuid; v_maybe uuid; r jsonb; s int;
begin
  insert into waitlist_contacts (email, org_name, role) values ('yes@calls.test', 'Yes Youth', 'Lead') returning id into v_yes;
  insert into waitlist_contacts (email, org_name, role) values ('maybe@calls.test', 'Maybe Ministry', 'Pastor') returning id into v_maybe;
  insert into waitlist_contacts (email, org_name, role) values ('no@calls.test', 'No Network', 'Lead');

  perform test.login(null);
  perform public.waitlist_qualify('yes@calls.test', '{"setup_call": "yes", "countries": ["Kenya"]}');
  perform public.waitlist_qualify('maybe@calls.test', '{"setup_call": "maybe"}');
  perform public.waitlist_qualify('no@calls.test', '{"wants_setup_call": false}');  -- an old cached page

  perform test.ok((select setup_call = 'yes' and wants_setup_call from waitlist_contacts where id = v_yes), 'yes is kept');
  perform test.ok((select setup_call = 'maybe' and not wants_setup_call from waitlist_contacts where id = v_maybe), 'maybe is no longer lost');
  perform test.ok((select setup_call = 'no' from waitlist_contacts where email = 'no@calls.test'), 'the old boolean still works');
  select priority_score into s from waitlist_contacts where id = v_yes;
  perform test.ok(s >= 45, 'a yes still raises priority: ' || s);

  -- only admins see and tick the list
  perform test.login(v_org);
  perform test.raises($q$select public.admin_setup_calls()$q$, '%only an administrator%');
  perform test.raises(format($q$select public.admin_mark_setup_call(%L, true)$q$, v_yes), '%only an administrator%');

  perform test.login(v_admin);
  r := public.admin_setup_calls();
  perform test.ok(jsonb_array_length(r) = 2, 'yes and maybe listed, no left out: ' || r::text);
  perform test.ok(r->0->>'email' = 'yes@calls.test', 'an un-emailed yes comes first');

  -- still listed after the application becomes an organisation
  update waitlist_contacts set status = 'onboarded' where id = v_yes;
  perform public.admin_mark_setup_call(v_yes, true);
  r := public.admin_setup_calls();
  perform test.ok(r->1->>'email' = 'yes@calls.test' and r->1->>'emailed_by' = 'admin@calls.test', 'emailed moves to the end, with who: ' || r::text);
  perform public.admin_mark_setup_call(v_yes, false);
  perform test.ok((select setup_call_emailed_at is null from waitlist_contacts where id = v_yes), 'undo clears it');
end $$;
