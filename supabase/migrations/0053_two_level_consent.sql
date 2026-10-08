-- ============================================================================
-- The Jesus Index — two-level consent (migration 0053)
--
-- Decisions (Ulrich, 8 Oct 2026):
--   1. One consent per ORGANISATION — exactly where it lives now (0042).
--   2. One consent per SURVEY SENT — stored, and visible to administrators:
--      which organisations agreed and which not, for what, and when.
--   3. No consent, no participation.
--   4/5. "Why consent?" (src/content/consent/why-consent.ts) is shown with
--      every consent request; each confirmation stores which version.
--
-- A "survey sent" is any link that can collect: the organisation's own link
-- (distribution_link_id null) and every room link (0028). Consent attaches to
-- the link — reprinting a QR needs no new consent; a new room does. Test
-- links (0038) are never live and need none.
--
-- What a survey consent records: the countries it runs in, the age bands it
-- invites (validated against the ACTIVE instrument's age_band options — never
-- hard-coded), whether that includes minors, how parental consent was
-- gathered, an optional ethics reference, and — for countries marked
-- block_until_advice in consent_country_rules — a required local-advice
-- reference. Rows are append-only: a new confirmation supersedes, a revoke
-- keeps the row. Staff names and dates only; nothing about any respondent.
--
-- Enforcement (fails closed, demo organisations exempt as everywhere):
--   * a live session can't be created without a current survey consent for
--     its organisation + link;
--   * a session can't take an age band the survey wasn't consented for;
--   * after a statement-version change, older consents keep collecting for
--     survey_consent_grace_days (14), then stop until reconfirmed.
--
-- consent_country_rules is seeded from src/data/consent-countries.json
-- (tests/consentCountriesSeed.test.ts keeps the two identical). Reference
-- only, never legal advice; change it by PR, like the instrument.
-- ============================================================================

insert into public.platform_settings (key, value, note) values
  ('survey_consent_statement_version', '"2026-10-v1"'::jsonb,
   'Version of the per-survey consent statement (src/lib/consent.ts SURVEY_CONSENT_STATEMENT_VERSION). Bump both together. Migration 0053.'),
  ('survey_consent_statement_since', to_jsonb(now()),
   'When the current survey statement version took effect; consents on an older version keep collecting for survey_consent_grace_days after this. Migration 0053.'),
  ('why_consent_version', '"2026-10-v1"'::jsonb,
   'Version of the "Why consent?" text shown with every consent request (src/content/consent/why-consent.ts). Migration 0053.'),
  ('survey_consent_grace_days', '14'::jsonb,
   'Days a survey consent on an older statement version keeps collecting before it must be reconfirmed. Migration 0053.')
on conflict (key) do nothing;

insert into public.reserved_short_names (name, reason) values
  ('resources', 'site: /resources/consent'), ('our-story', 'site: /our-story')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 1. The country reference (public reference data)
-- ----------------------------------------------------------------------------
create table if not exists public.consent_country_rules (
  country_code           text primary key,
  country                text not null,
  care_level             text not null check (care_level in ('standard', 'care', 'high', 'block_until_advice')),
  parental_consent_under int  not null,
  main_law               text not null,
  parental_consent_note  text not null,
  faith_data             text not null,
  ethics_review          text not null,
  data_abroad            text not null,
  summary                text not null,
  reference_version      text not null,
  updated_at             timestamptz not null default now()
);
alter table public.consent_country_rules enable row level security;
drop policy if exists "consent country rules are public reference" on public.consent_country_rules;
create policy "consent country rules are public reference"
  on public.consent_country_rules for select using (true);

