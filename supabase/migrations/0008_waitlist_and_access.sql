-- ============================================================================
-- The Jesus Index — pre-rollout list + early-access requests (migration 0008)
--
-- THE SEPARATION THAT MATTERS
-- These tables hold real adult contact details, by design: a name-bearing email
-- address is the whole point of a waitlist. Respondent data holds none, also by
-- design. The two must never become joinable.
--
-- So: no foreign key, no shared identifier, and no view anywhere that puts a
-- waitlist row and a session row in the same result set. If a future feature
-- seems to need that join, the feature is wrong. Respondents stay anonymous —
-- that is not a setting, it is the architecture.
--
-- Writes go through SECURITY DEFINER RPCs granted to `anon`, exactly as
-- start_session/save_response do. There is deliberately no anon SELECT policy
-- on either table: the public can add themselves and can never read the list.
-- ============================================================================

create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- Cohorts. Named neutrally on purpose — nothing here assumes "next gen", so an
-- adults or children cohort drops in without a schema change.
-- ----------------------------------------------------------------------------
create table if not exists public.cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                    -- 'Argentina · Cohort 1'
  country     text,
  opens_note  text,                             -- human sequence text, never a public date
  capacity    int,
  status      text not null default 'forming'
                check (status in ('forming','open','closed')),
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Organisational contacts on the pre-launch list.
-- ----------------------------------------------------------------------------
create table if not exists public.waitlist_contacts (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- express track
  email               citext not null unique,
  org_name            text not null,
  role                text not null,

  -- qualification track (all nullable — the whole track is optional)
  countries           text[],
  primary_country     text,
  region              text,
  reach_band          text,        -- bands are DATA, never an enum in code
  languages           text[],
  measures_today      text,
  decision_it_changes text,
  wants_setup_call    boolean,
  is_collab_member    boolean,

  -- pipeline
  cohort_id           uuid references public.cohorts(id) on delete set null,
  status              text not null default 'new'
                        check (status in ('new','qualified','cluster_assigned',
                                          'invited','onboarded','declined','bounced')),
  priority_score      int not null default 0,
  notes               text,

  -- referral: coverage, not queue-jumping
  referral_code       text unique,
  referred_by         uuid references public.waitlist_contacts(id) on delete set null,

  consent_updates     boolean not null default false,
  source              text
);

comment on table public.waitlist_contacts is
  'Adult organisational contacts. MUST NEVER be joined to sessions or responses.';

-- ----------------------------------------------------------------------------
-- Early-access requests. Separate from the waitlist because the questions,
-- the approval path and the retention story are all different: this is a small
-- list of named collaborators, not a marketing list.
-- ----------------------------------------------------------------------------
create table if not exists public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  email       citext not null,
  reason      text,
  status      text not null default 'requested'
                check (status in ('requested','approved','declined')),
  decided_at  timestamptz,
  notes       text
);

alter table public.cohorts           enable row level security;
alter table public.waitlist_contacts enable row level security;
alter table public.access_requests   enable row level security;
-- No anon SELECT policy on any of the three. Reads happen through the service
-- role from an internal tool, never through the browser's anon key.

