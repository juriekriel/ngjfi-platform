-- ============================================================================
-- The Jesus Index — readiness: consent is per organisation, not a launch gate
-- (migration 0049)
--
-- Decision (Ulrich, 5 Oct 2026): organisations confirm consent when they are
-- ready. Until they do, the 0042 trigger already keeps THEIR real links from
-- recording — which is the safeguard that matters. So the platform readiness
-- check reports unattested organisations instead of failing on them.
--
-- What changes in pilot_readiness():
--   * Every check carries 'blocking' (true|false). `ready` is computed over
--     blocking checks only.
--   * "Every active live organisation has attested edge consent" becomes
--     NON-blocking, and its detail lists who is collecting and who is waiting.
--   * New NON-blocking check: the collection lock (0048), so the panel says
--     plainly that nothing is stored until the unlock migration lands.
--
-- Untouched: attest_edge_consent, org_consent_status, the 0042 session
-- trigger, the 0048 lock. Nothing about any respondent is read or exposed.
-- ============================================================================

create or replace function public.pilot_readiness()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_retention jsonb := (select value from platform_settings where key = 'respondent_retention_months');
  v_unattested jsonb;
  v_attested jsonb;
  v_versions jsonb;
  v_locked boolean := public.collection_locked();
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can run the readiness check';
  end if;

  select coalesce(jsonb_agg(o.short_name order by o.short_name), '[]'::jsonb) into v_unattested
    from organisations o
   where not o.is_demo and o.status = 'active' and o.consent_attested_at is null;

  select coalesce(jsonb_agg(o.short_name order by o.short_name), '[]'::jsonb) into v_attested
    from organisations o
   where not o.is_demo and o.status = 'active' and o.consent_attested_at is not null;

  select coalesce(jsonb_agg(v.version order by v.created_at desc), '[]'::jsonb) into v_versions
    from instrument_versions v where v.status = 'active';

  v_checks := v_checks
    || jsonb_build_object('check', 'Global view is not published yet',
         'blocking', true,
         'ok', not setting_bool('publish_global_view', false),
         'detail', 'publish_global_view stays false until the live space has crossed the gate.')
    || jsonb_build_object('check', 'Organisations collect once they confirm consent',
         'blocking', false,
         'ok', jsonb_array_length(v_unattested) = 0,
         'detail',
           case when jsonb_array_length(v_attested) = 0 then 'Collecting: none yet. '
                else 'Collecting: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_attested) x) || '. ' end
           || case when jsonb_array_length(v_unattested) = 0 then 'Every active organisation has confirmed.'
                   else 'Waiting to confirm (their real links stay closed): '
                        || (select string_agg(x, ', ') from jsonb_array_elements_text(v_unattested) x) || '.' end)
    || jsonb_build_object('check', 'A retention period has been decided',
         'blocking', true,
         'ok', v_retention is not null and jsonb_typeof(v_retention) = 'number',
         'detail', 'platform_settings.respondent_retention_months — a research-ethics decision.')
    || jsonb_build_object('check', 'Exactly one instrument version is active',
         'blocking', true,
         'ok', jsonb_array_length(v_versions) = 1,
         'detail', 'Active: ' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(v_versions) x), 'none') || '. Run npm run db:seed after an instrument change.')
    || jsonb_build_object('check', 'Critical-mass gates are set',
         'blocking', true,
         'ok', setting_int('critical_mass_gate', 0) > 0 and setting_int('country_critical_mass_gate', 0) >= setting_int('critical_mass_gate', 0),
         'detail', format('org/region %s · country %s · smallest group %s',
                          setting_int('critical_mass_gate', 0), setting_int('country_critical_mass_gate', 0), setting_int('min_group_n', 0)))
    || jsonb_build_object('check', 'Collection lock',
         'blocking', false,
         'ok', not v_locked,
         'detail', case when v_locked
                        then 'Locked: the survey runs end to end but nothing is stored. Unlock by migration when you go live (0048).'
                        else 'Unlocked: live answers are being stored.' end);

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c
                          where coalesce((c->>'blocking')::boolean, true) and not (c->>'ok')::boolean),
    'collection_locked', v_locked,
    'checks', v_checks,
    'data_spaces', data_space_report(),
    'not_checkable_here', jsonb_build_array(
      'Custom SMTP connected in Supabase Auth, with the email rate limit raised (docs/AUTH_EMAILS.md)',
      'Supabase plan includes restorable backups',
      'main is branch-protected (PR + CI required)',
      'Researcher sign-off on the instrument version being fielded',
      'Privacy notice and terms reviewed by counsel'),
    'checked_at', now()
  );
end;
$$;
grant execute on function public.pilot_readiness() to authenticated;