insert into public.consent_country_rules
  (country_code, country, care_level, parental_consent_under, main_law, parental_consent_note,
   faith_data, ethics_review, data_abroad, summary, reference_version) values
  ('US', 'United States', 'standard', 13, 'COPPA (FTC); state privacy laws vary', '13 (COPPA)', 'No federal category; some states yes', 'Best practice. An IRB is required only for federally funded research', 'No general limit', 'Standard', '2026-10-v1'),
  ('CA', 'Canada', 'standard', 14, 'PIPEDA (often doesn''t cover non-commercial charities); Quebec Law 25', '14 in Quebec; no fixed federal age', 'Yes in Quebec: express consent', 'Best practice (TCPS 2 binds funded institutions)', 'Quebec: privacy impact assessment first', 'Standard', '2026-10-v1'),
  ('GB', 'United Kingdom', 'standard', 13, 'UK GDPR + DPA 2018, amended 2025 (ICO)', '13 for online services', 'Yes, special category', 'Best practice', 'EU adequate; US via the UK–US data bridge', 'Standard', '2026-10-v1'),
  ('DE', 'Germany', 'standard', 16, 'GDPR + BDSG; churches may use their own regime (KDG, DSG-EKD)', '16 (GDPR default; to confirm)', 'Yes, special category', 'Best practice', 'US via the EU–US Data Privacy Framework or contract clauses', 'Standard; check which church regime applies', '2026-10-v1'),
  ('FR', 'France', 'standard', 15, 'GDPR + Loi Informatique et Libertés (CNIL)', '15, parent and child jointly', 'Yes, special category', 'Best practice', 'As Germany', 'Standard', '2026-10-v1'),
  ('IN', 'India', 'care', 18, 'DPDP Act 2023; core duties from 13 May 2027', '18', 'No separate category', 'Best practice', 'Allowed unless the country is restricted', 'Care: anti-conversion laws in some states', '2026-10-v1'),
  ('ZA', 'South Africa', 'care', 18, 'POPIA (Information Regulator)', '18', 'Yes, special personal information', 'Best practice (NHREC binds health research)', 'Adequate-protection test; may need Regulator authorisation for children''s data', 'Standard+', '2026-10-v1'),
  ('NG', 'Nigeria', 'care', 18, 'NDPA 2023 + GAID 2025 (NDPC)', '18, with age verification', 'Yes', 'Best practice', 'Adequacy, an approved instrument, or informed consent', 'Standard+', '2026-10-v1'),
  ('CN', 'China', 'block_until_advice', 14, 'PIPL 2021 (CAC)', '14', 'Yes, separate consent', 'n/a: state approval governs', 'CAC assessment or contract, plus separate consent', 'Do not run without PRC legal advice', '2026-10-v1'),
  ('ID', 'Indonesia', 'care', 18, 'PDP Law 27/2022; agency not yet operating', '18', 'Religion not listed; children''s data is sensitive', 'Best practice', 'Adequacy, safeguards or consent', 'Care: local advice on religious propagation', '2026-10-v1'),
  ('VN', 'Vietnam', 'high', 18, 'Law 91/2025 on Personal Data + Decree 356 (in force 1 Jan 2026)', '18; parent and child both consent (to confirm)', 'Yes', 'Best practice', 'Transfer impact assessment filed with the Ministry of Public Security', 'High: registered churches only', '2026-10-v1'),
  ('BR', 'Brazil', 'standard', 12, 'LGPD + ECA Digital, 2026 (ANPD)', '12 under LGPD; parental authorisation advised for all under-18s', 'Yes, highlighted consent', 'Not required for anonymous opinion surveys (CNS Res. 510/2016) unless academic', 'Contract clauses, consent or adequacy', 'Standard', '2026-10-v1'),
  ('MX', 'Mexico', 'standard', 18, 'LFPDPPP 2025 (SABG)', '18', 'Yes, express consent', 'Best practice', 'Generally consent; hosting providers often exempt (to confirm)', 'Standard', '2026-10-v1'),
  ('AR', 'Argentina', 'standard', 18, 'Law 25.326 (AAIP); reform pending', '18 (assume)', 'Yes; no one can be compelled to give it', 'Best practice', 'EU adequate; US needs consent or model clauses', 'Standard', '2026-10-v1'),
  ('SA', 'Saudi Arabia', 'block_until_advice', 18, 'PDPL (SDAIA), actively enforced', '18 (assume)', 'Yes', 'Best practice', 'Adequacy or safeguards', 'Very high: proselytising is banned', '2026-10-v1'),
  ('EG', 'Egypt', 'high', 15, 'Law 151/2020 + Executive Regulations, Nov 2025 (PDPC)', '15 (written); 15–17 depends on circumstances', 'Yes; licence needed; all children''s data sensitive', 'Best practice', 'Licence + adequacy + consent', 'High: existing church communities only', '2026-10-v1'),
  ('PK', 'Pakistan', 'block_until_advice', 18, 'No comprehensive law in force; PECA 2016', '18', 'Not under current law', 'National Bioethics Committee if foreign-funded or multi-province', 'No general limit', 'Very high: blasphemy laws; physical-safety risk', '2026-10-v1'),
  ('BD', 'Bangladesh', 'high', 18, 'Personal Data Protection Ordinance 2025 / Act 2026 (status to confirm)', '18', 'Yes, explicit consent', 'Best practice', 'Some data must stay in-country', 'High', '2026-10-v1'),
  ('CD', 'DR Congo', 'care', 18, 'Digital Code 2023; interim regulator ARPTIC', '18 (assume)', 'Yes', 'Best practice', 'Equivalent protection; authorisation regime not yet applied', 'Moderate', '2026-10-v1'),
  ('ET', 'Ethiopia', 'high', 16, 'Proclamation 1321/2024 (Ethiopian Communications Authority)', '16', 'Yes, written consent', 'Best practice', '**Data must be stored in Ethiopia;** sensitive data needs approval to leave', 'High: conflicts with US/EU hosting', '2026-10-v1'),
  ('TZ', 'Tanzania', 'care', 18, 'PDPA 2022 (PDPC, actively enforcing)', '18, prior written consent', 'Yes; children''s data is sensitive', 'Best practice; a COSTECH research permit may apply', 'PDPC permit before transfer', 'Moderate–high', '2026-10-v1')
