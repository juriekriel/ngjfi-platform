-- ============================================================================
-- The Jesus Index — pilot safeguards (migration 0042)
--
-- The last set of guards before real respondents, most of them 13–17. Each one
-- closes a gap found in the pilot-readiness audit (Sep 2026):
--
--   1. Edge-consent attestation. Consent is gathered by the organisation, never
--      held centrally (non-negotiable #2) — but until now nothing recorded that
--      the organisation had SAID it gathered it. A live organisation now cannot
--      receive a single response until an org admin (or an administrator, on
--      their behalf, logged) attests that it has obtained the consent its
--      context requires. The attestation is a timestamp, a person and the
--      version of the statement they agreed to. Nothing about any respondent.
--      Demo organisations are exempt (the sandbox has no respondents).
--
--   2. discard_session(). The age question gains an "under 13" answer that ends
--      the survey (instrument config, not code). Nothing about that person may
--      stay behind, so the phone asks the server to delete the in-progress
--      session outright. Only an INCOMPLETE session can be discarded, and only
--      by whoever holds its id — the same trust model as delete_response().
--
--   3. Identifier redaction. Free text (who_is_jesus, city, country) is the one
--      route by which identifying text could reach a database designed to hold
--      none. Email addresses, phone numbers, web addresses and @handles are
--      replaced with [removed] before a row is written — in the live AND test
--      tables. Deliberately conservative: it cannot catch a typed name, which
--      is why the respondent is also asked not to write one. Option values
--      (snake_case codes, age bands like 13_17) never match these patterns.
--
--   4. Retention is a decision, not a default. purge_stale_respondent_data()
--      used to default to 24 months, which would have deleted the raw rows that
--      re-scoring (non-negotiable #3) and trend lines to 2033 depend on. It now
--      refuses to run until platform_settings.respondent_retention_months has
--      been set by a person, and never purges younger rows than that setting.
--
--   5. pilot_readiness(). One administrator call that answers "may we go?"
--      from the database's own state — the checks that don't live in code.
--
--   6. Rooms never name a small place. A link's "places" list now needs
--      min_group_n completed respondents per place before it names one.
--
--   7. resolve_distribution_link() reports is_test, so the survey can let a
--      test link run before the organisation has attested.
--
-- Nothing here stores or exposes anything about a respondent.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Edge-consent attestation
-- ----------------------------------------------------------------------------
alter table public.organisations add column if not exists consent_attested_at timestamptz;
alter table public.organisations add column if not exists consent_attested_by uuid references auth.users(id) on delete set null;
alter table public.organisations add column if not exists consent_statement_version text;

comment on column public.organisations.consent_attested_at is
  'When an org admin (or an administrator on their behalf) attested that the organisation has obtained the consent its context requires — including parental consent for 13–17s where required. No respondent data. Migration 0042.';

insert into public.platform_settings (key, value, note) values
  ('consent_statement_version', '"2026-10-v1"'::jsonb,
   'The version of the edge-consent statement an organisation must attest to (src/lib/consent.ts holds the wording). Bump both together when the wording changes; organisations attested to an older version keep collecting, and the console asks them to re-confirm.')
on conflict (key) do nothing;

create or replace function public.attest_edge_consent(p_org_slug text, p_statement_version text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_authority text;
  v_current text := (select value #>> '{}' from platform_settings where key = 'consent_statement_version');
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select id into v_org from organisations where slug = p_org_slug or short_name = p_org_slug limit 1;
  if v_org is null then raise exception 'organisation not found'; end if;

  if exists (select 1 from org_members m
              where m.org_id = v_org and m.user_id = auth.uid()
                and m.status = 'active' and m.role = 'org_admin') then
    v_authority := 'own_organisation';
  elsif my_role() = 'admin' then
    v_authority := 'administrator';
  else
    raise exception 'only an organisation admin can confirm consent for this organisation';
  end if;

  if p_statement_version is distinct from v_current then
    raise exception 'the consent statement has changed — reload the page and read the current version';
  end if;

  update organisations
     set consent_attested_at = now(),
         consent_attested_by = auth.uid(),
         consent_statement_version = p_statement_version
   where id = v_org;

  insert into campaign_action_log (actor, org_id, authority, action, detail)
  values (auth.uid(), v_org, v_authority, 'attest_edge_consent',
          jsonb_build_object('statement_version', p_statement_version));

  return public.org_consent_status(p_org_slug);
end;
$$;
grant execute on function public.attest_edge_consent(text, text) to authenticated;

create or replace function public.org_consent_status(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r organisations%rowtype;
        v_current text := (select value #>> '{}' from platform_settings where key = 'consent_statement_version');
begin
  select * into r from organisations where slug = p_org_slug or short_name = p_org_slug limit 1;
  if r.id is null then raise exception 'organisation not found'; end if;
  if auth.uid() is null or not (
       exists (select 1 from org_members m where m.org_id = r.id and m.user_id = auth.uid() and m.status = 'active')
       or my_role() = 'admin') then
    raise exception 'not authorised for this organisation';
  end if;
  return jsonb_build_object(
    'attested', r.consent_attested_at is not null,
    'attested_at', r.consent_attested_at,
    'statement_version', r.consent_statement_version,
    'current_version', v_current,
    'current', r.consent_statement_version is not distinct from v_current,
    'required', not r.is_demo,
    'can_attest', exists (select 1 from org_members m where m.org_id = r.id and m.user_id = auth.uid()
                             and m.status = 'active' and m.role = 'org_admin') or my_role() = 'admin'
  );
end;
$$;
grant execute on function public.org_consent_status(text) to authenticated;

-- Belt and braces, the same pattern as 0034's pending-organisation trigger:
-- whatever path creates a live session, an organisation that has not attested
-- cannot receive one. Test links write to test_sessions and are unaffected, so
-- a ministry can still try its survey before it attests.
create or replace function public.refuse_sessions_without_consent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from campaigns c join organisations o on o.id = c.org_id
     where c.id = new.campaign_id and not o.is_demo and o.consent_attested_at is null
  ) then
    raise exception 'this organisation has not yet confirmed consent and is not collecting responses yet';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_refuse_without_consent on public.sessions;
create trigger sessions_refuse_without_consent
  before insert on public.sessions
  for each row execute function public.refuse_sessions_without_consent();


-- ----------------------------------------------------------------------------
-- 2. discard_session — an ineligible respondent leaves nothing behind
-- ----------------------------------------------------------------------------
create or replace function public.discard_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Test links (0038) first, the same routing every survey RPC uses.
  if exists (select 1 from public.test_sessions where id = p_session_id) then
    delete from public.test_sessions where id = p_session_id and not completed;
    return;
  end if;
  -- A completed session is part of an organisation's results; only an
  -- administrator may remove it (admin_response_deletion, 0038).
  if exists (select 1 from sessions where id = p_session_id and completed) then
    raise exception 'a completed response cannot be discarded';
  end if;
  -- responses cascade (0001). A missing id is a no-op: the phone may retry a
  -- discard whose reply was lost, and that must succeed quietly.
  delete from sessions where id = p_session_id and not completed;
end;
$$;
grant execute on function public.discard_session(uuid) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Identifier redaction on free text
-- ----------------------------------------------------------------------------
create or replace function public.redact_identifiers(p text)
returns text
language sql immutable set search_path = public as $$
  select case when p is null then null else
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(p,
            -- email addresses
            '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[removed]', 'g'),
          -- web addresses
          '(https?://|www\.)[^\s]+', '[removed]', 'gi'),
        -- @handles (after the email pass, so user@domain is already gone)
        '(^|[^A-Za-z0-9])@[A-Za-z0-9_.]{2,}', '\1[removed]', 'g'),
      -- phone-like numbers: 7+ digits, optionally with spaces, dots, dashes, brackets, a leading +
      '\+?\(?[0-9][0-9 ().-]{5,}[0-9]', '[removed]', 'g')
  end;
$$;

create or replace function public.redact_free_text_response()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'test_responses' then
    if jsonb_typeof(new.raw) = 'string' then
      new.raw := to_jsonb(redact_identifiers(new.raw #>> '{}'));
    end if;
  else
    if jsonb_typeof(new.raw_value) = 'string' then
      new.raw_value := to_jsonb(redact_identifiers(new.raw_value #>> '{}'));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists responses_redact_identifiers on public.responses;
create trigger responses_redact_identifiers
  before insert or update on public.responses
  for each row execute function public.redact_free_text_response();

drop trigger if exists test_responses_redact_identifiers on public.test_responses;
create trigger test_responses_redact_identifiers
  before insert or update on public.test_responses
  for each row execute function public.redact_free_text_response();

create or replace function public.redact_session_place()
returns trigger language plpgsql set search_path = public as $$
begin
  new.city    := redact_identifiers(new.city);
  new.country := redact_identifiers(new.country);
  return new;
end;
$$;

drop trigger if exists sessions_redact_place on public.sessions;
create trigger sessions_redact_place
  before insert or update of city, country on public.sessions
  for each row execute function public.redact_session_place();

-- Rows written before this migration get the same treatment, once.
update public.responses set raw_value = raw_value where jsonb_typeof(raw_value) = 'string';
update public.test_responses set raw = raw where jsonb_typeof(raw) = 'string';
update public.sessions set city = city, country = country where city is not null or country is not null;


-- ----------------------------------------------------------------------------
-- 4. Retention is a decision, not a default
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('respondent_retention_months', 'null'::jsonb,
   'How long raw respondent rows are kept before purge_stale_respondent_data() may fold them into aggregates and delete them. NULL = not yet decided: the purge refuses to run. A research-ethics decision (it limits re-scoring and trend lines), not a technical one. Migration 0042.')
on conflict (key) do nothing;

-- The 0041 body stays exactly as it was, under a private name; the public
-- entry point in front of it enforces the policy.
alter function public.purge_stale_respondent_data(int) rename to _purge_stale_respondent_data_unchecked;
revoke all on function public._purge_stale_respondent_data_unchecked(int) from public, anon, authenticated;

create or replace function public.purge_stale_respondent_data(p_cutoff_months int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_policy_raw jsonb := (select value from platform_settings where key = 'respondent_retention_months');
  v_policy int;
  v_months int;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can purge respondent data';
  end if;
  if v_policy_raw is null or jsonb_typeof(v_policy_raw) <> 'number' then
    raise exception 'no retention period has been decided (platform_settings.respondent_retention_months is not set) — nothing was purged';
  end if;
  v_policy := (v_policy_raw #>> '{}')::int;
  v_months := coalesce(p_cutoff_months, v_policy);
  if v_months < v_policy then
    raise exception 'the retention policy keeps % months; refusing to purge rows younger than that', v_policy;
  end if;
  return _purge_stale_respondent_data_unchecked(v_months);
end;
$$;
grant execute on function public.purge_stale_respondent_data(int) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. pilot_readiness — "may we go?", from the database's own state
-- ----------------------------------------------------------------------------
create or replace function public.pilot_readiness()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_retention jsonb := (select value from platform_settings where key = 'respondent_retention_months');
  v_unattested jsonb;
  v_versions jsonb;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can run the readiness check';
  end if;

  select coalesce(jsonb_agg(o.short_name order by o.short_name), '[]'::jsonb) into v_unattested
    from organisations o
   where not o.is_demo and o.status = 'active' and o.consent_attested_at is null;

  select coalesce(jsonb_agg(v.version order by v.created_at desc), '[]'::jsonb) into v_versions
    from instrument_versions v where v.status = 'active';

  v_checks := v_checks
    || jsonb_build_object('check', 'Global view is not published yet',
         'ok', not setting_bool('publish_global_view', false),
         'detail', 'publish_global_view stays false until the live space has crossed the gate.')
    || jsonb_build_object('check', 'Every active live organisation has attested edge consent',
         'ok', jsonb_array_length(v_unattested) = 0,
         'detail', case when jsonb_array_length(v_unattested) = 0 then 'All attested.'
                        else 'Not collecting until attested: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_unattested) x) end)
    || jsonb_build_object('check', 'A retention period has been decided',
         'ok', v_retention is not null and jsonb_typeof(v_retention) = 'number',
         'detail', 'platform_settings.respondent_retention_months — a research-ethics decision.')
    || jsonb_build_object('check', 'Exactly one instrument version is active',
         'ok', jsonb_array_length(v_versions) = 1,
         'detail', 'Active: ' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(v_versions) x), 'none') || '. Run npm run db:seed after an instrument change.')
    || jsonb_build_object('check', 'Critical-mass gates are set',
         'ok', setting_int('critical_mass_gate', 0) > 0 and setting_int('country_critical_mass_gate', 0) >= setting_int('critical_mass_gate', 0),
         'detail', format('org/region %s · country %s · smallest group %s',
                          setting_int('critical_mass_gate', 0), setting_int('country_critical_mass_gate', 0), setting_int('min_group_n', 0)));

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where (c->>'ok')::boolean = false),
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


-- ----------------------------------------------------------------------------
-- 6. Rooms never name a small place
--
-- org_distribution_links() (0028) listed every distinct "City, Country" a
-- room's respondents gave, with no floor. Same function, same shape; the
-- places list now only carries places with at least min_group_n completed
-- respondents.
-- ----------------------------------------------------------------------------
create or replace function public.org_distribution_links(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; v_now timestamptz := now();
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or (
    not exists (select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active')
    and my_role() not in ('admin', 'collab')
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'slug', l.slug,
      'audience', l.audience,
      'active_from', l.active_from,
      'active_to', l.active_to,
      'status', case
        when l.active_from is not null and l.active_from > v_now then 'scheduled'
        when l.active_to   is not null and l.active_to   < v_now then 'ended'
        else 'active'
      end,
      'n', coalesce(cnt.n, 0),
      -- Distinct "City, Country" (or just Country) strings this link's
      -- responses came from — an aggregate set, never a per-respondent row,
      -- never joined to an answer or a score. Capped at 8 so a room with many
      -- distinct places reads as a summary, not a directory; places_total
      -- carries the real count so the UI can say "+N more".
      'places', coalesce(places.list, '[]'::jsonb),
      'places_total', coalesce(places.total, 0)
    ) order by l.created_at desc)
    from distribution_links l
    left join (
      select s.distribution_link_id, count(*) n
      from sessions s
      where s.distribution_link_id is not null and s.completed
      group by s.distribution_link_id
    ) cnt on cnt.distribution_link_id = l.id
    left join lateral (
      select
        jsonb_agg(numbered.place order by numbered.place) filter (where numbered.rn <= 8) as list,
        max(numbered.rn) as total
      from (
        select distinct_places.place, row_number() over (order by distinct_places.place) as rn
        from (
          -- 0042: a place is named only once at least min_group_n completed
          -- respondents in this room gave it. Before this, a room of three from
          -- a small town printed the town's name — the city-level
          -- re-identification risk non-negotiable #1 calls out. Smaller places
          -- are still counted in the room's n, just never named.
          select trim(both ', ' from coalesce(s.city, '') ||
                      case when s.city is not null and s.country is not null then ', ' else '' end ||
                      coalesce(s.country, '')) as place
          from sessions s
          where s.distribution_link_id = l.id and s.completed and (s.city is not null or s.country is not null)
          group by 1
          having count(*) >= setting_int('min_group_n', 10)
        ) distinct_places
      ) numbered
    ) places on true
    where l.org_id = v_org.id
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. resolve_distribution_link() also says whether the link is a test link
-- ----------------------------------------------------------------------------
create or replace function public.resolve_distribution_link(p_org_slug text, p_link_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org_id uuid; v_link record; v_now timestamptz := now();
begin
  select id into v_org_id from organisations where slug = p_org_slug;
  if v_org_id is null then raise exception 'organisation not found'; end if;

  select * into v_link from distribution_links where org_id = v_org_id and slug = p_link_slug;
  if not found then raise exception 'link not found'; end if;

  return jsonb_build_object(
    'name', v_link.name,
    'audience', v_link.audience,
    'active_from', v_link.active_from,
    'active_to', v_link.active_to,
    'is_open', (v_link.active_from is null or v_link.active_from <= v_now)
           and (v_link.active_to   is null or v_link.active_to   >= v_now),
    -- 0042: a test link works before the organisation has attested consent
    -- (its answers go to test_sessions), so the survey needs to know.
    'is_test', coalesce(v_link.is_test, false)
  );
end;
$$;
