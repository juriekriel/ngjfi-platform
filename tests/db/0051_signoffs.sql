-- 0051: hand sign-offs are recorded with who/when/note and kept with history.
do $$
declare v_admin uuid := test.make_user('admin@test.local', 'admin'); r jsonb; h jsonb;
begin
  update app_users set full_name = 'Jurie Kriel' where id = v_admin;
  perform test.login(v_admin);
  r := public.pilot_readiness();
  perform test.ok(jsonb_array_length(r->'hand_checks') = 5, 'five hand checks');
  perform test.ok(not (r->>'all_signed_off')::boolean, 'nothing signed off yet');
  perform test.ok(jsonb_typeof(r->'not_checkable_here'->0) = 'string', 'older clients still get strings');

  perform test.raises($q$select public.confirm_pilot_item('researcher', '')$q$, '%needs a note%');
  r := public.confirm_pilot_item('branch');
  select x into h from jsonb_array_elements(r->'hand_checks') x where x->>'item' = 'branch';
  perform test.ok((h->>'confirmed')::boolean and h->>'confirmed_by' = 'Jurie Kriel', 'confirmed, with who');

  perform public.confirm_pilot_item('smtp');
  perform public.confirm_pilot_item('backups', 'Pro plan, restore rehearsed 10 Oct');
  perform public.confirm_pilot_item('researcher', 'https://docs.google.com/document/d/1Zh0FC9');
  r := public.confirm_pilot_item('counsel', 'Counsel letter 20 Oct');
  perform test.ok((r->>'all_signed_off')::boolean, 'all signed off');

  r := public.revoke_pilot_item('counsel', 'terms changed');
  perform test.ok(not (r->>'all_signed_off')::boolean, 'a revoke reopens it');
  perform test.ok((select count(*) = 1 from pilot_signoffs where item = 'counsel' and revoked_at is not null), 'history kept');

  perform test.ok(test.via_api(test.make_user('org@test.local', 'org'), $q$select public.confirm_pilot_item('smtp')$q$)
                  like '%only an administrator%', 'org users cannot sign off');
end $$;