on conflict (country_code) do update set
  country = excluded.country, care_level = excluded.care_level,
  parental_consent_under = excluded.parental_consent_under, main_law = excluded.main_law,
  parental_consent_note = excluded.parental_consent_note, faith_data = excluded.faith_data,
  ethics_review = excluded.ethics_review, data_abroad = excluded.data_abroad,
  summary = excluded.summary, reference_version = excluded.reference_version, updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. Survey consents (append-only)
-- ----------------------------------------------------------------------------
create table if not exists public.survey_consents (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organisations(id) on delete cascade,
  -- no cascade: a room with consent history can't be deleted out from under
  -- the register (links are deactivated, never deleted; an org delete still
  -- removes both, because this is checked at the end of the statement)
  distribution_link_id     uuid references public.distribution_links(id),
  survey_statement_version text not null,
  why_consent_version      text not null,
  country_codes            text[] not null,
  age_bands                text[] not null,
  includes_minors          boolean not null,
  parental_consent_method  text not null check (parental_consent_method in
                             ('written_form', 'verified_email', 'other_documented', 'not_applicable_adults_only')),
  ethics_reference         text,
  local_advice_reference   text,
  confirmed_by             uuid references public.app_users(id) on delete set null,
  confirmed_at             timestamptz not null default now(),
  revoked_by               uuid references public.app_users(id) on delete set null,
  revoked_at               timestamptz,
  revoke_reason            text
);
comment on table public.survey_consents is
  'One row per consent confirmation for a survey sent (the org''s own link: distribution_link_id null; or a room link). Append-only: superseded and revoked rows stay, with who and when. Staff data only. Migration 0053.';
