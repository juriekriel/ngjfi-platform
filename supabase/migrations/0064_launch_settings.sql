-- ============================================================================
-- The Jesus Index — launch settings (migration 0064, launch readiness)
-- ============================================================================
-- 1. REPORTING GATES CONFIRMED (decision 9). The working values become the
--    launch values, written explicitly so the database states them rather
--    than relying on earlier defaults:
--      min_group_n                 10    no score for fewer than 10 people
--      room_min_n                  10    the same floor for one survey link
--      critical_mass_gate         400    a city or area (none collected in v7)
--      country_critical_mass_gate 2000   a country
--    Still versioned config: a later migration can change any of them.
--
-- 2. THE SURVEY CONSENT STATEMENT, version 2026-10-v2. v1 had organisations
--    confirm that young people would be told "they can skip any question".
--    The 50 scored questions have no Skip, so that sentence was not true.
--    v2 says they can stop at any time (src/lib/consent.ts; same version
--    there). Survey consents given under v1 keep collecting for the
--    survey_consent_grace_days (14) after survey_consent_statement_since, then
--    ask to be reconfirmed — the mechanism migration 0053 built for exactly this.
--
-- Nothing about any respondent is read or changed.
-- ============================================================================

insert into public.platform_settings (key, value, note, updated_at) values
  ('min_group_n',                '10'::jsonb,   'Confirmed for launch (decision 9, migration 0064): no score for fewer than 10 people.', now()),
  ('room_min_n',                 '10'::jsonb,   'Confirmed for launch (decision 9, migration 0064): the same floor for a single survey link.', now()),
  ('critical_mass_gate',         '400'::jsonb,  'Confirmed for launch (decision 9, migration 0064): a city or area needs 400 completions.', now()),
  ('country_critical_mass_gate', '2000'::jsonb, 'Confirmed for launch (decision 9, migration 0064): a country needs 2,000 completions.', now())
on conflict (key) do update set value = excluded.value, note = excluded.note, updated_at = now();

update public.platform_settings
   set value = '"2026-10-v2"'::jsonb, updated_at = now(),
       note = 'Version of the per-survey consent statement (src/lib/consent.ts SURVEY_CONSENT_STATEMENT_VERSION). Bump both together. v2 (0064): "can stop at any time", no promise of skipping any question.'
 where key = 'survey_consent_statement_version';

update public.platform_settings
   set value = to_jsonb(now()), updated_at = now()
 where key = 'survey_consent_statement_since';
