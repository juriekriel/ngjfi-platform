-- Migration 0062: the waitlist emails only answer a real, fresh sign-up, once,
-- and carry what the database saved — never what the request said.
do $$
declare v jsonb;
begin
  perform test.login(null);  -- an anonymous visitor, like the route

  -- No sign-up for this address: nothing to send.
  perform test.ok(waitlist_claim_notification('stranger@example.org', 'join') is null, 'an unknown address gets nothing');

  -- A fresh sign-up: claimed once, with the saved organisation name.
  perform waitlist_join('pastor@church.org', 'Grace Youth', 'Youth pastor', true);
  v := waitlist_claim_notification('Pastor@Church.org ', 'join');
  perform test.ok(v->>'org_name' = 'Grace Youth', 'the saved organisation name comes back');
  perform test.ok(v->>'email' = 'pastor@church.org', 'the saved address comes back');
  perform test.ok(waitlist_claim_notification('pastor@church.org', 'join') is null, 'a second claim gets nothing');

  -- An old sign-up can't be claimed (outside the window).
  insert into waitlist_contacts (email, org_name, role, created_at, updated_at)
  values ('old@church.org', 'Old Church', 'Leader', now() - interval '1 hour', now() - interval '1 hour');
  perform test.ok(waitlist_claim_notification('old@church.org', 'join') is null, 'a sign-up older than 10 minutes gets nothing');

  -- Setup call: only after a yes / maybe, once.
  perform test.ok(waitlist_claim_notification('pastor@church.org', 'setup_call') is null, 'no setup call asked yet');
  perform waitlist_qualify('pastor@church.org', '{"setup_call":"maybe","countries":["United States"]}'::jsonb);
  v := waitlist_claim_notification('pastor@church.org', 'setup_call');
  perform test.ok(v->>'setup_call' = 'maybe' and v->>'countries' = 'United States', 'the saved setup-call answer comes back');
  perform test.ok(waitlist_claim_notification('pastor@church.org', 'setup_call') is null, 'and only once');

  perform test.raises($q$select waitlist_claim_notification('a@b.org', 'anything')$q$, '%join or setup_call%');
end $$;

-- Migrations 0064/0065: launch settings.
do $$
begin
  perform test.ok(not collection_locked(), 'collection is unlocked for launch (0065)');
  perform test.ok(setting_int('min_group_n', 0) = 10 and setting_int('room_min_n', 0) = 10
              and setting_int('critical_mass_gate', 0) = 400 and setting_int('country_critical_mass_gate', 0) = 2000,
                  'the confirmed reporting gates (0064)');
  perform test.ok((select value #>> '{}' from platform_settings where key = 'survey_consent_statement_version') = '2026-10-v2',
                  'survey consent statement v2 (0064)');
  perform test.ok(not setting_bool('publish_global_view', true), 'the global view is still not published');
end $$;