create unique index if not exists survey_consents_one_current
  on public.survey_consents (org_id, coalesce(distribution_link_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index if not exists survey_consents_org_idx on public.survey_consents (org_id, confirmed_at desc);
alter table public.survey_consents enable row level security;
-- No policies: read and written only through the functions below.

-- Organisation level (0042) also records which "Why consent?" text was
-- current when it confirmed — the card shows it above the confirm button.
alter table public.organisations add column if not exists consent_why_version text;
create or replace function public.stamp_org_why_consent_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.consent_attested_at is distinct from old.consent_attested_at and new.consent_attested_at is not null then
    new.consent_why_version := (select value #>> '{}' from platform_settings where key = 'why_consent_version');
  end if;
  return new;
end $$;
drop trigger if exists organisations_stamp_why_consent on public.organisations;
create trigger organisations_stamp_why_consent
  before update of consent_attested_at on public.organisations
  for each row execute function public.stamp_org_why_consent_version();

-- ----------------------------------------------------------------------------
-- 3. Helpers
-- ----------------------------------------------------------------------------
-- "13_17" → true; "18_22" → false. Bands are instrument data, never constants.
create or replace function public._band_is_minor(p_band text)
returns boolean language sql immutable as $$
  select coalesce((regexp_match(p_band, '^\d+_(\d+)$'))[1]::int < 18, false);
$$;

-- The active instrument's age bands a survey may invite (options that don't end the survey).
create or replace function public._invitable_age_bands()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(o->>'value' order by ord), '{}')
    from instrument_versions v,
         lateral jsonb_array_elements(v.definition->'items') it,
         lateral jsonb_array_elements(coalesce(it->'options', '[]'::jsonb)) with ordinality as x(o, ord)
   where v.status = 'active' and it->>'key' = 'age_band'
     and not coalesce((o->>'ends_survey')::boolean, false);
$$;

create or replace function public._survey_consent_current(p_org uuid, p_link uuid)
returns public.survey_consents language sql stable security definer set search_path = public as $$
  select * from survey_consents
   where org_id = p_org and distribution_link_id is not distinct from p_link and revoked_at is null
   order by confirmed_at desc limit 1;
$$;

-- current · outdated (older statement, still within grace) · expired (older, past grace) · revoked · none
create or replace function public._survey_consent_state(p_org uuid, p_link uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  r survey_consents;
  v_cur text := (select value #>> '{}' from platform_settings where key = 'survey_consent_statement_version');
  v_since timestamptz := coalesce((select (value #>> '{}')::timestamptz from platform_settings where key = 'survey_consent_statement_since'), now());
begin
  r := _survey_consent_current(p_org, p_link);
  if r.id is null then
    return case when exists (select 1 from survey_consents where org_id = p_org and distribution_link_id is not distinct from p_link)
                then 'revoked' else 'none' end;
  end if;
  if r.survey_statement_version = v_cur then return 'current'; end if;
  if now() < v_since + make_interval(days => setting_int('survey_consent_grace_days', 14)) then return 'outdated'; end if;
  return 'expired';
end $$;

create or replace function public.survey_consent_ok(p_org uuid, p_link uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _survey_consent_state(p_org, p_link) in ('current', 'outdated');
$$;

-- Internal only: these read consent rows by org id (ids are public), so no
-- client role may call them; the entry points below check who is asking.
revoke all on function public._invitable_age_bands() from public, anon, authenticated;
revoke all on function public._survey_consent_current(uuid, uuid) from public, anon, authenticated;
revoke all on function public._survey_consent_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.survey_consent_ok(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Enforcement — no consent, no participation
-- ----------------------------------------------------------------------------
create or replace function public.refuse_sessions_without_survey_consent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_demo boolean; r survey_consents;
begin
  select c.org_id, coalesce(o.is_demo, false) into v_org, v_demo
    from campaigns c join organisations o on o.id = c.org_id where c.id = new.campaign_id;
  if v_demo then return new; end if;
  if not survey_consent_ok(v_org, new.distribution_link_id) then
    raise exception 'this survey has not been confirmed for consent and is not collecting responses';
  end if;
  if new.age_band is not null then
    r := _survey_consent_current(v_org, new.distribution_link_id);
    if not (new.age_band = any (r.age_bands)) then
      raise exception 'this survey is not open to this age group';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sessions_refuse_without_survey_consent on public.sessions;
create trigger sessions_refuse_without_survey_consent
  before insert on public.sessions
  for each row execute function public.refuse_sessions_without_survey_consent();

create or replace function public.refuse_unconsented_age_band()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_demo boolean; r survey_consents;
begin
  if new.age_band is null or new.age_band is not distinct from old.age_band then return new; end if;
  select c.org_id, coalesce(o.is_demo, false) into v_org, v_demo
    from campaigns c join organisations o on o.id = c.org_id where c.id = new.campaign_id;
  if v_demo then return new; end if;
  r := _survey_consent_current(v_org, new.distribution_link_id);
  if r.id is null or not (new.age_band = any (r.age_bands)) then
    raise exception 'this survey is not open to this age group';
  end if;
  return new;
end $$;

drop trigger if exists sessions_refuse_unconsented_age_band on public.sessions;
create trigger sessions_refuse_unconsented_age_band
  before update of age_band on public.sessions
  for each row execute function public.refuse_unconsented_age_band();

-- ----------------------------------------------------------------------------
-- 5. Confirm / revoke (organisation admins; platform admins on their behalf)
-- ----------------------------------------------------------------------------
create or replace function public._org_admin_authority(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from org_members m where m.org_id = p_org and m.user_id = auth.uid()
                  and m.status = 'active' and m.role = 'org_admin') then 'own_organisation'
    when my_role() = 'admin' then 'administrator'
  end;
$$;
revoke all on function public._org_admin_authority(uuid) from public, anon, authenticated;

create or replace function public.survey_consent_status(p_org_slug text, p_link_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := _require_org_member(p_org_slug); r survey_consents;
begin
  r := _survey_consent_current(v_org, p_link_id);
  return jsonb_build_object(
    'link_id', p_link_id,
    'state', _survey_consent_state(v_org, p_link_id),
    'confirmed_at', r.confirmed_at,
    'confirmed_by', (select coalesce(full_name, email) from app_users where id = r.confirmed_by),
    'country_codes', to_jsonb(r.country_codes),
    'age_bands', to_jsonb(r.age_bands),
    'includes_minors', r.includes_minors,
    'parental_consent_method', r.parental_consent_method,
    'ethics_reference', r.ethics_reference,
    'local_advice_reference', r.local_advice_reference,
    'statement_version', r.survey_statement_version,
    'why_consent_version', r.why_consent_version);
end $$;
grant execute on function public.survey_consent_status(text, uuid) to authenticated;

create or replace function public.confirm_survey_consent(
  p_org_slug text,
  p_link_id uuid,
  p_country_codes text[],
  p_age_bands text[],
  p_parental_consent_method text,
  p_ethics_reference text,
  p_local_advice_reference text,
  p_statement_version text,
  p_why_consent_version text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype;
  v_auth text;
  v_bands text[] := _invitable_age_bands();
  v_minors boolean;
  v_blocked text[];
  v_unknown text[];
  v_org_current text := (select value #>> '{}' from platform_settings where key = 'consent_statement_version');
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into v_org from organisations where slug = p_org_slug or short_name = p_org_slug limit 1;
  if not found then raise exception 'organisation not found'; end if;
  v_auth := _org_admin_authority(v_org.id);
  if v_auth is null then raise exception 'only an organisation admin can confirm consent for a survey'; end if;

  if v_org.consent_attested_at is null or v_org.consent_statement_version is distinct from v_org_current then
    raise exception 'confirm consent for your organisation first (Survey settings → Consent)';
  end if;
  if p_statement_version is distinct from (select value #>> '{}' from platform_settings where key = 'survey_consent_statement_version')
     or p_why_consent_version is distinct from (select value #>> '{}' from platform_settings where key = 'why_consent_version') then
    raise exception 'the consent text has changed — reload the page and read the current version';
  end if;
  if p_link_id is not null and not exists (select 1 from distribution_links where id = p_link_id and org_id = v_org.id) then
    raise exception 'link not found';
  end if;
  if p_link_id is not null and exists (select 1 from distribution_links where id = p_link_id and is_test) then
    raise exception 'test links never collect real answers and need no consent';
  end if;

  if coalesce(array_length(p_country_codes, 1), 0) = 0 then raise exception 'say which countries this survey runs in'; end if;
  select array_agg(c) into v_unknown from unnest(p_country_codes) c
   where c !~ '^OTHER:.{2,}$' and not exists (select 1 from consent_country_rules r where r.country_code = c);
  if v_unknown is not null then raise exception 'unknown country code(s): %', array_to_string(v_unknown, ', '); end if;
  select array_agg(r.country) into v_blocked from consent_country_rules r
   where r.country_code = any (p_country_codes) and r.care_level = 'block_until_advice';
  if v_blocked is not null and nullif(btrim(coalesce(p_local_advice_reference, '')), '') is null then
    raise exception 'record the local legal advice you have taken for: %', array_to_string(v_blocked, ', ');
  end if;

  if coalesce(array_length(p_age_bands, 1), 0) = 0 then raise exception 'say which age groups this survey invites'; end if;
  if exists (select 1 from unnest(p_age_bands) b where not (b = any (v_bands))) then
    raise exception 'age groups must be among: %', array_to_string(v_bands, ', ');
  end if;
  v_minors := exists (select 1 from unnest(p_age_bands) b where _band_is_minor(b));
  if v_minors and p_parental_consent_method = 'not_applicable_adults_only' then
    raise exception 'this survey invites under-18s: say how parental consent was gathered';
  end if;
  if not v_minors and p_parental_consent_method is distinct from 'not_applicable_adults_only' then
    p_parental_consent_method := 'not_applicable_adults_only';
  end if;

  update survey_consents set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'superseded'
   where org_id = v_org.id and distribution_link_id is not distinct from p_link_id and revoked_at is null;

  insert into survey_consents (org_id, distribution_link_id, survey_statement_version, why_consent_version,
                               country_codes, age_bands, includes_minors, parental_consent_method,
                               ethics_reference, local_advice_reference, confirmed_by)
  values (v_org.id, p_link_id, p_statement_version, p_why_consent_version, p_country_codes, p_age_bands, v_minors,
          p_parental_consent_method, nullif(btrim(p_ethics_reference), ''), nullif(btrim(p_local_advice_reference), ''), auth.uid());

  insert into campaign_action_log (actor, org_id, authority, action, detail)
  values (auth.uid(), v_org.id, v_auth, 'confirm_survey_consent',
          jsonb_build_object('link_id', p_link_id, 'countries', p_country_codes, 'age_bands', p_age_bands,
                             'statement_version', p_statement_version, 'why_consent_version', p_why_consent_version));

  return survey_consent_status(p_org_slug, p_link_id);
end $$;
revoke all on function public.confirm_survey_consent(text, uuid, text[], text[], text, text, text, text, text) from public, anon;
grant execute on function public.confirm_survey_consent(text, uuid, text[], text[], text, text, text, text, text) to authenticated;

create or replace function public.revoke_survey_consent(p_org_slug text, p_link_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_auth text;
begin
  select id into v_org from organisations where slug = p_org_slug or short_name = p_org_slug limit 1;
  if v_org is null then raise exception 'organisation not found'; end if;
  v_auth := _org_admin_authority(v_org);
  if v_auth is null then raise exception 'only an organisation admin can withdraw consent for a survey'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'say why consent is withdrawn'; end if;
  update survey_consents set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
   where org_id = v_org and distribution_link_id is not distinct from p_link_id and revoked_at is null;
  insert into campaign_action_log (actor, org_id, authority, action, detail)
  values (auth.uid(), v_org, v_auth, 'revoke_survey_consent', jsonb_build_object('link_id', p_link_id, 'reason', p_reason));
  return survey_consent_status(p_org_slug, p_link_id);
end $$;
revoke all on function public.revoke_survey_consent(text, uuid, text) from public, anon;
grant execute on function public.revoke_survey_consent(text, uuid, text) to authenticated;

-- Every survey an organisation can send, with its consent state (dashboard).
create or replace function public.org_survey_consents(p_org_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := _require_org_member(p_org_slug);
begin
  return jsonb_build_object(
    'org_attested', (select consent_attested_at is not null from organisations where id = v_org),
    -- only an org admin (or a platform admin) can confirm; the UI hides the button otherwise
    'can_confirm', _org_admin_authority(v_org) is not null,
    'surveys', (
      select jsonb_agg(survey_consent_status(p_org_slug, x.id) || jsonb_build_object('name', x.name) order by x.ord, x.name)
        from (select null::uuid id, 'Your survey'::text name, 0 ord
              union all
              select l.id, l.name, 1 from distribution_links l where l.org_id = v_org and not l.is_test) x));
end $$;
grant execute on function public.org_survey_consents(text) to authenticated;

-- What the respondent's phone may know: is this survey open, and to which
-- age bands. No staff names, no dates.
create or replace function public.survey_consent_public(p_org_slug text, p_link_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org public.organisations%rowtype; v_link uuid; r survey_consents;
begin
  select * into v_org from organisations where short_name = p_org_slug or slug = p_org_slug limit 1;
  if not found then return jsonb_build_object('open', false); end if;
  if coalesce(v_org.is_demo, false) then return jsonb_build_object('open', true, 'age_bands', null); end if;
  if p_link_slug is not null then
    select id into v_link from distribution_links where org_id = v_org.id and slug = p_link_slug;
    if v_link is null then return jsonb_build_object('open', false); end if;
  end if;
  if v_org.consent_attested_at is null or not survey_consent_ok(v_org.id, v_link) then
    return jsonb_build_object('open', false);
  end if;
  r := _survey_consent_current(v_org.id, v_link);
  return jsonb_build_object('open', true, 'age_bands', to_jsonb(r.age_bands));
end $$;
grant execute on function public.survey_consent_public(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. The admin consent register
-- ----------------------------------------------------------------------------
create or replace function public.admin_consent_register()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cur text := (select value #>> '{}' from platform_settings where key = 'consent_statement_version');
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can see the consent register'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'org_id', o.id, 'short_name', o.short_name, 'name', o.name, 'country', o.country, 'status', o.status,
      'org_consent', jsonb_build_object(
        'attested', o.consent_attested_at is not null,
        'attested_at', o.consent_attested_at,
        'attested_by', (select coalesce(full_name, email) from app_users where id = o.consent_attested_by),
        'statement_version', o.consent_statement_version,
        'why_consent_version', o.consent_why_version,
        'current', o.consent_statement_version is not distinct from v_cur),
      'surveys', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'link_id', x.id, 'name', x.name,
          'state', _survey_consent_state(o.id, x.id),
          'history', (select coalesce(jsonb_agg(jsonb_build_object(
                        'confirmed_at', s.confirmed_at,
                        'confirmed_by', (select coalesce(full_name, email) from app_users where id = s.confirmed_by),
                        'countries', to_jsonb(s.country_codes), 'age_bands', to_jsonb(s.age_bands),
                        'includes_minors', s.includes_minors, 'method', s.parental_consent_method,
                        'ethics_reference', s.ethics_reference, 'local_advice_reference', s.local_advice_reference,
                        'statement_version', s.survey_statement_version, 'why_consent_version', s.why_consent_version,
                        'revoked_at', s.revoked_at,
                        'revoked_by', (select coalesce(full_name, email) from app_users where id = s.revoked_by),
                        'revoke_reason', s.revoke_reason) order by s.confirmed_at desc), '[]'::jsonb)
                      from survey_consents s
                     where s.org_id = o.id and s.distribution_link_id is not distinct from x.id)
        ) order by x.ord, x.name), '[]'::jsonb)
        from (select null::uuid id, 'Organisation link'::text name, 0 ord
              union all
              select l.id, l.name, 1 from distribution_links l where l.org_id = o.id and not l.is_test) x)
    ) order by o.name)
    from organisations o where not o.is_demo), '[]'::jsonb);
end $$;
grant execute on function public.admin_consent_register() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Readiness: 0051's body plus one NON-blocking line — which organisations
--    have confirmed consent but not yet for their own survey link.
-- ----------------------------------------------------------------------------
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
  v_overdue bigint := public.deidentify_overdue_count();
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
    || jsonb_build_object('check', 'Each survey sent has its own consent',
         'blocking', false,
         'ok', not exists (select 1 from organisations o
                            where not o.is_demo and o.status = 'active' and o.consent_attested_at is not null
                              and not survey_consent_ok(o.id, null)),
         'detail', coalesce((
           select 'Organisations whose own link still needs survey consent (it stays closed until then): '
                  || string_agg(o.short_name, ', ' order by o.short_name) || '.'
             from organisations o
            where not o.is_demo and o.status = 'active' and o.consent_attested_at is not null
              and not survey_consent_ok(o.id, null)),
           'Every consented organisation has confirmed consent for its own link (rooms are confirmed one by one).'))
    || jsonb_build_object('check', 'A retention period has been decided',
         'blocking', true,
         'ok', v_retention is not null and jsonb_typeof(v_retention) = 'number',
         'detail', format('De-identified after %s days; kept up to %s months, then folded into totals.',
                          setting_int('respondent_deidentify_after_days', 60),
                          coalesce(v_retention #>> '{}', '—')))
    || jsonb_build_object('check', 'Nothing is past the de-identification window',
         'blocking', true,
         'ok', v_overdue = 0,
         'detail', case when v_overdue = 0 then 'The daily de-identification job is up to date.'
                        else v_overdue || ' live sessions are overdue — run deidentify_stale_sessions() and check the schedule.' end)
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
    -- kept for older clients: the same items as plain strings
    'not_checkable_here', (select jsonb_agg(label order by ord) from pilot_signoff_items),
    'hand_checks', (select jsonb_agg(jsonb_build_object(
                      'item', i.item, 'label', i.label, 'requires_note', i.requires_note,
                      'confirmed', s.confirmed_at is not null,
                      'confirmed_at', s.confirmed_at,
                      'confirmed_by', coalesce(u.full_name, u.email),
                      'note', s.note) order by i.ord)
                    from pilot_signoff_items i
                    left join pilot_signoffs s on s.item = i.item and s.revoked_at is null
                    left join app_users u on u.id = s.confirmed_by),
    'all_signed_off', not exists (select 1 from pilot_signoff_items i
                                   where not exists (select 1 from pilot_signoffs s
                                                      where s.item = i.item and s.revoked_at is null)),
    'checked_at', now()
  );
end;
$$;
grant execute on function public.pilot_readiness() to authenticated;