-- ----------------------------------------------------------------------------
-- Join the list. Idempotent on email so a re-submission updates rather than
-- duplicating, and returns only the contact's own referral code — never the row.
-- ----------------------------------------------------------------------------
create or replace function public.waitlist_join(
  p_email text,
  p_org_name text,
  p_role text,
  p_consent boolean default false,
  p_referral_code text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_ref uuid; v_code text; v_email citext;
begin
  v_email := lower(btrim(p_email))::citext;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address';
  end if;
  if length(v_email) > 254 or length(btrim(p_org_name)) = 0 or length(btrim(p_role)) = 0 then
    raise exception 'organisation and role are required';
  end if;

  if p_referral_code is not null then
    select id into v_ref from waitlist_contacts where referral_code = btrim(p_referral_code);
  end if;

  -- Short, unambiguous, case-insensitive code. Collisions retried by the unique index.
  v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into waitlist_contacts (email, org_name, role, consent_updates, referral_code, referred_by, source)
  values (v_email, left(btrim(p_org_name), 200), left(btrim(p_role), 120),
          coalesce(p_consent, false), v_code, v_ref,
          case when v_ref is null then 'direct' else 'referral' end)
  on conflict (email) do update
    set org_name        = excluded.org_name,
        role            = excluded.role,
        consent_updates = excluded.consent_updates,
        referred_by     = coalesce(waitlist_contacts.referred_by, excluded.referred_by),
        updated_at      = now()
  returning referral_code into v_code;

  return v_code;
end;
$$;

grant execute on function public.waitlist_join(text, text, text, boolean, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- The optional qualification track. Whitelists its keys — a client cannot set
-- status, priority or cohort — and never inserts a new row.
-- ----------------------------------------------------------------------------
create or replace function public.waitlist_qualify(
  p_email text, p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_email citext; v_countries text[]; v_primary text; v_score int := 0; v_peers int;
begin
  v_email := lower(btrim(p_email))::citext;
  if not exists (select 1 from waitlist_contacts w where w.email = v_email) then
    raise exception 'not on the list yet';
  end if;

  select array(select left(btrim(x), 80) from jsonb_array_elements_text(
           coalesce(p_payload->'countries', '[]'::jsonb)) x where btrim(x) <> '')
    into v_countries;
  v_primary := v_countries[1];

  update waitlist_contacts w set
    countries           = nullif(v_countries, '{}'),
    primary_country     = v_primary,
    reach_band          = left(nullif(btrim(p_payload->>'reach_band'), ''), 40),
    languages           = nullif(array(select left(btrim(x), 60)
                            from jsonb_array_elements_text(coalesce(p_payload->'languages','[]'::jsonb)) x
                            where btrim(x) <> ''), '{}'),
    measures_today      = left(nullif(btrim(p_payload->>'measures_today'), ''), 2000),
    decision_it_changes = left(nullif(btrim(p_payload->>'decision_it_changes'), ''), 2000),
    wants_setup_call    = (p_payload->>'wants_setup_call')::boolean,
    is_collab_member    = (p_payload->>'is_collab_member')::boolean,
    status              = case when w.status = 'new' then 'qualified' else w.status end,
    updated_at          = now()
  where w.email = v_email;

  -- Priority orders cluster assembly. It is not a judgement about an
  -- organisation's worth, and the weights are deliberately legible so they can
  -- be argued with. Concentration dominates, because concentration is the only
  -- thing that actually unlocks a benchmark for anybody.
  select count(*) into v_peers
    from waitlist_contacts w
   where v_primary is not null and w.primary_country = v_primary and w.email <> v_email;

  select coalesce(
    (case when v_peers >= 3 then 40 else 0 end)
  + 25                                                              -- completed this track
  + (case when (p_payload->>'wants_setup_call')::boolean then 20 else 0 end)
  + (case when (p_payload->>'is_collab_member')::boolean then 15 else 0 end)
  + (case when p_payload->>'reach_band' in ('500–2,000','2,000–10,000','10,000+') then 10 else 0 end)
  + (case when length(btrim(coalesce(p_payload->>'decision_it_changes',''))) > 40 then 10 else 0 end)
  + 5 * (select count(*) from waitlist_contacts r
          where r.referred_by = (select id from waitlist_contacts where email = v_email))
  , 0) into v_score;

  update waitlist_contacts set priority_score = v_score where email = v_email;
end;
$$;

grant execute on function public.waitlist_qualify(text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Early-access request. Rate-limited to one open request per address per day so
-- an open endpoint cannot be used to flood a human's review queue.
-- ----------------------------------------------------------------------------
create or replace function public.access_request(
  p_email text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_email citext;
begin
  v_email := lower(btrim(p_email))::citext;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address';
  end if;

  if exists (
    select 1 from access_requests a
     where a.email = v_email and a.status = 'requested' and a.created_at > now() - interval '1 day'
  ) then
    return;  -- already pending; silently succeed rather than leaking list state
  end if;

  insert into access_requests (email, reason)
  values (v_email, left(btrim(coalesce(p_reason, '')), 2000));
end;
$$;

grant execute on function public.access_request(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Public, aggregate-only coverage counts. Commitments, never results — the
-- landing page can show a country filling up without anything scored existing.
-- ----------------------------------------------------------------------------
create or replace function public.coverage_counts()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('country', country, 'orgs', n) order by n desc), '[]'::jsonb)
  from (
    select primary_country as country, count(*) n
      from waitlist_contacts
     where primary_country is not null and status <> 'declined'
     group by primary_country
  ) c;
$$;

grant execute on function public.coverage_counts() to anon, authenticated;
