-- 0049: unattested organisations are reported, never a launch blocker.
do $$
declare
  v_admin uuid := test.make_user('admin@test.local', 'admin');
  r jsonb;
  c jsonb;
begin
  perform test.make_org('waiting-org', false);
  perform test.make_org('ready-org', true);
  update platform_settings set value = '60'::jsonb where key = 'respondent_retention_months';
  -- exactly one active instrument version
  insert into instrument_versions (version, scoring_version, status, definition)
  values ('vtest', 'v0.1.0', 'active', '{}'::jsonb);
  update instrument_versions set status = 'archived' where version <> 'vtest' and status = 'active';

  perform test.login(v_admin);
  r := public.pilot_readiness();

  select x into c from jsonb_array_elements(r->'checks') x where x->>'check' = 'Organisations collect once they confirm consent';
  perform test.ok(c is not null, 'consent check present');
  perform test.ok((c->>'blocking')::boolean = false, 'consent check is non-blocking');
  perform test.ok((c->>'ok')::boolean = false, 'consent check is unmet while waiting-org has not confirmed');
  perform test.ok(c->>'detail' like '%Collecting: ready-org.%', 'lists who is collecting');
  perform test.ok(c->>'detail' like '%Waiting to confirm%waiting-org%', 'lists who is waiting');

  perform test.ok((r->>'ready')::boolean, 'an unattested organisation does not make the platform "not ready"');
  perform test.ok((r->>'collection_locked')::boolean, 'the 0048 lock is reported');

  -- a blocking failure still flips ready
  update platform_settings set value = 'null'::jsonb where key = 'respondent_retention_months';
  r := public.pilot_readiness();
  perform test.ok(not (r->>'ready')::boolean, 'a blocking check (retention) still makes it not ready');

  -- only administrators
  perform test.login(test.make_user('org@test.local', 'org'));
  perform test.raises('select public.pilot_readiness()', '%only an administrator%');
end $$;
