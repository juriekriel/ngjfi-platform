-- Migration 0060: /survey is reserved; admin platform controls are admin-only,
-- allow-listed, validated, logged, and refuse to publish below the gate.
do $$
declare
  v_admin uuid := test.make_user('admin@test.org', 'admin');
  v_org   uuid := test.make_user('someone@test.org', 'org');
  v_res   jsonb;
begin
  perform test.ok(exists (select 1 from reserved_short_names where name = 'survey'), '/survey is reserved');

  -- not an administrator
  perform test.login(v_org);
  perform test.raises($q$select admin_platform_controls()$q$, '%for administrators%');
  perform test.raises($q$select admin_set_platform_setting('critical_mass_gate', '500'::jsonb)$q$, '%only an administrator%');

  perform test.login(v_admin);

  -- allow-list and validation
  perform test.raises($q$select admin_set_platform_setting('collection_locked', 'false'::jsonb)$q$, '%not a setting this control can change%');
  perform test.raises($q$select admin_set_platform_setting('critical_mass_gate', '0'::jsonb)$q$, '%whole number of at least 1%');
  perform test.raises($q$select admin_set_platform_setting('critical_mass_gate', '12.5'::jsonb)$q$, '%whole number of at least 1%');
  perform test.raises($q$select admin_set_platform_setting('country_critical_mass_gate', '"2000"'::jsonb)$q$, '%whole number of at least 1%');
  perform test.raises($q$select admin_set_platform_setting('publish_global_view', '1'::jsonb)$q$, '%true or false%');

  -- a gate change is applied and logged
  v_res := admin_set_platform_setting('critical_mass_gate', '450'::jsonb);
  perform test.ok((v_res->>'gate')::int = 450, 'gate returned');
  perform test.ok(setting_int('critical_mass_gate', 0) = 450, 'gate stored');
  perform test.ok(exists (select 1 from platform_settings_log where key = 'critical_mass_gate'
                           and new_value = '450'::jsonb and actor = v_admin), 'change logged with the actor');
  perform test.ok(jsonb_array_length(admin_platform_controls()->'log') >= 1, 'log readable by admin');

  -- publishing is refused below the gate; un-publishing always works
  perform test.raises($q$select admin_set_platform_setting('publish_global_view', 'true'::jsonb)$q$, '%stays unpublished until%');
  perform test.ok(setting_bool('publish_global_view', true) = false, 'still unpublished');
  v_res := admin_set_platform_setting('publish_global_view', 'false'::jsonb);
  perform test.ok((v_res->>'global_view_published')::boolean = false, 'un-publish allowed');
end $$;
