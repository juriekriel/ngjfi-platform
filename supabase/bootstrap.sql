-- ============================================================================
-- The Jesus Index — full schema bootstrap
--
-- GENERATED FILE. Do not edit: change a migration and re-run
--   node scripts/build-bootstrap.mjs
--
-- Stands up a complete, empty database in one paste. Run it in a new Supabase
-- project's SQL editor, top to bottom, then:
--
--   1.  npm run db:seed            loads the current instrument version + the demo organisation
--   2.  select public.data_space_report();
--                                  verify the live space is empty before you
--                                  point anything real at it
--
-- Demo data is OPTIONAL and is deliberately NOT included here. The synthetic
-- seed files under supabase/ are run separately, and only against a database
-- that is meant to serve the sandbox. A database intended solely for live data
-- should never have them run against it — that is the cleanest separation
-- available, and it costs nothing.
--
-- Migrations included, in order:
--   0001_schema.sql
--   0002_rpcs.sql
--   0003_analytics.sql
--   0004_demo_flag.sql
--   0005_analytics_plus.sql
--   0006_demo_dashboard.sql
--   0007_branching_and_session_context.sql
--   0008_waitlist_and_access.sql
--   0009_data_spaces.sql
--   0010_roles_and_short_names.sql
--   0011_path_based_short_names.sql
--   0012_admin_worklist.sql
--   0013_networks.sql
--   0014_waves_and_survey_setup.sql
--   0015_fix_intelligence_data_contract.sql
--   0016_org_activation_status.sql
--   0017_org_benchmark_comparison.sql
--   0018_regional_map_layer.sql
--   0019_privacy_and_metadata_compliance.sql
--   0020_country_critical_mass_tier.sql
--   0021_insight_layer_reporting.sql
--   0022_worklist_country_source.sql
--   0023_reconcile_demo_dashboard.sql
--   0024_schema_migrations_ledger.sql
--   0025_reinstate_gender_and_city.sql
--   0026_exploration_index.sql
--   0027_fix_start_session_overload.sql
--   0028_distribution_links_and_admin_console.sql
--   0029_score_scale_1_to_5.sql
--   0030_platform_totals_seasons_consulting.sql
--   0031_my_context_add_slug.sql
--   0032_collab_overview.sql
--   0033_rooms_scoring_and_consulting_requests.sql
--   0034_onboarding.sql
--   0035_instrument_change_requests.sql
--   0036_public_campaign_fix_and_org_settings.sql
-- ============================================================================


-- ─── 0001_schema.sql ───────────────────────────────────────────────────

-- ============================================================================
-- NGJFI platform — core schema (migration 0001)
-- Multi-tenant, privacy-first. Respondents are ANONYMOUS (no PII, no auth).
-- Org admins / facilitators authenticate (see 0002 for auth + domain verify).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Organisations (ministries / churches / networks)
-- ----------------------------------------------------------------------------
create table if not exists public.organisations (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,                 -- used in the URL: /sunrise
  name            text not null,
  logo_url        text,
  brand_color     text default '#e0742f',
  region          text,                                 -- one of the 11 NXT Move regions
  country         text,
  website_domain  text,                                 -- e.g. 'onehope.org' (apex, lowercased)
  membership_tier text not null default 'external'
                    check (membership_tier in ('collab_member','external')),
  verified        boolean not null default false,       -- set true once a website-domain email is confirmed
  consent_model   text,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Auth: profile mirror of auth.users + org membership/roles
-- ----------------------------------------------------------------------------
create table if not exists public.app_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  user_id    uuid not null references public.app_users(id) on delete cascade,
  role       text not null default 'org_admin'
               check (role in ('org_admin','facilitator','collab_admin','researcher','super_admin')),
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Instrument (versioned config) + expanded items for tagging/queries
-- ----------------------------------------------------------------------------
create table if not exists public.instrument_versions (
  id              uuid primary key default gen_random_uuid(),
  version         text unique not null,                 -- 'v0'
  scoring_version text not null default 'v0.1.0',
  status          text not null default 'draft'
                    check (status in ('draft','active','archived')),
  definition      jsonb,                                -- full instrument JSON (source of item text/options/i18n)
  created_at      timestamptz not null default now()
);

create table if not exists public.items (
  id                    uuid primary key default gen_random_uuid(),
  instrument_version_id uuid not null references public.instrument_versions(id) on delete cascade,
  key                   text not null,
  question_domain       text not null,                  -- follow|mission|world|screener|journey|demographic
  tier                  text not null,                  -- exposure|response|formation|multiplication|na
  type                  text not null,                  -- likert_5|yes_no|frequency|single_select|multi_select|screener
  scored                boolean not null default true,
  reverse_scored        boolean not null default false,
  scale                 jsonb,                          -- e.g. {"points":4}
  ord                   int,
  unique (instrument_version_id, key)
);

-- ----------------------------------------------------------------------------
-- Campaigns / survey instances (per org)
-- ----------------------------------------------------------------------------
create table if not exists public.campaigns (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organisations(id) on delete cascade,
  slug                  text not null default 'default',
  instrument_version_id uuid not null references public.instrument_versions(id),
  scoring_version       text not null default 'v0.1.0',
  source_label          text,
  locale                text not null default 'en',
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (org_id, slug)
);

-- ----------------------------------------------------------------------------
-- Respondent sessions (ANONYMOUS — NO PII) + responses
-- ----------------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  age_band    text,                                     -- band, never a birthdate
  gender      text,
  country     text,
  city        text,                                     -- optional, coarse
  locale      text not null default 'en',
  consent     jsonb,                                    -- consent flags (incl. parental for 13–17)
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
  -- deliberately: no name, no email, no precise location, no IP
);

create table if not exists public.responses (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  item_id         uuid references public.items(id),
  item_key        text not null,
  raw_value       jsonb,
  normalized      numeric,                              -- 0..100, or null for diagnostic/invalid
  tier            text,
  question_domain text,
  created_at      timestamptz not null default now(),
  unique (session_id, item_id)
);

-- ----------------------------------------------------------------------------
-- Derived scores + geography benchmarks (critical-mass gated)
-- ----------------------------------------------------------------------------
create table if not exists public.scores (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null,                        -- session|org|campaign|country|region|global
  org_id          uuid references public.organisations(id) on delete cascade,
  campaign_id     uuid references public.campaigns(id) on delete cascade,
  geography       text,
  index_score     numeric,
  tier_scores     jsonb,
  domain_scores   jsonb,
  matrix          jsonb,
  scoring_version text,
  n               int,
  period          text,
  created_at      timestamptz not null default now()
);

create table if not exists public.benchmarks (
  id          uuid primary key default gen_random_uuid(),
  geography   text not null,
  period      text not null,
  aggregates  jsonb,
  n           int not null default 0,
  gate_passed boolean not null default false,           -- true once n >= critical mass
  created_at  timestamptz not null default now(),
  unique (geography, period)
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_items_iv         on public.items(instrument_version_id);
create index if not exists idx_campaigns_org    on public.campaigns(org_id);
create index if not exists idx_sessions_campaign on public.sessions(campaign_id);
create index if not exists idx_responses_session on public.responses(session_id);
create index if not exists idx_responses_item    on public.responses(item_id);
create index if not exists idx_org_members_user  on public.org_members(user_id);
create index if not exists idx_org_members_org   on public.org_members(org_id);

-- ----------------------------------------------------------------------------
-- New-auth-user trigger: mirror auth.users into app_users
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.app_users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.organisations      enable row level security;
alter table public.app_users          enable row level security;
alter table public.org_members        enable row level security;
alter table public.instrument_versions enable row level security;
alter table public.items              enable row level security;
alter table public.campaigns          enable row level security;
alter table public.sessions           enable row level security;
alter table public.responses          enable row level security;
alter table public.scores             enable row level security;
alter table public.benchmarks         enable row level security;

-- Public (anon + authenticated) READ for the survey to render:
create policy "orgs are publicly readable"
  on public.organisations for select to anon, authenticated using (true);

create policy "active instrument versions readable"
  on public.instrument_versions for select to anon, authenticated using (true);

create policy "items readable"
  on public.items for select to anon, authenticated using (true);

create policy "active campaigns readable"
  on public.campaigns for select to anon, authenticated using (active = true);

create policy "passed benchmarks readable"
  on public.benchmarks for select to anon, authenticated using (gate_passed = true);

-- Authenticated users manage their own profile:
create policy "users read own profile"
  on public.app_users for select to authenticated using (id = auth.uid());
create policy "users update own profile"
  on public.app_users for update to authenticated using (id = auth.uid());

-- Members can see their own memberships:
create policy "members read own memberships"
  on public.org_members for select to authenticated using (user_id = auth.uid());

-- Org admins can update their own org's branding:
create policy "org admins update their org"
  on public.organisations for update to authenticated
  using (exists (
    select 1 from public.org_members m
    where m.org_id = organisations.id and m.user_id = auth.uid()
      and m.role in ('org_admin','collab_admin','super_admin') and m.status = 'active'
  ));

-- NOTE: sessions, responses, and scores have NO anon/authenticated policies on
-- purpose. All writes happen through SECURITY DEFINER RPCs (migration 0002),
-- and orgs only ever read AGGREGATES via the org_dashboard() RPC — never rows.


-- ─── 0002_rpcs.sql ─────────────────────────────────────────────────────

-- ============================================================================
-- NGJFI platform — functions & RPCs (migration 0002)
--  * ngjfi_normalize      : 0–100 normalisation, mirrors src/lib/scoring.ts
--  * start_session/save_response/finish_session : anonymous respondent writes
--  * join_org_by_domain   : ministry verification by website-domain email match
--  * org_dashboard        : aggregates only, membership-gated (never raw rows)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Normalisation (kept in lockstep with the TypeScript engine)
-- ----------------------------------------------------------------------------
create or replace function public.ngjfi_normalize(
  p_type text, p_scored boolean, p_reverse boolean, p_scale jsonb, p_raw jsonb
) returns numeric
language plpgsql immutable as $$
declare base numeric; v numeric; points int; s text;
begin
  if not p_scored or p_raw is null then return null; end if;

  if p_type = 'likert_5' then
    begin v := (p_raw #>> '{}')::numeric; exception when others then return null; end;
    if v is null or v < 1 or v > 5 then return null; end if;
    base := ((v - 1) / 4.0) * 100;

  elsif p_type = 'yes_no' then
    s := lower(trim(both '"' from p_raw::text));
    if s in ('true','1','yes') then base := 100;
    elsif s in ('false','0','no') then base := 0;
    else return null; end if;

  elsif p_type = 'frequency' then
    points := coalesce((p_scale ->> 'points')::int, 4);
    if points < 2 then return null; end if;
    begin v := (p_raw #>> '{}')::numeric; exception when others then return null; end;
    if v is null or v < 0 or v > points - 1 or v <> floor(v) then return null; end if;
    base := (v / (points - 1)) * 100;

  else
    return null; -- single_select / multi_select / screener are diagnostic
  end if;

  if p_reverse then base := 100 - base; end if;
  return round(base, 4);
end;
$$;

-- ----------------------------------------------------------------------------
-- Anonymous respondent writes (SECURITY DEFINER; validated; no PII)
-- ----------------------------------------------------------------------------
create or replace function public.start_session(
  p_campaign_id uuid,
  p_age_band text default null,
  p_gender   text default null,
  p_country  text default null,
  p_city     text default null,
  p_locale   text default 'en',
  p_consent  jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not exists (select 1 from campaigns c where c.id = p_campaign_id and c.active) then
    raise exception 'campaign not found or inactive';
  end if;
  insert into sessions (campaign_id, age_band, gender, country, city, locale, consent)
  values (p_campaign_id, p_age_band, p_gender, p_country, p_city,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.save_response(
  p_session_id uuid, p_item_key text, p_raw jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_item public.items%rowtype; v_iv uuid; v_norm numeric;
begin
  select c.instrument_version_id into v_iv
  from sessions s join campaigns c on c.id = s.campaign_id
  where s.id = p_session_id;
  if v_iv is null then raise exception 'session not found'; end if;

  select * into v_item from items where instrument_version_id = v_iv and key = p_item_key;
  if not found then raise exception 'unknown item %', p_item_key; end if;

  v_norm := public.ngjfi_normalize(v_item.type, v_item.scored, v_item.reverse_scored, v_item.scale, p_raw);

  insert into responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain)
  values (p_session_id, v_item.id, p_item_key, p_raw, v_norm, v_item.tier, v_item.question_domain)
  on conflict (session_id, item_id)
    do update set raw_value = excluded.raw_value, normalized = excluded.normalized;
end;
$$;

create or replace function public.finish_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update sessions set completed = true where id = p_session_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ministry verification: claim/join an org using a confirmed website-domain email
--  (the email is already confirmed by Supabase Auth; here we match its domain)
-- ----------------------------------------------------------------------------
create or replace function public.join_org_by_domain(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_email_domain text;
  v_org public.organisations%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'no email on account'; end if;
  v_email_domain := lower(split_part(v_email, '@', 2));

  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_org.website_domain is null then raise exception 'organisation has no website domain set'; end if;

  -- accept exact match or a subdomain of the ministry's domain
  if lower(v_org.website_domain) <> v_email_domain
     and v_email_domain not like ('%.' || lower(v_org.website_domain)) then
    return jsonb_build_object(
      'ok', false, 'reason', 'email_domain_mismatch',
      'email_domain', v_email_domain, 'expected', lower(v_org.website_domain));
  end if;

  insert into app_users (id, email) values (v_uid, v_email)
    on conflict (id) do update set email = excluded.email;

  insert into org_members (org_id, user_id, role)
  values (v_org.id, v_uid, 'org_admin')
  on conflict (org_id, user_id) do nothing;

  update organisations set verified = true where id = v_org.id;

  return jsonb_build_object('ok', true, 'org_id', v_org.id, 'role', 'org_admin');
end;
$$;

-- ----------------------------------------------------------------------------
-- Org dashboard: AGGREGATES ONLY, membership-gated. Never returns raw responses.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_tiers jsonb; v_domains jsonb; v_index numeric; v_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m
    where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select
    (select count(*) from r),
    (select jsonb_object_agg(tier, m) from
        (select tier, round(avg(normalized),1) as m from r group by tier) t),
    (select jsonb_object_agg(question_domain, m) from
        (select question_domain, round(avg(normalized),1) as m from r group by question_domain) d)
  into v_n, v_tiers, v_domains;

  select round(avg(value::numeric),1) into v_index
  from jsonb_each_text(coalesce(v_tiers, '{}'::jsonb))
  where key in ('exposure','response','formation','multiplication');

  return jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', coalesce(v_n, 0),
    'index', v_index,
    'tiers', coalesce(v_tiers, '{}'::jsonb),
    'domains', coalesce(v_domains, '{}'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function public.start_session(uuid,text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.save_response(uuid,text,jsonb) to anon, authenticated;
grant execute on function public.finish_session(uuid) to anon, authenticated;
grant execute on function public.join_org_by_domain(text) to authenticated;
grant execute on function public.org_dashboard(text) to authenticated;


-- ─── 0003_analytics.sql ────────────────────────────────────────────────

-- ============================================================================
-- NGJFI platform — analytics RPCs (migration 0003)
--   * collab_intelligence(): aggregate cross-org picture (anon-readable; aggregates only)
--   * org_dashboard(): extended with 3x4 matrix + per-item means (membership-gated)
-- ============================================================================

create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s     on s.id = rsp.session_id
    join campaigns c    on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from
                 (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from
                 (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m
                       from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n)
                          order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n
                    from r where region is not null group by region) g)
  ) into result;
  return coalesce(result, '{}'::jsonb);
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Extended org dashboard (aggregates only, membership-gated)
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m
    where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', (select count(*) from r),
    'tiers',   (select jsonb_object_agg(tier, m) from
                 (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from
                 (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m
                       from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object(
                          'key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(*) n
                    from r group by item_key, question_domain, tier) z)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));

  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;


-- ─── 0004_demo_flag.sql ────────────────────────────────────────────────

-- ============================================================================
-- NGJFI platform — demo flag (migration 0004)
-- Marks synthetic/demo organisations so ALL demo data can be removed in one
-- command before official testing (see supabase/delete_demo_data.sql).
-- ============================================================================

alter table public.organisations
  add column if not exists is_demo boolean not null default false;

-- flag the earlier seed/demo orgs too, so teardown removes everything synthetic
update public.organisations set is_demo = true
where slug in ('sunrise','grace-cdmx','lighthouse-mnl','anchor-nairobi','cityreach-london','demo');


-- ─── 0005_analytics_plus.sql ───────────────────────────────────────────

-- ============================================================================
-- NGJFI platform — analytics extensions (migration 0005)
--   collab_intelligence(): + trend (by year), + findings (corr/quartiles), + countries (for the map)
--   org_dashboard(): + trend (index by year)
-- ============================================================================

create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                    where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;
  return coalesce(result, '{}'::jsonb);
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', (select count(*) from r),
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(*) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;


-- ─── 0006_demo_dashboard.sql ───────────────────────────────────────────

-- ============================================================================
-- NGJFI platform — public demo dashboard (migration 0006)
--
-- The prototype at jfindx.org has to be walkable end-to-end with no sign-in.
-- `org_dashboard` stays exactly as it is: membership-gated, for real ministries.
-- This adds a sibling that returns the SAME aggregate shape but ONLY for
-- organisations flagged `is_demo = true`, and grants it to `anon`.
--
-- Safety properties:
--   * hard-fails on any org where is_demo is false — no real ministry can leak
--     through this path, now or after real data lands;
--   * returns aggregates only (means and counts), never a raw response row;
--   * carries `demo: true` in the payload so the UI must label it;
--   * neutralised by supabase/delete_demo_data.sql teardown, since that deletes
--     the demo orgs this function is restricted to.
-- ============================================================================

create or replace function public.org_dashboard_demo(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org public.organisations%rowtype; result jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if not coalesce(v_org.is_demo, false) then
    raise exception 'demo preview is only available for demo organisations';
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'demo', true,
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', (select count(*) from r),
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(*) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard_demo(text) to anon, authenticated;

-- Convenience for the prototype landing: which orgs can be previewed publicly.
create or replace function public.demo_orgs()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by name), '[]'::jsonb)
  from organisations where is_demo = true;
$$;

grant execute on function public.demo_orgs() to anon, authenticated;


-- ─── 0007_branching_and_session_context.sql ────────────────────────────

-- ============================================================================
-- NGJFI platform — branching support + session context (migration 0007)
--
-- Two respondent-side RPCs the adaptive survey needs, plus the v1 instrument
-- switchover. Both are anonymous-callable for the same reason save_response is:
-- respondents never authenticate.
--
--   set_session_context  fixes the bug where age_band was asked as question 1
--                        but never written to sessions, leaving the Collab
--                        Intelligence "multiplication by age" breakdown empty
--                        for every real respondent (it read sessions.age_band,
--                        which only the seeded demo rows ever populated).
--
--   delete_response      lets the survey withdraw an answer when the respondent
--                        goes back and changes something that closes a branch
--                        they had already walked. Without it, a session could
--                        hold answers to questions the instrument's own rules
--                        say were never asked.
--
-- On skipped items: nothing is stored. Per the decision of 5 Aug 2026, a skipped
-- item is "not asked", NOT a structural zero — tier means are computed only over
-- respondents who reached that tier. Absence stays fully explainable because
-- `show_if` is a pure function of the instrument version plus the stored answers,
-- and responses bind to their instrument version. Note the consequence for
-- reading the dashboards: Formation and Multiplication scores now describe the
-- people who got that far, not the whole sample, so the journey funnel must be
-- read alongside the response counts at each tier rather than on its own.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Write an allow-listed demographic field onto the anonymous session.
-- The allow-list is the whole point: it keeps this from becoming a generic
-- "write any column" hole in a table that must never hold identifying data.
-- ----------------------------------------------------------------------------
create or replace function public.set_session_context(
  p_session_id uuid, p_field text, p_value text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;

  if p_field not in ('age_band', 'gender', 'country', 'city') then
    raise exception 'field % is not settable from the survey', p_field;
  end if;

  -- Bounded: these are bands and coarse place names, never free text.
  if p_value is not null and length(p_value) > 64 then
    raise exception 'value too long for %', p_field;
  end if;

  if    p_field = 'age_band' then update sessions set age_band = p_value where id = p_session_id;
  elsif p_field = 'gender'   then update sessions set gender   = p_value where id = p_session_id;
  elsif p_field = 'country'  then update sessions set country  = p_value where id = p_session_id;
  elsif p_field = 'city'     then update sessions set city     = p_value where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.set_session_context(uuid, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Withdraw a single answer from an in-progress session.
-- Scoped to one session and one item; a respondent can only ever affect the
-- session id they are holding, exactly as with save_response.
-- ----------------------------------------------------------------------------
create or replace function public.delete_response(
  p_session_id uuid, p_item_key text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;
  delete from responses where session_id = p_session_id and item_key = p_item_key;
end;
$$;

grant execute on function public.delete_response(uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Guard the free-text item. `who_is_jesus` is the only open-ended question in
-- the instrument and the only route by which identifying text could reach a
-- database designed to hold none. The UI caps length and warns the respondent;
-- this enforces the cap server-side so a crafted client cannot bypass it.
-- Moderation/redaction before any pilot is still an open operational item.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_open_text_limit()
returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.raw_value) = 'string'
     and length(new.raw_value #>> '{}') > 1000 then
    raise exception 'free-text answer exceeds the permitted length';
  end if;
  return new;
end;
$$;

drop trigger if exists responses_open_text_limit on public.responses;
create trigger responses_open_text_limit
  before insert or update on public.responses
  for each row execute function public.enforce_open_text_limit();

-- ----------------------------------------------------------------------------
-- Let a campaign field the NGC12 core on its own.
--
-- The design constraint from the working sessions is "1 question is best, 12 can
-- be done, 20 is the max". The full v1 instrument is 25 items, which is right for
-- a benchmark wave but too long for a camp queue or a conference floor. Rather
-- than cut real signal out of the instrument, a campaign chooses which set it
-- fields: 'core' runs only the twelve items flagged `core` in the JSON.
-- ----------------------------------------------------------------------------
alter table public.campaigns
  add column if not exists item_set text not null default 'full'
    check (item_set in ('full', 'core'));

comment on column public.campaigns.item_set is
  'full = every item in the instrument version; core = the NGC12 only (~2 minutes).';

-- ----------------------------------------------------------------------------
-- Instrument v1 becomes the active version; v0 is archived, not deleted, so
-- responses already bound to it stay interpretable ("never lock the instrument").
-- The v1 rows themselves are loaded by `npm run db:seed`, which reads the
-- canonical JSON — schema here, content there.
-- ----------------------------------------------------------------------------
update public.instrument_versions set status = 'archived' where version = 'v0';


-- ─── 0008_waitlist_and_access.sql ──────────────────────────────────────

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


-- ─── 0009_data_spaces.sql ──────────────────────────────────────────────

-- ============================================================================
-- The Jesus Index — data spaces (migration 0009)
--
-- THE PROBLEM THIS CLOSES
-- The sandbox needs the synthetic set to exist permanently: door 03 of the
-- landing page is a live walk through 26 invented organisations. The published
-- Index needs a pool that has never contained a fabricated row. Until now those
-- two requirements collided — `collab_intelligence()` joined `organisations`
-- with no `is_demo` filter, so the first real organisation's data would have
-- landed in a pool that was ~95% fiction, and /intelligence would have been
-- unpublishable.
--
-- The fix is not "remember to add a WHERE clause". It is two enforced spaces:
--
--   LIVE  — real organisations, real respondents. What /intelligence publishes.
--   DEMO  — synthetic organisations, flagged is_demo. What the sandbox reads.
--
-- Enforced, not merely filtered:
--   * the real analytics function cannot see demo rows — the filter is inside
--     the SECURITY DEFINER body, not a caller's responsibility;
--   * an organisation cannot change space once it holds responses, so real data
--     can never be relabelled as demo and demo data can never be laundered into
--     the published Index;
--   * a slug can never collide across spaces;
--   * the published view stays empty until a geography passes the critical-mass
--     gate, so /intelligence cannot publish a global picture built on nine
--     responses — which would break the integrity line more quietly, but just as
--     badly, as the demo would;
--   * `data_space_report()` lets anyone VERIFY the separation with a live query
--     rather than by reading this file, which is what the definition of done
--     actually requires.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Platform settings. The critical-mass gate is DATA, not a constant in code —
-- the working number is a placeholder, not a finding, and the researchers must
-- be able to move it without a deploy.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "settings are publicly readable"
  on public.platform_settings for select using (true);

insert into public.platform_settings (key, value, note) values
  ('critical_mass_gate', '400'::jsonb,
   'Completed responses required in a geography before any benchmark for it is published. A placeholder, not a finding — see the open questions on /learn.'),
  ('publish_global_view', 'false'::jsonb,
   'While false, /intelligence reports its honest empty state instead of a global picture. Flip to true only once the live space has crossed the gate.')
on conflict (key) do nothing;

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable set search_path = public as $$
  select coalesce((select value::text::int from platform_settings where key = p_key), p_default);
$$;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean language sql stable set search_path = public as $$
  select coalesce((select value::text::boolean from platform_settings where key = p_key), p_default);
$$;

-- ----------------------------------------------------------------------------
-- A space cannot change under an organisation that already holds data.
-- Without this, one UPDATE could move 79,000 fabricated responses into the
-- published Index, and no amount of care in the application would stop it.
-- ----------------------------------------------------------------------------
create or replace function public.lock_data_space()
returns trigger language plpgsql set search_path = public as $$
declare v_rows bigint;
begin
  if new.is_demo is distinct from old.is_demo then
    select count(*) into v_rows
      from responses rsp
      join sessions s  on s.id = rsp.session_id
      join campaigns c on c.id = s.campaign_id
     where c.org_id = old.id;

    if v_rows > 0 then
      raise exception
        'organisation "%" already holds % responses; its data space cannot be changed. Create a new organisation instead.',
        old.slug, v_rows;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organisations_lock_data_space on public.organisations;
create trigger organisations_lock_data_space
  before update on public.organisations
  for each row execute function public.lock_data_space();

-- Slugs are already unique, which means a real organisation can never claim a
-- slug a demo organisation holds. Make the intent explicit for the next reader.
comment on column public.organisations.is_demo is
  'The data space. true = synthetic sandbox, excluded from every published figure. false = live. Immutable once the organisation holds responses (see trigger organisations_lock_data_space).';

-- ----------------------------------------------------------------------------
-- The published view. Live space only, and honest about being empty.
--
-- Replaces the unfiltered collab_intelligence() from 0005. Same return shape,
-- so nothing in the app changes except what it is allowed to see.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_gate int; v_total bigint; v_publish boolean;
begin
  v_gate    := setting_int('critical_mass_gate', 400);
  v_publish := setting_bool('publish_global_view', false);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  -- Never overclaim. Below the gate there is no global picture to report, and
  -- saying so plainly is the whole discipline.
  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'completions', v_total,
      'headline',  jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0)
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false          -- <<< the line this migration exists for
  ),
  ctry_n as (select country, count(distinct sid) n from r where country is not null group by country)
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'headline', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    -- Only geographies past the gate are ever named with a score.
    'countries', (select jsonb_agg(jsonb_build_object('country', country, 'n', n)) from ctry_n where n >= v_gate)
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- The sandbox's own view. Demo space only, and it says so in the payload so the
-- UI is obliged to label it. Mirrors the pattern 0006 established.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true           -- the fiction, aggregated only within itself
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'headline', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    'countries', (select jsonb_agg(jsonb_build_object('country', country, 'n', n)) from
                   (select country, count(distinct sid) n from r where country is not null group by country) c)
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Verify the separation with a live query, not by reading SQL.
--   select public.data_space_report();
-- Run it after every seed, before every announcement, and in CI against a
-- throwaway database. If `live.responses` is not what you expect, stop.
-- ----------------------------------------------------------------------------
create or replace function public.data_space_report()
returns jsonb
language sql security definer set search_path = public as $$
  with per as (
    select o.is_demo,
           count(distinct o.id)  as orgs,
           count(distinct s.id)  as sessions,
           count(rsp.id)         as responses
      from organisations o
      left join campaigns c on c.org_id = o.id
      left join sessions  s on s.campaign_id = c.id
      left join responses rsp on rsp.session_id = s.id
     group by o.is_demo
  )
  select jsonb_build_object(
    'live', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = false), jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'demo', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = true),  jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'gate', setting_int('critical_mass_gate', 400),
    'global_view_published', setting_bool('publish_global_view', false),
    'checked_at', now()
  );
$$;

grant execute on function public.data_space_report() to anon, authenticated;


-- ─── 0010_roles_and_short_names.sql ────────────────────────────────────

-- ============================================================================
-- The Jesus Index — roles and short names (migration 0010)
--
-- Step 1 of the engine build. Nothing else in the spec can be built until a
-- signed-in person has a tier, because every screen above the respondent layer
-- is a different answer to "who is asking".
--
-- Three tiers, named neutrally so a facilitator tier drops in later without a
-- migration:
--
--   admin   — the backbone. Approves access, sets platform_settings, activates
--             instrument versions. Two people today; should stay under five.
--   collab  — Collab members, research panel, technical partners. Reads the
--             pooled picture INCLUDING below-gate geographies, which the public
--             view will never show. Never a single organisation's results.
--   org     — a participating ministry. Its own aggregates only, via the
--             existing org_members + website-domain verification.
--
-- No tier can read an individual response. That is not enforced here because it
-- is enforced by absence: there is no function anywhere that returns one.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The tier lives on app_users, which handle_new_user() already populates on
-- sign-up. Default 'org' so a new sign-in is never accidentally privileged.
-- ----------------------------------------------------------------------------
alter table public.app_users
  add column if not exists role text not null default 'org'
    check (role in ('admin', 'collab', 'org'));

comment on column public.app_users.role is
  'Access tier. Set by an administrator, never by the client — see set_user_role().';

-- ----------------------------------------------------------------------------
-- The caller's own tier. Every protected surface resolves through this rather
-- than trusting anything the browser says about itself.
-- ----------------------------------------------------------------------------
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from app_users where id = auth.uid()), 'anon');
$$;

grant execute on function public.my_role() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Only an administrator can change a tier, and never their own — so a single
-- compromised admin session cannot quietly promote itself further or lock the
-- other administrators out.
-- ----------------------------------------------------------------------------
create or replace function public.set_user_role(p_email text, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can change a tier';
  end if;
  if p_role not in ('admin', 'collab', 'org') then
    raise exception 'unknown tier %', p_role;
  end if;

  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception 'no account for % — they must sign in once first', p_email;
  end if;
  if v_uid = auth.uid() then
    raise exception 'you cannot change your own tier';
  end if;

  update app_users set role = p_role where id = v_uid;
end;
$$;

grant execute on function public.set_user_role(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Short names. `sn.jfindx.org` is the survey link, so this value ends up printed
-- on QR codes and posters — which is why it is validated hard and why renaming
-- is deliberately not a self-serve action.
-- ----------------------------------------------------------------------------
alter table public.organisations
  add column if not exists short_name text unique;

alter table public.organisations
  drop constraint if exists organisations_short_name_shape;

alter table public.organisations
  add constraint organisations_short_name_shape
    check (short_name is null or short_name ~ '^[a-z][a-z0-9-]{1,31}$');

comment on column public.organisations.short_name is
  'The subdomain: <short_name>.jfindx.org. Lowercase, 2–32 chars, no leading digit. Ends up on printed QR codes, so treat as permanent.';

-- Reserved names can never become an organisation's subdomain. Kept as DATA so
-- adding one later is an insert, not a deploy.
create table if not exists public.reserved_short_names (
  name   text primary key,
  reason text
);

alter table public.reserved_short_names enable row level security;

create policy "reserved names are publicly readable"
  on public.reserved_short_names for select using (true);

insert into public.reserved_short_names (name, reason) values
  ('index', 'the engine'), ('www', 'apex'), ('app', 'platform'), ('api', 'platform'),
  ('admin', 'platform'), ('demo', 'sandbox'), ('assets', 'platform'), ('static', 'platform'),
  ('mail', 'infrastructure'), ('smtp', 'infrastructure'), ('ftp', 'infrastructure'),
  ('collab', 'tier'), ('build', 'legacy route'), ('join', 'public'), ('learn', 'public'),
  ('tour', 'public'), ('access', 'public'), ('intelligence', 'public'), ('method', 'public'),
  ('privacy', 'public'), ('coverage', 'public'), ('support', 'reserved'), ('help', 'reserved'),
  ('status', 'reserved'), ('jfindx', 'brand'), ('jesusindex', 'brand'), ('jx', 'brand')
on conflict (name) do nothing;

create or replace function public.enforce_short_name()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.short_name is not null
     and exists (select 1 from reserved_short_names r where r.name = new.short_name) then
    raise exception '"%" is reserved and cannot be used as a short name', new.short_name;
  end if;
  return new;
end;
$$;

drop trigger if exists organisations_short_name_guard on public.organisations;
create trigger organisations_short_name_guard
  before insert or update on public.organisations
  for each row execute function public.enforce_short_name();

-- ----------------------------------------------------------------------------
-- Is a short name available? Public, because the org setup screen needs to say
-- so while someone types. Returns only a boolean — never the list.
-- ----------------------------------------------------------------------------
create or replace function public.short_name_available(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_name ~ '^[a-z][a-z0-9-]{1,31}$'
     and not exists (select 1 from reserved_short_names where name = p_name)
     and not exists (select 1 from organisations where short_name = p_name);
$$;

grant execute on function public.short_name_available(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Two campaigns per organisation, not one.
--
-- The original research design had two avenues — influenced (their own network)
-- and uninfluenced (public) — and the platform only ever built the first. The
-- audience label is what makes "the young people we reach vs the young people
-- around us" answerable, which is the Index's most distinctive claim.
-- ----------------------------------------------------------------------------
alter table public.campaigns
  add column if not exists audience text not null default 'community'
    check (audience in ('community', 'public'));

comment on column public.campaigns.audience is
  'community = inside their own network (influenced). public = social/open link (uninfluenced). Compared side by side, never pooled silently.';

-- An organisation that drops non-core items is still fully readable to itself,
-- but must not be silently benchmarked against organisations running the whole
-- instrument. Flagged here; the UI explains it at the moment of the choice.
alter table public.campaigns
  add column if not exists is_partial boolean not null default false;

comment on column public.campaigns.is_partial is
  'True when non-core items were removed. Own results unaffected; excluded from benchmark comparison for the affected tiers.';

-- Presentation is theirs; the measure is not.
alter table public.organisations
  add column if not exists logo_url text,
  add column if not exists welcome_message text,
  add column if not exists closing_message text;

comment on column public.organisations.welcome_message is
  'The organisation''s own words before question one. This is where "make it ours" belongs — never in the item text, which must stay identical everywhere.';


-- ─── 0011_path_based_short_names.sql ───────────────────────────────────

-- ============================================================================
-- The Jesus Index — one public identifier (migration 0011)
--
-- DECISION: the survey link is jfindx.org/<short_name>, not <short_name>.jfindx.org.
--
-- Path-based costs almost nothing that matters. The URL is on screen for about
-- two seconds; the moment the survey opens it is fully theirs — their logo,
-- colour, name and welcome message. Most respondents arrive by QR code and never
-- read a URL at all. In exchange it ships today with no wildcard certificate, no
-- DNS migration off Squarespace (which would drag MX and TXT along with it), and
-- no single point of failure: a wildcard cert that fails to renew would break
-- EVERY organisation's link at once, and a path cannot do that.
--
-- Nothing from 0010 is wasted. short_name becomes the path segment instead of
-- the subdomain — same column, same shape, same reserved list. The reserved list
-- matters MORE on a path, because those names collide with real routes.
--
-- Upgrading later is additive: add the wildcard and 301 the path to the
-- subdomain. Both keep working, nothing needs reprinting.
--
-- THE PROBLEM THIS FIXES NOW, WHILE IT IS STILL FREE
-- /[org] currently matches on `slug`, and 0010 added `short_name`. Two public
-- identifiers that can drift is a bug waiting for its first support ticket —
-- an organisation would hand out one and find the other on their dashboard.
-- short_name becomes canonical; slug is backfilled from it and kept in lockstep.
-- Doing this after an organisation has printed a QR code would be expensive.
-- ============================================================================

-- Every existing organisation keeps working: its slug becomes its short name.
update public.organisations
   set short_name = slug
 where short_name is null
   and slug ~ '^[a-z][a-z0-9-]{1,31}$'
   and not exists (select 1 from public.reserved_short_names r where r.name = slug);

-- Anything that could not be adopted verbatim is visible rather than silent.
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.organisations where short_name is null;
  if v_bad > 0 then
    raise notice '% organisation(s) have no short name — they need one assigned before they can field.', v_bad;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Keep the two in lockstep so a lookup by either always lands in one place.
-- The application should read and write short_name only; slug survives as an
-- internal key so existing foreign relationships and demo data keep resolving.
-- ----------------------------------------------------------------------------
create or replace function public.sync_short_name()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.short_name is not null and new.short_name is distinct from new.slug then
    new.slug := new.short_name;
  elsif new.short_name is null then
    new.short_name := new.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists organisations_sync_short_name on public.organisations;
create trigger organisations_sync_short_name
  before insert or update on public.organisations
  for each row execute function public.sync_short_name();

-- ----------------------------------------------------------------------------
-- Resolve an organisation for the public survey route. Returns presentation
-- only — never a score, never a member, never anything a competitor could use.
-- This is what /[org] should call instead of selecting from the table directly.
-- ----------------------------------------------------------------------------
create or replace function public.org_public(p_short_name text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when o.id is null then null else jsonb_build_object(
    'short_name',      o.short_name,
    'name',            o.name,
    'brand_color',     o.brand_color,
    'country',         o.country,
    'logo_url',        o.logo_url,
    'welcome_message', o.welcome_message,
    'closing_message', o.closing_message,
    'is_demo',         o.is_demo
  ) end
  from public.organisations o
  where o.short_name = lower(btrim(p_short_name))
     or o.slug       = lower(btrim(p_short_name))
  limit 1;
$$;

grant execute on function public.org_public(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- The two links an organisation hands out. One call, so the setup screen and
-- the print sheet can never disagree about what the links are.
-- ----------------------------------------------------------------------------
create or replace function public.org_links(p_short_name text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'community', jsonb_build_object(
      'url',   'https://jfindx.org/' || o.short_name,
      'label', 'Your community',
      'note',  'For the young people you already reach — camps, services, groups.'
    ),
    'public', jsonb_build_object(
      'url',   'https://jfindx.org/' || o.short_name || '/open',
      'label', 'Beyond your community',
      'note',  'For social media and the wider city — the young people you have not reached yet.'
    )
  )
  from public.organisations o
  where o.short_name = lower(btrim(p_short_name))
  limit 1;
$$;

grant execute on function public.org_links(text) to anon, authenticated;

-- Path-based means these names collide with real application routes, so the
-- reserved list is load-bearing rather than cosmetic. Add the rest of them.
insert into public.reserved_short_names (name, reason) values
  ('open', 'the public campaign suffix'),
  ('dashboard', 'org route'), ('settings', 'org route'), ('links', 'org route'),
  ('preview', 'org route'), ('team', 'org route'), ('waves', 'org route'),
  ('signin', 'auth'), ('signout', 'auth'), ('callback', 'auth'),
  ('_next', 'framework'), ('favicon.ico', 'framework'), ('robots.txt', 'framework'),
  ('sitemap.xml', 'framework'), ('manifest.json', 'framework')
on conflict (name) do nothing;


-- ─── 0012_admin_worklist.sql ───────────────────────────────────────────

-- ============================================================================
-- The Jesus Index — the administrator's worklist (migration 0012)
--
-- One call behind the console. It is a WORKLIST, not a dashboard: the 2027
-- target is a chain of handovers that each need a person to notice them, so the
-- job of this function is to surface what is waiting on a human right now.
--
-- Everything it returns is aggregate or operational. It never returns an
-- individual response, because nothing does.
-- ============================================================================

create or replace function public.admin_worklist()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if my_role() <> 'admin' then
    raise exception 'the worklist is for administrators';
  end if;

  select jsonb_build_object(
    'access_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'email', a.email, 'reason', a.reason,
        'status', a.status, 'created_at', a.created_at
      ) order by a.created_at desc)
      from access_requests a where a.status = 'requested'
    ), '[]'::jsonb),

    'people', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', au.role) order by u.email)
      from app_users au join auth.users u on u.id = au.id
    ), '[]'::jsonb),

    -- Live organisations only. The 26 synthetic ones are not work.
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'short_name', o.short_name, 'name', o.name, 'country', o.country,
        'verified', o.verified, 'has_brand', (o.logo_url is not null or o.brand_color is not null),
        'campaigns', (select count(*) from campaigns c where c.org_id = o.id),
        'responses', (
          select count(*) from responses r
          join sessions s on s.id = r.session_id
          join campaigns c on c.id = s.campaign_id
          where c.org_id = o.id
        )
      ) order by o.name)
      from organisations o where o.is_demo = false
    ), '[]'::jsonb),

    -- How close each country is to unlocking a benchmark for everyone in it.
    -- Concentration is the constraint, so this is the number that steers effort.
    'clusters', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'completions', n, 'orgs', orgs)
                       order by n desc)
      from (
        select o.country, count(distinct s.id) n, count(distinct o.id) orgs
        from organisations o
        join campaigns c on c.org_id = o.id
        join sessions s on s.campaign_id = c.id
        where o.is_demo = false and o.country is not null
        group by o.country
      ) k
    ), '[]'::jsonb),

    'instrument', (
      select jsonb_build_object('version', iv.version, 'status', iv.status,
                                'items', (select count(*) from items i where i.instrument_version_id = iv.id))
      from instrument_versions iv where iv.status = 'active' limit 1
    ),

    'settings', coalesce((
      select jsonb_object_agg(key, value) from platform_settings
    ), '{}'::jsonb),

    'spaces', data_space_report()
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_worklist() to authenticated;

-- ----------------------------------------------------------------------------
-- Decide an access request. Approving records the decision; it does not grant a
-- tier — that stays a separate, deliberate act via set_user_role(), so nobody
-- becomes an administrator as a side effect of a queue being cleared.
-- ----------------------------------------------------------------------------
create or replace function public.decide_access_request(p_id uuid, p_decision text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can decide access requests';
  end if;
  if p_decision not in ('approved', 'declined') then
    raise exception 'decision must be approved or declined';
  end if;
  update access_requests
     set status = p_decision, decided_at = now()
   where id = p_id and status = 'requested';
end;
$$;

grant execute on function public.decide_access_request(uuid, text) to authenticated;


-- ─── 0013_networks.sql ─────────────────────────────────────────────────

-- ============================================================================
-- The Jesus Index — networks (migration 0013)
--
-- A gap in the model, not a naming question. Until now the world was
-- organisations plus tiers, and that cannot describe what NXT Move actually is.
--
--   Shoreline Church  FIELDS a survey. Respondents, links, its own dashboard.
--   NXT Move          FIELDS NOTHING. It CONTAINS organisations and needs to
--                     see across them.
--
-- Those are different objects. A network is not a bigger organisation, and
-- modelling it as one would mean either giving it phantom respondents or
-- special-casing it everywhere.
--
-- Membership is many-to-many on purpose: a church can sit in NXT Move AND a
-- denominational network AND a city cluster at the same time, and each of those
-- rolls up the same underlying responses without duplicating them.
--
-- WHAT A NETWORK MAY SEE
-- Aggregates across its member organisations, and — deliberately — the per-org
-- index for organisations that have consented to share it upward. That consent
-- is per-membership and defaults to FALSE. A network lead cannot silently see
-- a member church's score just by adding them.
-- ============================================================================

create table if not exists public.networks (
  id            uuid primary key default gen_random_uuid(),
  short_name    text unique not null,
  name          text not null,
  kind          text not null default 'network'
                  check (kind in ('network', 'denomination', 'cluster', 'backbone')),
  country       text,
  region        text,
  brand_color   text,
  logo_url      text,
  website_domain text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.networks
  drop constraint if exists networks_short_name_shape;
alter table public.networks
  add constraint networks_short_name_shape
    check (short_name ~ '^[a-z][a-z0-9-]{1,31}$');

comment on table public.networks is
  'A container of organisations. Fields nothing itself — it has no campaigns and no respondents.';

-- Networks and organisations share one namespace, so a link can never be
-- ambiguous about which kind of thing it points at.
create or replace function public.enforce_network_short_name()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from reserved_short_names r where r.name = new.short_name) then
    raise exception '"%" is reserved', new.short_name;
  end if;
  if exists (select 1 from organisations o where o.short_name = new.short_name) then
    raise exception '"%" is already an organisation', new.short_name;
  end if;
  return new;
end;
$$;

drop trigger if exists networks_short_name_guard on public.networks;
create trigger networks_short_name_guard
  before insert or update on public.networks
  for each row execute function public.enforce_network_short_name();

-- ----------------------------------------------------------------------------
-- Membership. `shares_index` is the consent: an organisation agrees that this
-- particular network may see its own index, not just be counted in the pool.
-- Defaults to false, because being added to a network is not consent.
-- ----------------------------------------------------------------------------
create table if not exists public.network_members (
  network_id   uuid not null references public.networks(id) on delete cascade,
  org_id       uuid not null references public.organisations(id) on delete cascade,
  shares_index boolean not null default false,
  added_at     timestamptz not null default now(),
  primary key (network_id, org_id)
);

-- People who work at the network level rather than at one organisation.
create table if not exists public.network_members_users (
  network_id uuid not null references public.networks(id) on delete cascade,
  user_id    uuid not null references public.app_users(id) on delete cascade,
  status     text not null default 'active' check (status in ('active', 'invited', 'removed')),
  primary key (network_id, user_id)
);

alter table public.networks              enable row level security;
alter table public.network_members       enable row level security;
alter table public.network_members_users enable row level security;

create policy "networks are publicly readable" on public.networks for select using (true);

-- ----------------------------------------------------------------------------
-- The network console's payload. Aggregates across members, plus per-org rows
-- ONLY where that organisation consented to share upward.
-- ----------------------------------------------------------------------------
create or replace function public.network_console(p_short_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_net public.networks%rowtype; v_uid uuid := auth.uid(); result jsonb;
begin
  select * into v_net from networks where short_name = lower(btrim(p_short_name));
  if not found then raise exception 'network not found'; end if;

  -- Administrators may look into any network. Everyone else must belong to it.
  if my_role() <> 'admin' and not exists (
    select 1 from network_members_users m
     where m.network_id = v_net.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this network';
  end if;

  with mem as (
    select o.id, o.short_name, o.name, o.country, nm.shares_index
      from network_members nm join organisations o on o.id = nm.org_id
     where nm.network_id = v_net.id
  ),
  r as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id sid, m.id oid, m.shares_index
      from mem m
      join campaigns c on c.org_id = m.id
      join sessions s on s.campaign_id = c.id
      join responses rsp on rsp.session_id = s.id
     where rsp.normalized is not null
  )
  select jsonb_build_object(
    'network', jsonb_build_object('short_name', v_net.short_name, 'name', v_net.name, 'kind', v_net.kind),
    'members', (select count(*) from mem),
    'headline', jsonb_build_object(
      'organisations', (select count(distinct oid) from r),
      'responses',     (select count(distinct sid) from r)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from
                 (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from
                 (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    -- Per-organisation rows appear only with that organisation's consent.
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'short_name', m.short_name, 'name', m.name, 'country', m.country,
        'shares_index', m.shares_index,
        'index', case when m.shares_index then (
          select round(avg(x.normalized),1) from r x where x.oid = m.id
        ) else null end,
        'responses', (select count(distinct x.sid) from r x where x.oid = m.id)
      ) order by m.name) from mem m
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.network_console(text) to authenticated;

-- ----------------------------------------------------------------------------
-- An administrator opening someone else's console. This is the most sensitive
-- capability in the system, so it is read-only by construction, it is logged,
-- and it still cannot return an individual response — because nothing can.
-- ----------------------------------------------------------------------------
create table if not exists public.view_as_log (
  id         uuid primary key default gen_random_uuid(),
  viewed_at  timestamptz not null default now(),
  admin_id   uuid references public.app_users(id) on delete set null,
  subject_kind text not null check (subject_kind in ('organisation', 'network')),
  subject     text not null
);

alter table public.view_as_log enable row level security;

create or replace function public.view_as(p_kind text, p_short_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can view another console';
  end if;
  if p_kind not in ('organisation', 'network') then
    raise exception 'kind must be organisation or network';
  end if;

  insert into view_as_log (admin_id, subject_kind, subject)
  values (auth.uid(), p_kind, lower(btrim(p_short_name)));

  if p_kind = 'network' then
    return network_console(p_short_name) || jsonb_build_object('viewed_as', true);
  else
    return org_dashboard_admin(p_short_name) || jsonb_build_object('viewed_as', true);
  end if;
end;
$$;

-- An admin-scoped read of one organisation. Same shape as org_dashboard, but
-- reached by tier rather than by membership. Aggregates only, as ever.
create or replace function public.org_dashboard_admin(p_short_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org public.organisations%rowtype; result jsonb;
begin
  if my_role() <> 'admin' then raise exception 'administrators only'; end if;
  select * into v_org from organisations where short_name = lower(btrim(p_short_name));
  if not found then raise exception 'organisation not found'; end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id sid, c.audience
      from responses rsp
      join sessions s on s.id = rsp.session_id
      join campaigns c on c.id = s.campaign_id
     where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('short_name', v_org.short_name, 'name', v_org.name,
                              'country', v_org.country, 'verified', v_org.verified),
    'n', (select count(distinct sid) from r),
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    -- The comparison the Index exists to make possible.
    'by_audience', (select jsonb_object_agg(audience, m) from
                     (select audience, round(avg(normalized),1) m from r group by audience) a)
  ) into result;
  return result;
end;
$$;

grant execute on function public.org_dashboard_admin(text) to authenticated;
grant execute on function public.view_as(text, text) to authenticated;

-- Reserve the network route so it cannot be claimed as a short name.
insert into public.reserved_short_names (name, reason)
values ('network', 'network route'), ('networks', 'network route')
on conflict (name) do nothing;


-- ─── 0014_waves_and_survey_setup.sql ───────────────────────────────────

-- ============================================================================
-- The Jesus Index — survey setup at every tier (migration 0014)
--
-- The brief was "every tier can set up surveys". That sentence hides two
-- different verbs, and conflating them is what would break the arithmetic:
--
--   FIELD    run a survey and collect responses.
--            ALWAYS owned by exactly one organisation. Every response traces
--            to an owner that can be counted once — which is what stops a
--            church sitting in three networks from appearing three times in a
--            benchmark, and what makes "delete my data" answerable.
--
--   CONVENE  define a WAVE — version, item set, audiences, window, locales —
--            that organisations adopt in one click. Collects nothing itself.
--            This is what makes forty organisations comparable rather than
--            merely simultaneous.
--
-- So 0013's rule survives intact: a network still fields nothing AS a network.
-- When NXT Move wants to run its own camp survey it becomes an organisation
-- too and joins its own network. That is honest rather than a workaround —
-- the ministry and the container genuinely are different objects.
--
-- Nothing here changes an existing table's meaning, and nothing here touches
-- the respondent path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · The second consent.
--
-- 0013 gave a membership `shares_index`: may this network SEE our number.
-- Fielding on our behalf is a bigger ask than seeing our score, so it gets its
-- own flag and its own default. Being added to a network is not consent to be
-- seen, and it is certainly not consent to be spoken for.
-- ----------------------------------------------------------------------------
alter table public.network_members
  add column if not exists manages_surveys boolean not null default false;

comment on column public.network_members.manages_surveys is
  'Consent: this network may create and edit campaigns on the organisation''s behalf. Defaults to false. Strictly stronger than shares_index.';

-- ----------------------------------------------------------------------------
-- 2 · Waves — the convening object.
--
-- A wave has no org_id, no campaign, no respondents and no link. It cannot
-- collect anything. It is a shape that campaigns are cut to, which is exactly
-- why an organisation that strips out non-core items drops out of the
-- comparison for those cells instead of quietly distorting it.
-- ----------------------------------------------------------------------------
create table if not exists public.waves (
  id                    uuid primary key default gen_random_uuid(),
  short_name            text unique not null,
  name                  text not null,
  instrument_version_id uuid not null references public.instrument_versions(id),
  item_set              text not null default 'core'
                          check (item_set in ('full', 'core')),
  -- Two audiences off one instrument. The comparison between them is the most
  -- useful thing a ministry gets out of the Index, so it is structural.
  audiences             text[] not null default array['community']::text[]
                          check (audiences <@ array['community','public']::text[]
                                 and array_length(audiences, 1) >= 1),
  locales               text[] not null default array['en']::text[],
  opens_on              date,
  closes_on             date,
  -- Who called it. A network convenes for its members; the Collab convenes for
  -- everyone. Null network_id means coalition-wide.
  convened_by_network_id uuid references public.networks(id) on delete set null,
  convened_by            uuid references public.app_users(id),
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now()
);

alter table public.waves drop constraint if exists waves_short_name_shape;
alter table public.waves
  add constraint waves_short_name_shape
    check (short_name ~ '^[a-z][a-z0-9-]{1,39}$');

alter table public.waves drop constraint if exists waves_window_ordered;
alter table public.waves
  add constraint waves_window_ordered
    check (closes_on is null or opens_on is null or closes_on >= opens_on);

comment on table public.waves is
  'A convening shape. Owns no responses and has no link — organisations adopt it, which is what makes their campaigns comparable.';

create table if not exists public.wave_adoptions (
  wave_id     uuid not null references public.waves(id) on delete cascade,
  org_id      uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  adopted_by  uuid references public.app_users(id),
  adopted_at  timestamptz not null default now(),
  primary key (wave_id, org_id)
);

alter table public.waves          enable row level security;
alter table public.wave_adoptions enable row level security;

-- Waves are public knowledge — a season is an announcement, not a secret.
-- Adoptions are not: who has and has not fielded is the network's business.
drop policy if exists "waves are publicly readable" on public.waves;
create policy "waves are publicly readable" on public.waves for select using (true);

-- ----------------------------------------------------------------------------
-- 3 · May I field for this organisation?
--
-- One function, consulted by everything that writes a campaign, so the answer
-- cannot drift between surfaces. Returns the reason as text rather than a
-- boolean: the console needs to say "because NXT Move manages your surveys",
-- and the audit log needs to record which door someone came through.
-- ----------------------------------------------------------------------------
create or replace function public.field_authority(p_org_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then return null; end if;
  v_role := my_role();

  -- Their own house first: the common case should not depend on a tier.
  if exists (
    select 1 from org_members m
     where m.org_id = p_org_id and m.user_id = v_uid and m.status = 'active'
  ) then return 'own_organisation'; end if;

  -- A network may act for a member that said it could. Note manages_surveys,
  -- NOT shares_index — seeing a number and speaking for a ministry are
  -- different permissions and are deliberately not bundled.
  if exists (
    select 1
      from network_members nm
      join network_members_users nu on nu.network_id = nm.network_id
     where nm.org_id = p_org_id
       and nm.manages_surveys
       and nu.user_id = v_uid
       and nu.status = 'active'
  ) then return 'network_delegated'; end if;

  if v_role = 'admin'  then return 'administrator'; end if;
  if v_role = 'collab' then return 'collab';        end if;

  return null;
end;
$$;

grant execute on function public.field_authority(uuid) to authenticated;

-- Fielding for someone else leaves a trace. Same discipline as view_as_log:
-- acting on a ministry's behalf is a normal thing to need and an abnormal
-- thing to do quietly.
create table if not exists public.campaign_action_log (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references public.app_users(id),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  authority  text not null,
  action     text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
alter table public.campaign_action_log enable row level security;

-- ----------------------------------------------------------------------------
-- 4 · campaign_upsert — the one entry point.
--
-- Every tier's "set up a survey" ends here. The tier check happens inside the
-- function body, never in the client, so a surface cannot forget it.
-- ----------------------------------------------------------------------------
create or replace function public.campaign_upsert(
  p_org_short_name  text,
  p_audience        text default 'community',
  p_item_set        text default 'core',
  p_locale          text default 'en',
  p_wave_short_name text default null,
  p_source_label    text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org    public.organisations%rowtype;
  v_wave   public.waves%rowtype;
  v_auth   text;
  v_iv     uuid;
  v_camp   uuid;
  v_slug   text;
begin
  if p_audience not in ('community', 'public') then
    raise exception 'audience must be community or public';
  end if;
  if p_item_set not in ('full', 'core') then
    raise exception 'item set must be full or core';
  end if;

  select * into v_org from organisations o
   where o.short_name = lower(btrim(p_org_short_name));
  if not found then raise exception 'organisation not found'; end if;

  v_auth := field_authority(v_org.id);
  if v_auth is null then
    raise exception 'not authorised to field for "%"', v_org.short_name;
  end if;

  -- A wave, if adopted, fixes the shape. That is the entire point of a wave:
  -- the organisation does not get to keep its own item set and still claim to
  -- be part of the season.
  if p_wave_short_name is not null then
    select * into v_wave from waves w where w.short_name = lower(btrim(p_wave_short_name));
    if not found then raise exception 'wave not found'; end if;
    if v_wave.is_demo <> v_org.is_demo then
      raise exception 'a % wave cannot be adopted by a % organisation',
        case when v_wave.is_demo then 'sandbox' else 'live' end,
        case when v_org.is_demo  then 'sandbox' else 'live' end;
    end if;
    if p_audience <> all (v_wave.audiences) then
      raise exception 'wave "%" does not field the % audience', v_wave.short_name, p_audience;
    end if;
    v_iv       := v_wave.instrument_version_id;
    p_item_set := v_wave.item_set;
  else
    select id into v_iv from instrument_versions where status = 'active'
     order by created_at desc limit 1;
    if v_iv is null then
      raise exception 'no active instrument version — run npm run db:seed first';
    end if;
  end if;

  -- One campaign per organisation per audience. The two links are two
  -- campaigns off one instrument, which is what makes them comparable.
  v_slug := case when p_audience = 'public' then 'open' else 'default' end;

  insert into campaigns as c
    (org_id, slug, instrument_version_id, locale, active, source_label, item_set, audience)
  values
    (v_org.id, v_slug, v_iv, p_locale, true, p_source_label, p_item_set, p_audience)
  on conflict (org_id, slug) do update
     set instrument_version_id = excluded.instrument_version_id,
         locale                = excluded.locale,
         item_set              = excluded.item_set,
         audience              = excluded.audience,
         active                = true
  returning c.id into v_camp;

  if v_wave.id is not null then
    insert into wave_adoptions (wave_id, org_id, campaign_id, adopted_by)
    values (v_wave.id, v_org.id, v_camp, auth.uid())
    on conflict (wave_id, org_id) do update set campaign_id = excluded.campaign_id;
  end if;

  -- Only log when someone acted for a house that is not their own. Logging a
  -- youth pastor editing their own survey would bury the entries that matter.
  if v_auth <> 'own_organisation' then
    insert into campaign_action_log (actor, org_id, authority, action, detail)
    values (auth.uid(), v_org.id, v_auth, 'campaign_upsert',
            jsonb_build_object('audience', p_audience, 'item_set', p_item_set,
                               'wave', v_wave.short_name));
  end if;

  return jsonb_build_object(
    'campaign_id', v_camp,
    'authority',   v_auth,
    'audience',    p_audience,
    'item_set',    p_item_set,
    'links',       org_links(v_org.short_name)
  );
end;
$$;

grant execute on function public.campaign_upsert(text, text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5 · wave_upsert — convening.
-- ----------------------------------------------------------------------------
create or replace function public.wave_upsert(
  p_short_name   text,
  p_name         text,
  p_item_set     text default 'core',
  p_audiences    text[] default array['community','public']::text[],
  p_locales      text[] default array['en']::text[],
  p_opens_on     date default null,
  p_closes_on    date default null,
  p_network      text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role text := my_role(); v_net public.networks%rowtype; v_iv uuid; v_id uuid;
begin
  if v_role not in ('admin', 'collab') and p_network is null then
    raise exception 'only the Collab or an administrator may convene coalition-wide';
  end if;

  if p_network is not null then
    select * into v_net from networks n where n.short_name = lower(btrim(p_network));
    if not found then raise exception 'network not found'; end if;
    if v_role <> 'admin' and not exists (
      select 1 from network_members_users u
       where u.network_id = v_net.id and u.user_id = auth.uid() and u.status = 'active'
    ) then raise exception 'not authorised for this network'; end if;
  end if;

  select id into v_iv from instrument_versions where status = 'active'
   order by created_at desc limit 1;
  if v_iv is null then raise exception 'no active instrument version'; end if;

  insert into waves as w
    (short_name, name, instrument_version_id, item_set, audiences, locales,
     opens_on, closes_on, convened_by_network_id, convened_by)
  values
    (lower(btrim(p_short_name)), p_name, v_iv, p_item_set, p_audiences, p_locales,
     p_opens_on, p_closes_on, v_net.id, auth.uid())
  on conflict (short_name) do update
     set name       = excluded.name,
         item_set   = excluded.item_set,
         audiences  = excluded.audiences,
         locales    = excluded.locales,
         opens_on   = excluded.opens_on,
         closes_on  = excluded.closes_on
  returning w.id into v_id;

  return jsonb_build_object('wave_id', v_id, 'short_name', lower(btrim(p_short_name)));
end;
$$;

grant execute on function public.wave_upsert(text, text, text, text[], text[], date, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6 · my_context — what the console needs to route.
--
-- One round trip on load: who am I, what tier, and which houses am I inside.
-- Without this the console would have to guess its own shape from failures.
-- ----------------------------------------------------------------------------
create or replace function public.my_context()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('signed_in', false); end if;

  return jsonb_build_object(
    'signed_in', true,
    'email',     (select email from app_users where id = v_uid),
    'role',      my_role(),
    'orgs',      coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', o.short_name, 'name', o.name, 'is_demo', o.is_demo)
             order by o.name)
        from org_members m join organisations o on o.id = m.org_id
       where m.user_id = v_uid and m.status = 'active'), '[]'::jsonb),
    'networks',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', n.short_name, 'name', n.name, 'kind', n.kind)
             order by n.name)
        from network_members_users u join networks n on n.id = u.network_id
       where u.user_id = v_uid and u.status = 'active'), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.my_context() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7 · Band A at the other three tiers.
--
-- A worklist, not a dashboard: every row is something waiting on a person. If
-- one of these returns empty, nobody is blocked — which is why they are
-- allowed to be empty and the other bands are not.
-- ----------------------------------------------------------------------------
create or replace function public.org_worklist(p_short_name text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org public.organisations%rowtype; v_items jsonb := '[]'::jsonb; v_n bigint;
begin
  select * into v_org from organisations o where o.short_name = lower(btrim(p_short_name));
  if not found then raise exception 'organisation not found'; end if;
  if field_authority(v_org.id) is null then
    raise exception 'not authorised for this organisation';
  end if;

  if not exists (select 1 from campaigns c where c.org_id = v_org.id and c.active) then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', 'Your survey is not live yet', 'action', 'Finish setup');
  end if;

  if v_org.logo_url is null then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', 'Your logo is not set — respondents see ours', 'action', 'Upload');
  end if;

  if v_org.welcome_message is null or v_org.closing_message is null then
    v_items := v_items || jsonb_build_object(
      'urgency', 'low', 'label', 'Your welcome and closing messages are the defaults', 'action', 'Edit');
  end if;

  select count(*) into v_n
    from responses r join sessions s on s.id = r.session_id
    join campaigns c on c.id = s.campaign_id
   where c.org_id = v_org.id;

  if v_n = 0 and exists (select 1 from campaigns c where c.org_id = v_org.id and c.active) then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', 'Your survey is live but nobody has answered yet', 'action', 'Share the link');
  end if;

  return jsonb_build_object(
    'org',       jsonb_build_object('short_name', v_org.short_name, 'name', v_org.name,
                                    'is_demo', v_org.is_demo),
    'responses', v_n,
    'links',     org_links(v_org.short_name),
    'items',     v_items
  );
end;
$$;

create or replace function public.network_worklist(p_short_name text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_net public.networks%rowtype; v_items jsonb := '[]'::jsonb; v_c bigint;
begin
  select * into v_net from networks n where n.short_name = lower(btrim(p_short_name));
  if not found then raise exception 'network not found'; end if;
  if my_role() <> 'admin' and not exists (
    select 1 from network_members_users u
     where u.network_id = v_net.id and u.user_id = auth.uid() and u.status = 'active'
  ) then raise exception 'not authorised for this network'; end if;

  select count(*) into v_c from network_members nm
    where nm.network_id = v_net.id
      and not exists (select 1 from campaigns c where c.org_id = nm.org_id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', v_c || ' member' || case when v_c = 1 then '' else 's' end
        || ' have not fielded', 'action', 'Send the link');
  end if;

  select count(*) into v_c from network_members nm
    where nm.network_id = v_net.id and not nm.shares_index;
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'low', 'label', v_c || ' member' || case when v_c = 1 then ' has' else 's have' end
        || ' not consented to share upward — you see them in the aggregate only',
      'action', 'Ask');
  end if;

  -- The network itself is an organisation only once it has chosen to be one.
  if not exists (
    select 1 from network_members nm join organisations o on o.id = nm.org_id
     where nm.network_id = v_net.id and o.short_name <> v_net.short_name
       and o.name = v_net.name
  ) then
    v_items := v_items || jsonb_build_object(
      'urgency', 'low',
      'label', v_net.name || ' cannot field its own survey yet — it exists as a network, not an organisation',
      'action', 'Create it');
  end if;

  return jsonb_build_object(
    'network', jsonb_build_object('short_name', v_net.short_name, 'name', v_net.name,
                                  'kind', v_net.kind),
    'items',   v_items
  );
end;
$$;

create or replace function public.collab_worklist()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_gate int; v_c bigint;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  v_gate := setting_int('critical_mass_gate', 400);

  -- Coverage, not volume. The same sixty organisations spread across forty
  -- countries unlocks nothing; concentrated in ten it unlocks all ten. So the
  -- worklist ranks by who is CLOSEST to a benchmark, not by who has the most.
  v_items := (
    select coalesce(jsonb_agg(jsonb_build_object(
             'urgency', 'high',
             'label', x.country || ' is ' || (v_gate - x.completions)
                      || ' completions from its first benchmark',
             'meta', x.completions || ' / ' || v_gate,
             'action', 'See who can close it')
           order by x.completions desc), '[]'::jsonb)
      from (
        select s.country, count(*) as completions
          from sessions s
          join campaigns c on c.id = s.campaign_id
          join organisations o on o.id = c.org_id
         where s.completed and o.is_demo = false and s.country is not null
         group by s.country
        having count(*) < v_gate
      ) x
  );

  select count(*) into v_c
    from organisations o
   where o.is_demo = false
     and not exists (select 1 from campaigns c where c.org_id = o.id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high',
      'label', v_c || ' organisation' || case when v_c = 1 then '' else 's' end
        || ' joined and never fielded', 'action', 'Nudge');
  end if;

  return jsonb_build_object(
    'gate',  v_gate,
    'waves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', w.short_name, 'name', w.name, 'item_set', w.item_set,
               'audiences', w.audiences, 'opens_on', w.opens_on, 'closes_on', w.closes_on,
               'adopted', (select count(*) from wave_adoptions a where a.wave_id = w.id))
             order by w.created_at desc)
        from waves w where w.is_demo = false), '[]'::jsonb),
    'items', v_items
  );
end;
$$;

grant execute on function public.org_worklist(text)     to authenticated;
grant execute on function public.network_worklist(text) to authenticated;
grant execute on function public.collab_worklist()      to authenticated;

-- ----------------------------------------------------------------------------
-- 8 · The organisations a caller may field for. Powers step 00 of the wizard.
-- ----------------------------------------------------------------------------
create or replace function public.fieldable_orgs()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  v_role := my_role();

  return coalesce((
    select jsonb_agg(x order by x->>'name')
      from (
        select distinct on (o.id) jsonb_build_object(
                 'short_name', o.short_name,
                 'name',       o.name,
                 'is_demo',    o.is_demo,
                 'authority',  field_authority(o.id)) as x
          from organisations o
         where field_authority(o.id) is not null
           -- An administrator may field for anyone, but listing every sandbox
           -- organisation would bury the live ones that matter.
           and (v_role not in ('admin','collab') or o.is_demo = false)
      ) s), '[]'::jsonb);
end;
$$;

grant execute on function public.fieldable_orgs() to authenticated;


-- ─── 0015_fix_intelligence_data_contract.sql ───────────────────────────

-- ============================================================================
-- NGJFI platform — fix the collab_intelligence() data contract regression
-- introduced by 0009_data_spaces.sql (migration 0015)
--
-- ROOT CAUSE OF THE "Application error: a client-side exception has occurred"
-- crash on /intelligence and /demo/intelligence:
--
-- 0009 rewrote collab_intelligence() and collab_intelligence_demo() to add the
-- is_demo split (a real and necessary fix — demo data must never contaminate
-- the real global view). Its own comment claims "same return shape, so
-- nothing in the app changes except what it is allowed to see." That was not
-- accurate. Three things changed silently:
--
--   1. The summary object's key changed from 'totals' (0005, and still what
--      src/components/index/IntelligenceView.tsx reads) to 'headline'. The
--      component does `d.totals.responses` with no optional chaining — once
--      `published` data as actually returned, `d.totals` is `undefined` and
--      that line throws a TypeError, which Next.js surfaces as the generic
--      "Application error" screen. /demo/intelligence hits this on every
--      load, because collab_intelligence_demo() has no publish gate at all.
--   2. 'trend' and 'findings' were dropped entirely from both functions —
--      the "Movement over time" and "What the data reveals" sections on
--      /intelligence silently stopped rendering (no crash, just missing).
--   3. 'countries[].tiers' (used to colour the tier-by-tier map) was dropped
--      — only 'country' and 'n' remained, so the map always shows every
--      country as "no data" grey regardless of the selected tier.
--
-- This migration keeps the one thing 0009 needed to add (is_demo filtering)
-- and restores everything 0005 used to return on top of it. No frontend
-- change is required — IntelligenceView.tsx already expects this exact shape.
-- ============================================================================

create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_gate int; v_total bigint; v_publish boolean;
begin
  v_gate    := setting_int('critical_mass_gate', 400);
  v_publish := setting_bool('publish_global_view', false);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  -- Never overclaim. Below the gate there is no global picture to report.
  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'completions', v_total,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0)
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false          -- the line 0009 exists for; kept
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    -- Only geographies past the gate are ever named with a score — same rule
    -- 0009 applied, now carrying per-tier detail so the map can switch tiers.
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Demo mirror. Same restoration, demo space, no publish gate (the sandbox is
-- always "on" by design — see 0006 / 0009).
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true           -- the fiction, aggregated only within itself
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Verify: run against a project with demo data seeded.
--   select public.collab_intelligence_demo() -> 'totals';        -- populated
--   select public.collab_intelligence_demo() -> 'trend';         -- non-null if >1 year of demo data
--   select public.collab_intelligence_demo() -> 'findings';      -- populated
--   select public.collab_intelligence_demo() -> 'countries' -> 0 -> 'tiers'; -- populated
-- ============================================================================


-- ─── 0016_org_activation_status.sql ────────────────────────────────────

-- ============================================================================
-- The Jesus Index — organisation activation status (migration 0016)
--
-- Item 5 from the batch request: "toggle activation status (open, pause, or
-- shut down access) for any organization space." campaigns already had an
-- `active` flag (one campaign, one link), but nothing let an administrator
-- pause an ORGANISATION as a whole — every campaign it owns, in one action,
-- without having to find and flip each one.
-- ============================================================================

alter table public.organisations
  add column if not exists status text not null default 'active'
    check (status in ('active', 'paused', 'closed'));

comment on column public.organisations.status is
  'active: normal. paused: existing links stop accepting new sessions, reversible, org-visible. closed: same effect, intended as durable — the two are the same mechanism, status is the only difference.';

-- ----------------------------------------------------------------------------
-- start_session() now also refuses on behalf of a paused/closed organisation,
-- not just an inactive campaign. Two different, distinguishable messages, so
-- the frontend can tell a respondent something true rather than a generic
-- failure -- and so this is not confused with the campaign-level `active`
-- flag, which still means "this specific link," not "this organisation."
-- ----------------------------------------------------------------------------
create or replace function public.start_session(
  p_campaign_id uuid,
  p_age_band text default null,
  p_gender   text default null,
  p_country  text default null,
  p_city     text default null,
  p_locale   text default 'en',
  p_consent  jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; v_org_status text;
begin
  if not exists (select 1 from campaigns c where c.id = p_campaign_id and c.active) then
    raise exception 'campaign not found or inactive';
  end if;

  select o.status into v_org_status
  from campaigns c join organisations o on o.id = c.org_id
  where c.id = p_campaign_id;

  if v_org_status = 'paused' then
    raise exception 'organisation access is paused';
  elsif v_org_status = 'closed' then
    raise exception 'organisation access is closed';
  end if;

  insert into sessions (campaign_id, age_band, gender, country, city, locale, consent)
  values (p_campaign_id, p_age_band, p_gender, p_country, p_city,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.start_session(uuid,text,text,text,text,text,jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Admin-only status changes. Same shape as set_user_role() and
-- decide_access_request(): the check is the first line, and the action is
-- logged nowhere special because my_role() itself is the audit trail --
-- only an administrator's session can ever reach this branch.
-- ----------------------------------------------------------------------------
create or replace function public.set_org_status(p_short_name text, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can change an organisation''s status';
  end if;
  if p_status not in ('active', 'paused', 'closed') then
    raise exception 'status must be active, paused, or closed';
  end if;
  update organisations set status = p_status where short_name = p_short_name;
  if not found then
    raise exception 'no organisation with short_name %', p_short_name;
  end if;
end;
$$;

grant execute on function public.set_org_status(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_worklist() gains status per organisation, and a fourth item: any org
-- an admin left paused/closed for more than a beat is worth a second look,
-- the same way "has a live survey and no responses" already is.
-- ----------------------------------------------------------------------------
create or replace function public.admin_worklist()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if my_role() <> 'admin' then
    raise exception 'the worklist is for administrators';
  end if;

  select jsonb_build_object(
    'access_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'email', a.email, 'reason', a.reason,
        'status', a.status, 'created_at', a.created_at
      ) order by a.created_at desc)
      from access_requests a where a.status = 'requested'
    ), '[]'::jsonb),

    'people', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', au.role) order by u.email)
      from app_users au join auth.users u on u.id = au.id
    ), '[]'::jsonb),

    -- Live organisations only. The 26 synthetic ones are not work.
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'short_name', o.short_name, 'name', o.name, 'country', o.country,
        'verified', o.verified, 'has_brand', (o.logo_url is not null or o.brand_color is not null),
        'status', o.status,
        'campaigns', (select count(*) from campaigns c where c.org_id = o.id),
        'responses', (
          select count(*) from responses r
          join sessions s on s.id = r.session_id
          join campaigns c on c.id = s.campaign_id
          where c.org_id = o.id
        )
      ) order by o.name)
      from organisations o where o.is_demo = false
    ), '[]'::jsonb),

    -- How close each country is to unlocking a benchmark for everyone in it.
    -- Concentration is the constraint, so this is the number that steers effort.
    'clusters', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'completions', n, 'orgs', orgs)
                       order by n desc)
      from (
        select o.country, count(distinct s.id) n, count(distinct o.id) orgs
        from organisations o
        join campaigns c on c.org_id = o.id
        join sessions s on s.campaign_id = c.id
        where o.is_demo = false and o.country is not null
        group by o.country
      ) k
    ), '[]'::jsonb),

    'instrument', (
      select jsonb_build_object('version', iv.version, 'status', iv.status,
                                'items', (select count(*) from items i where i.instrument_version_id = iv.id))
      from instrument_versions iv where iv.status = 'active' limit 1
    ),

    'settings', coalesce((
      select jsonb_object_agg(key, value) from platform_settings
    ), '{}'::jsonb),

    'spaces', data_space_report()
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_worklist() to authenticated;

-- ----------------------------------------------------------------------------
-- org_worklist() gains the same status awareness. Paused/closed surfaces as a
-- Band A item -- the console already renders exactly this shape for "your
-- logo is not set" etc, so this needs no new UI, just a truthful item.
-- ----------------------------------------------------------------------------
create or replace function public.org_worklist(p_short_name text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org public.organisations%rowtype; v_items jsonb := '[]'::jsonb; v_n bigint;
begin
  select * into v_org from organisations o where o.short_name = lower(btrim(p_short_name));
  if not found then raise exception 'organisation not found'; end if;
  if field_authority(v_org.id) is null then
    raise exception 'not authorised for this organisation';
  end if;

  if v_org.status = 'paused' then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label',
      'Your access is paused by an administrator — your links stop accepting new responses until this is lifted',
      'action', 'Contact an administrator');
  elsif v_org.status = 'closed' then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label',
      'Your access is closed by an administrator — your links no longer accept new responses',
      'action', 'Contact an administrator');
  end if;

  if not exists (select 1 from campaigns c where c.org_id = v_org.id and c.active) then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', 'Your survey is not live yet', 'action', 'Finish setup');
  end if;

  if v_org.logo_url is null then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', 'Your logo is not set — respondents see ours', 'action', 'Upload');
  end if;

  if v_org.welcome_message is null or v_org.closing_message is null then
    v_items := v_items || jsonb_build_object(
      'urgency', 'low', 'label', 'Your welcome and closing messages are the defaults', 'action', 'Edit');
  end if;

  select count(*) into v_n
    from responses r join sessions s on s.id = r.session_id
    join campaigns c on c.id = s.campaign_id
   where c.org_id = v_org.id;

  if v_n = 0 and exists (select 1 from campaigns c where c.org_id = v_org.id and c.active) then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', 'Your survey is live but nobody has answered yet', 'action', 'Share the link');
  end if;

  return jsonb_build_object(
    'org',       jsonb_build_object('short_name', v_org.short_name, 'name', v_org.name,
                                    'is_demo', v_org.is_demo, 'status', v_org.status),
    'responses', v_n,
    'links',     org_links(v_org.short_name),
    'items',     v_items
  );
end;
$$;

grant execute on function public.org_worklist(text) to authenticated;


-- ─── 0017_org_benchmark_comparison.sql ─────────────────────────────────

-- ============================================================================
-- The Jesus Index — org-facing benchmark comparison (migration 0017)
--
-- Item 7 from the batch request: a comparison toggle on an org's own
-- dashboard, contrasting their result against a country baseline and a
-- global baseline. Same critical-mass discipline as collab_intelligence():
-- a number is never shown for a geography that has not passed the gate, and
-- every figure that IS shown carries its own n.
--
-- Deliberately excludes the requesting org's own responses from whichever
-- baseline it is being compared against — "how do you compare to others",
-- not "how do you compare to a pool you are already part of".
-- ============================================================================

create or replace function public.org_benchmark(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_gate int;
  v_publish_global boolean;
  v_country_n bigint;
  v_country_tiers jsonb;
  v_country_index numeric;
  v_global_n bigint;
  v_global_tiers jsonb;
  v_global_index numeric;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_gate := setting_int('critical_mass_gate', 400);
  v_publish_global := setting_bool('publish_global_view', false);

  -- Country baseline: same country, live space, every org except this one.
  if v_org.country is not null then
    with country_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.country = v_org.country
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from country_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from country_r group by tier) t)
    into v_country_n, v_country_tiers;
  end if;

  if v_country_n >= v_gate then
    select round(avg(value::numeric),1) into v_country_index
    from jsonb_each_text(coalesce(v_country_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_country_tiers := null;
  end if;

  -- Global baseline: every country, live space, every org except this one —
  -- gated on BOTH the critical-mass count and the separate publish_global_view
  -- switch, matching collab_intelligence()'s own public-facing gate. A number
  -- not fit to publish on /intelligence should not reach an org privately either.
  if v_publish_global then
    with global_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from global_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from global_r group by tier) t)
    into v_global_n, v_global_tiers;
  end if;

  if v_global_n >= v_gate then
    select round(avg(value::numeric),1) into v_global_index
    from jsonb_each_text(coalesce(v_global_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_global_tiers := null;
  end if;

  return jsonb_build_object(
    'gate', v_gate,
    'country', jsonb_build_object(
      'geography', v_org.country,
      'available', v_country_n >= v_gate,
      'n', coalesce(v_country_n, 0),
      'index', v_country_index,
      'tiers', v_country_tiers
    ),
    'global', jsonb_build_object(
      'available', v_publish_global and v_global_n >= v_gate,
      'n', coalesce(v_global_n, 0),
      'index', v_global_index,
      'tiers', v_global_tiers
    )
  );
end;
$$;

grant execute on function public.org_benchmark(text) to authenticated;


-- ─── 0018_regional_map_layer.sql ───────────────────────────────────────

-- ============================================================================
-- NGJFI platform — regional heat map layer (migration 0018)
--
-- Items 6/8/7's remaining piece: the world map only ever showed individual
-- countries, positioned by a hand-placed pixel grid (TILES in
-- IntelligenceView.tsx) that only covers the ~26 demo countries. That's fine
-- for the sandbox but doesn't scale to a real organisation in a country
-- nobody hand-positioned. Regions (the 11 NXT Move regions, already a column
-- on organisations) don't have that problem — there are only 11 of them, so
-- the map can lay them out generically instead of by hardcoded pixel.
--
-- collab_intelligence() already returned a 'regions' array, but only a single
-- blended index — no per-tier breakdown, so the map's existing tier switcher
-- couldn't drive a regional view the way it already drives the country one.
-- This adds regions[].tiers, the same shape countries[].tiers already has.
--
-- Also closes a real gap while touching this code: regions were NEVER
-- critical-mass gated, unlike countries. A region with one small org in it
-- could be named with a score. Now gated identically.
-- ============================================================================

create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_gate int; v_total bigint; v_publish boolean;
begin
  v_gate    := setting_int('critical_mass_gate', 400);
  v_publish := setting_bool('publish_global_view', false);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'completions', v_total,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0)
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_gate),
    -- Same gate as countries — a region is only ever named with a score once
    -- ITS OWN n passes the critical-mass threshold, never inherited from the
    -- global total being published.
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Demo mirror. Same addition, demo space, no gate (matches how countries
-- already work here — the sandbox is always "on" by design, see 0006/0009).
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;


-- ─── 0019_privacy_and_metadata_compliance.sql ──────────────────────────

-- ============================================================================
-- The Jesus Index — privacy & metadata compliance confirmation (migration 0019)
--
-- Response to the closing data-model review. Four separate changes:
--
--   1. Metadata narrowed to exactly what was approved: organisation, country
--      (region is derived from the org, never stored per-session), age band,
--      language, survey date, survey version. gender and city are DROPPED —
--      not just stopped in the UI, the columns themselves are gone.
--   2. A general small-group floor (min_group_n, default 10) alongside the
--      existing critical-mass gate (400, for naming a geography). The two
--      are different things: 400 is "is this claim big enough to publish",
--      10 is "is this specific number too small to show at all, to anyone,
--      ever" — a k-anonymity floor, not a publication threshold.
--   3. org_dashboard() now honours that floor: an organisation with fewer
--      than min_group_n completions sees its own count (never hidden — "of
--      those who completed the Index" needs the n to mean anything) but no
--      derived score, the same way a country below 400 gets no score on
--      /intelligence.
--   4. by_age on collab_intelligence()/_demo() gets the same floor per age
--      band — it was the one breakdown on that page with no group-size
--      check at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Metadata: drop what was never approved.
-- ----------------------------------------------------------------------------
alter table public.sessions drop column if exists gender;
alter table public.sessions drop column if exists city;

create or replace function public.set_session_context(
  p_session_id uuid, p_field text, p_value text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;

  if p_field not in ('age_band', 'country') then
    raise exception 'field % is not settable from the survey', p_field;
  end if;

  if p_value is not null and length(p_value) > 64 then
    raise exception 'value too long for %', p_field;
  end if;

  if    p_field = 'age_band' then update sessions set age_band = p_value where id = p_session_id;
  elsif p_field = 'country'  then update sessions set country  = p_value where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.set_session_context(uuid, text, text) to anon, authenticated;

-- start_session() drops the gender/city parameters it accepted but the
-- frontend never actually passed (session context is set per-item via
-- set_session_context, above, not at session creation) -- keeping them would
-- have been a live way to write metadata that no longer has a column.
--
-- RECONCILED with migration 0016 (organisation activation status): that
-- migration's own start_session() redefinition still had gender/city and
-- runs before this one (16 < 19), so without this, 0019 would have silently
-- reverted 0016's organisation-status check the moment both were applied in
-- sequence. This version carries both: the pause/closed guard from 0016,
-- and the gender/city removal from this migration.
create or replace function public.start_session(
  p_campaign_id uuid,
  p_age_band text default null,
  p_country  text default null,
  p_locale   text default 'en',
  p_consent  jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; v_org_status text;
begin
  if not exists (select 1 from campaigns c where c.id = p_campaign_id and c.active) then
    raise exception 'campaign not found or inactive';
  end if;

  select o.status into v_org_status
  from campaigns c join organisations o on o.id = c.org_id
  where c.id = p_campaign_id;

  if v_org_status = 'paused' then
    raise exception 'organisation access is paused';
  elsif v_org_status = 'closed' then
    raise exception 'organisation access is closed';
  end if;

  insert into sessions (campaign_id, age_band, country, locale, consent)
  values (p_campaign_id, p_age_band, p_country,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.start_session(uuid,text,text,text,jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. The small-group floor, alongside (not instead of) critical_mass_gate.
-- ----------------------------------------------------------------------------
insert into platform_settings (key, value, note)
values ('min_group_n', '10'::jsonb, 'Any group, filter, or organisation below this many respondents shows n but no derived score, anywhere on the platform. Separate from critical_mass_gate (400), which governs when a GEOGRAPHY may be named at all.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. org_dashboard(): honour the floor. Also fixes a real pre-existing bug
-- caught while adding this -- 'n' was count(*) over response ROWS, not
-- count(distinct session), so a 3-respondent org answering a 24-item Index
-- reported n=72. That bug would have made a respondent-count gate meaningless,
-- so it's fixed here rather than filed separately.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb;
  v_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select count(distinct sid) into v_n from r;

  -- Below the floor: n is real and always shown ("of those who completed the
  -- Index" needs it to mean something) -- everything derived from it is not.
  if v_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', false,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   blended_trend(v_org.id, v_org.is_demo)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. by_age on collab_intelligence()/_demo(): the one breakdown on that page
-- with no group-size check at all until now. Everything else here is
-- identical to migration 0018 (regions[].tiers, the same-org region gate) --
-- only the by_age subquery and its new min_group_n variable are new.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
begin
  v_gate         := setting_int('critical_mass_gate', 400);
  v_publish      := setting_bool('publish_global_view', false);
  v_min_group_n  := setting_int('min_group_n', 10);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'completions', v_total,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0)
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    -- min_group_n floor: an age band with too few respondents is omitted,
    -- not zero-filled -- the frontend already treats a missing key as "no
    -- data" for every other breakdown on this page.
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_gate),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_min_group_n int;
begin
  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, true),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Retention: row-level data gone after 24 months, anonymous aggregate
-- kept -- AND that aggregate is actually read by the trend charts, not just
-- written. "Row-level" means sessions and responses -- individual answers
-- tied to one respondent's visit. Before deleting a batch, this folds its
-- contribution into a permanent, already-anonymous yearly aggregate (org +
-- year + domain + tier -> mean + n) so "movement over time" keeps years that
-- have aged out of the raw tables. The merge is weighted by n, so running
-- this monthly and having it repeatedly touch the same org/year bucket as
-- more of that year ages past the cutoff stays mathematically correct, not
-- just additive.
--
-- is_demo is captured at archive time (not looked up live at read time)
-- specifically so a trend query never needs to trust that an archived row's
-- parent organisation still exists and is still correctly flagged -- the
-- live/demo space split, which this platform treats as close to sacred, is
-- baked into the row itself and survives independently.
--
-- Deliberately a callable function, not a database-level cron job — pg_cron
-- may not be enabled on every tier, and Jurie should be able to see it run
-- (or run it by hand) rather than have it fire silently. A scheduled
-- workflow calling this via the Management API, the same pattern the repo
-- already uses for the weekly keepalive, is the natural way to automate it
-- once someone wants that.
-- ----------------------------------------------------------------------------
create table if not exists public.retained_aggregates (
  org_id          uuid not null references public.organisations(id) on delete cascade,
  is_demo         boolean not null,
  year            int not null,
  question_domain text not null,
  tier            text not null,
  mean            numeric,
  n               int not null,
  updated_at      timestamptz not null default now(),
  primary key (org_id, year, question_domain, tier)
);

alter table public.retained_aggregates enable row level security;
-- No policies: only ever read via the security-definer RPCs below, same
-- posture as every other aggregate table on this platform.

create or replace function public.purge_stale_respondent_data(p_cutoff_months int default 24)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cutoff timestamptz := now() - (p_cutoff_months || ' months')::interval;
  v_archived_rows int;
  v_deleted_sessions int;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can purge respondent data';
  end if;

  with stale as (
    select rsp.question_domain, rsp.tier, rsp.normalized,
           extract(year from s.created_at)::int as yr, c.org_id, o.is_demo
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where s.created_at < v_cutoff and rsp.normalized is not null
  ),
  agg as (
    select org_id, is_demo, yr, question_domain, tier, round(avg(normalized),1) m, count(*) n
    from stale group by org_id, is_demo, yr, question_domain, tier
  )
  insert into retained_aggregates (org_id, is_demo, year, question_domain, tier, mean, n)
  select org_id, is_demo, yr, question_domain, tier, m, n from agg
  on conflict (org_id, year, question_domain, tier) do update
    set mean = round(
          ((retained_aggregates.mean * retained_aggregates.n) + (excluded.mean * excluded.n))
          / nullif(retained_aggregates.n + excluded.n, 0), 1),
        n = retained_aggregates.n + excluded.n,
        updated_at = now();

  get diagnostics v_archived_rows = row_count;

  -- responses cascade-delete with their session (0001: on delete cascade)
  delete from sessions where created_at < v_cutoff;
  get diagnostics v_deleted_sessions = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'sessions_deleted', v_deleted_sessions,
    'aggregate_buckets_touched', v_archived_rows
  );
end;
$$;

grant execute on function public.purge_stale_respondent_data(int) to authenticated;

-- ----------------------------------------------------------------------------
-- Shared helper: a year-by-year index trend, blending live responses with
-- whatever's already been archived-and-deleted for the same years. One
-- function, called from org_dashboard() (p_org_id set) and both
-- collab_intelligence() variants (p_org_id null, p_is_demo chooses the
-- space). Centralised so the three trend queries can't quietly drift apart
-- the way start_session() just did across two branches.
--
-- DELIBERATELY NOT granted to anon/authenticated: it takes a raw org_id and
-- has no authorisation check of its own -- that check belongs to whichever
-- caller decided p_org_id was allowed. It only needs to be callable by the
-- functions below, which reach it as their own (already security-definer)
-- role, not as the original request's role -- granting it directly would
-- let anyone read any organisation's trend by guessing a uuid.
-- ----------------------------------------------------------------------------
create or replace function public.blended_trend(p_org_id uuid, p_is_demo boolean)
returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (
    select extract(year from s.created_at)::int as yr, rsp.question_domain as dom, rsp.tier,
           avg(rsp.normalized) as m, count(*) as n
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = p_is_demo
      and (p_org_id is null or o.id = p_org_id)
    group by 1, 2, 3
  ),
  archived as (
    select year as yr, question_domain as dom, tier, mean as m, n
    from retained_aggregates
    where is_demo = p_is_demo
      and (p_org_id is null or org_id = p_org_id)
  ),
  combined as (
    select yr, dom, tier, m, n from live
    union all
    select yr, dom, tier, m, n from archived
  ),
  yearly_tier as (
    -- n-weighted, so a year straddling the retention cutoff (partly archived,
    -- partly still live) still produces one correct mean, not two competing ones.
    select yr, tier, sum(m * n) / nullif(sum(n), 0) as tm
    from combined group by yr, tier
  )
  select coalesce(jsonb_agg(jsonb_build_object('year', yr, 'index', round(idx::numeric, 1)) order by yr), '[]'::jsonb)
  from (select yr, avg(tm) as idx from yearly_tier group by yr) y;
$$;

-- No grant to anon/authenticated -- see note above. org_dashboard() and
-- collab_intelligence()/_demo() already own or run as a role that can call
-- it directly; that's the only path to it.


-- ─── 0020_country_critical_mass_tier.sql ───────────────────────────────

-- ============================================================================
-- The Jesus Index — tiered critical-mass gate: country vs. everything else
-- (migration 0020)
--
-- CLAUDE.md §3 non-negotiable #1 was updated: the critical-mass gate is now
-- explicitly TIERED by geography level, not one global number.
--
--   City/area level  — the existing gate, critical_mass_gate (400). Applies
--                       to naming an organisation, a region, or the platform
--                       as a whole (the "is there enough here to say anything
--                       at all" check already in collab_intelligence()).
--   Country level     — a SEPARATE, higher threshold. A country view only
--                       activates once that country's respondents reach
--                       country_critical_mass_gate (2000). Below that, the
--                       country stays hidden exactly like any other
--                       under-threshold geography — even if individual orgs
--                       or the org's region inside it have independently
--                       cleared their own, smaller gate. Each level is
--                       checked independently; clearing one says nothing
--                       about the other.
--
-- Before this migration, every call site reused critical_mass_gate (400) for
-- countries too — collab_intelligence()'s countries[] array, and
-- org_benchmark()'s country baseline. A country with as few as 400
-- respondents (plausibly one or two active orgs) could be named on
-- /intelligence and in an org's own benchmark comparison. That is exactly
-- the small-town-style over-disclosure risk the non-negotiable now calls out
-- explicitly, one level up: a country is a bigger bucket than a city, but a
-- handful of concentrated orgs can still make 400 respondents in one country
-- functionally identify which two or three organisations they came from.
--
-- Deliberately NOT touched:
--   * collab_intelligence_demo() — synthetic data is never gated by either
--     threshold, matching the platform's existing convention that the demo
--     space illustrates what the product looks like at scale rather than
--     enforcing real-world disclosure limits on invented respondents.
--   * regions[] — a region (11 NXT Move regions) is coarser than a country,
--     not finer, so it stays on critical_mass_gate (400), unchanged.
--   * the platform-wide "is anything published yet" check in
--     collab_intelligence() (v_total < v_gate) — that gates whether the page
--     shows anything at all, not whether one specific country is named.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The new setting. Versioned config, per non-negotiable #3 — not a
-- constant baked into a function body.
-- ----------------------------------------------------------------------------
insert into platform_settings (key, value, note)
values (
  'country_critical_mass_gate',
  '2000'::jsonb,
  'Completed responses required from a single country before that country may be named with a score anywhere on the platform (collab_intelligence() countries[], org_benchmark()''s country baseline). Separate from and higher than critical_mass_gate (400), which continues to govern organisations, regions, and the platform-wide publish check. Clearing this says nothing about whether any city/org inside the country has cleared its own, smaller gate, or vice versa — the two levels are checked independently.'
)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. collab_intelligence(): countries[] now gated on the country threshold,
-- not the general one. Everything else (regions[], the top-level publish
-- check, funnel/domains/matrix/by_age/trend) is unchanged from 0019.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb; v_gate int; v_country_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
begin
  v_gate         := setting_int('critical_mass_gate', 400);
  v_country_gate := setting_int('country_critical_mass_gate', 2000);
  v_publish      := setting_bool('publish_global_view', false);
  v_min_group_n  := setting_int('min_group_n', 10);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'country_gate', v_country_gate,
      'completions', v_total,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0)
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'country_gate', v_country_gate,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    -- COUNTRY: gated on v_country_gate (2000), not v_gate. A country with
    -- 400-1999 respondents now shows in totals.countries (it's counted) but
    -- is never named with a score in this array until it independently
    -- clears the higher bar.
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_country_gate),
    -- REGION: unchanged, still v_gate (400) — coarser than a country, not finer.
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. org_benchmark(): the country baseline now needs v_country_gate (2000)
-- respondents from that country (excluding the requesting org's own, as
-- before), not the general 400. The global baseline is unchanged — it is not
-- "a geography" being named, it is the whole live population, and stays
-- behind the existing publish_global_view + critical_mass_gate pairing.
-- ----------------------------------------------------------------------------
create or replace function public.org_benchmark(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_gate int;
  v_country_gate int;
  v_publish_global boolean;
  v_country_n bigint;
  v_country_tiers jsonb;
  v_country_index numeric;
  v_global_n bigint;
  v_global_tiers jsonb;
  v_global_index numeric;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_gate           := setting_int('critical_mass_gate', 400);
  v_country_gate   := setting_int('country_critical_mass_gate', 2000);
  v_publish_global := setting_bool('publish_global_view', false);

  -- Country baseline: same country, live space, every org except this one.
  if v_org.country is not null then
    with country_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.country = v_org.country
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from country_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from country_r group by tier) t)
    into v_country_n, v_country_tiers;
  end if;

  if v_country_n >= v_country_gate then
    select round(avg(value::numeric),1) into v_country_index
    from jsonb_each_text(coalesce(v_country_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_country_tiers := null;
  end if;

  -- Global baseline: every country, live space, every org except this one —
  -- gated on BOTH the critical-mass count and the separate publish_global_view
  -- switch, matching collab_intelligence()'s own public-facing gate. A number
  -- not fit to publish on /intelligence should not reach an org privately either.
  if v_publish_global then
    with global_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from global_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from global_r group by tier) t)
    into v_global_n, v_global_tiers;
  end if;

  if v_global_n >= v_gate then
    select round(avg(value::numeric),1) into v_global_index
    from jsonb_each_text(coalesce(v_global_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_global_tiers := null;
  end if;

  return jsonb_build_object(
    'gate', v_gate,
    'country', jsonb_build_object(
      'geography', v_org.country,
      'available', v_country_n >= v_country_gate,
      'gate', v_country_gate,
      'n', coalesce(v_country_n, 0),
      'index', v_country_index,
      'tiers', v_country_tiers
    ),
    'global', jsonb_build_object(
      'available', v_publish_global and v_global_n >= v_gate,
      'n', coalesce(v_global_n, 0),
      'index', v_global_index,
      'tiers', v_global_tiers
    )
  );
end;
$$;

grant execute on function public.org_benchmark(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. data_space_report(): surface the new threshold alongside the existing
-- one so the admin console (and anyone auditing settings) sees both tiers,
-- not just one.
-- ----------------------------------------------------------------------------
create or replace function public.data_space_report()
returns jsonb
language sql security definer set search_path = public as $$
  with per as (
    select o.is_demo,
           count(distinct o.id)  as orgs,
           count(distinct s.id)  as sessions,
           count(rsp.id)         as responses
      from organisations o
      left join campaigns c on c.org_id = o.id
      left join sessions  s on s.campaign_id = c.id
      left join responses rsp on rsp.session_id = s.id
     group by o.is_demo
  )
  select jsonb_build_object(
    'live', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = false), jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'demo', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = true),  jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'gate', setting_int('critical_mass_gate', 400),
    'country_gate', setting_int('country_critical_mass_gate', 2000),
    'global_view_published', setting_bool('publish_global_view', false),
    'checked_at', now()
  );
$$;

grant execute on function public.data_space_report() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. collab_worklist(): the same inconsistency, caught by the same review.
-- This is the Collab-facing worklist ("Norway is 140 completions from its
-- first benchmark") — it is entirely ABOUT which countries are closing in on
-- a nameable benchmark, so it must use country_critical_mass_gate, not the
-- general 400. Left as 400, it would tell an admin a country is "done" at a
-- count the platform will then refuse to actually publish on /intelligence —
-- the worklist and the publish gate silently disagreeing with each other.
--
-- The returned 'gate' key keeps its name (no frontend change needed — Console
-- reads it generically as "the gate this worklist is about") but now carries
-- the country value. org/region readiness has no equivalent worklist item
-- today; if one is added later it should return its own key rather than
-- overload this one.
-- ----------------------------------------------------------------------------
create or replace function public.collab_worklist()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_gate int; v_c bigint;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  v_gate := setting_int('country_critical_mass_gate', 2000);

  -- Coverage, not volume. The same sixty organisations spread across forty
  -- countries unlocks nothing; concentrated in ten it unlocks all ten. So the
  -- worklist ranks by who is CLOSEST to a benchmark, not by who has the most.
  v_items := (
    select coalesce(jsonb_agg(jsonb_build_object(
             'urgency', 'high',
             'label', x.country || ' is ' || (v_gate - x.completions)
                      || ' completions from its first benchmark',
             'meta', x.completions || ' / ' || v_gate,
             'action', 'See who can close it')
           order by x.completions desc), '[]'::jsonb)
      from (
        select s.country, count(*) as completions
          from sessions s
          join campaigns c on c.id = s.campaign_id
          join organisations o on o.id = c.org_id
         where s.completed and o.is_demo = false and s.country is not null
         group by s.country
        having count(*) < v_gate
      ) x
  );

  select count(*) into v_c
    from organisations o
   where o.is_demo = false
     and not exists (select 1 from campaigns c where c.org_id = o.id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high',
      'label', v_c || ' organisation' || case when v_c = 1 then '' else 's' end
        || ' joined and never fielded', 'action', 'Nudge');
  end if;

  return jsonb_build_object(
    'gate',  v_gate,
    'waves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', w.short_name, 'name', w.name, 'item_set', w.item_set,
               'audiences', w.audiences, 'opens_on', w.opens_on, 'closes_on', w.closes_on,
               'adopted', (select count(*) from wave_adoptions a where a.wave_id = w.id))
             order by w.created_at desc)
        from waves w where w.is_demo = false), '[]'::jsonb),
    'items', v_items
  );
end;
$$;

grant execute on function public.collab_worklist() to authenticated;


-- ─── 0021_insight_layer_reporting.sql ──────────────────────────────────

-- ============================================================================
-- The Jesus Index — Drivers & Journey reporting (migration 0021)
--
-- CLAUDE.md non-negotiables #6 and #9: Drivers and Journey are unscored
-- ("insight layers") but they are still respondent data, and they were being
-- collected (instrument v3, PR #21/#23) with nowhere to see them — not on the
-- org dashboard, not on Collab Intelligence. This closes that gap:
--
--   #6 — "report them as aggregate option-selection rates only, never tied
--        to an individual, and gate them behind the same critical-mass rule
--        as scores."
--   #9 — "reported alongside the Index, not folded into it by default."
--
-- One new function, insight_aggregates(), computes option-selection rates
-- for every item tagged question_domain in ('drivers','journey'), scoped
-- either to one org or to a whole live/demo population. It is added as a new
-- top-level 'insights' key on org_dashboard(), collab_intelligence() and
-- collab_intelligence_demo() — never merged into 'tiers', 'domains', 'matrix'
-- or 'index', which stay exactly as they were. Non-negotiable #9 in the
-- database itself, not just convention: those three functions never read
-- question_domain in ('drivers','journey') anywhere in their score
-- computation, and this migration doesn't add any.
--
-- WHY OPTION COUNTS, NOT MEANS: Drivers/Journey items are multi_select
-- (respondents pick 0..N of a fixed list) — there is no numeric "mean" to a
-- set of choices, so the only honest aggregate is "what share of respondents
-- picked each option", per item, never per respondent.
--
-- PRIVACY: same floor as everywhere else. insight_aggregates() takes
-- min_group_n and, per item, returns n always (so "we asked this of N
-- people" is never hidden) but 'options' only once that item's own n clears
-- the floor — an item with fewer respondents than the floor (plausible here
-- specifically because Drivers/Journey sit behind an extra opt-in step,
-- continue_to_extras, so their n can be smaller than the org's overall
-- completions) shows n and nothing else, exactly like org_dashboard()'s
-- existing organisation-level suppression.
--
-- SCOPE, deliberately: org_dashboard_demo() (the signed-out /demo/dashboard
-- preview) is NOT touched here. It was already stale before this PR — it
-- never picked up 0019's min_group_n floor or the count(distinct session)
-- fix, and it computes trend inline instead of via blended_trend(). Bolting
-- insights onto it would mean reconciling all of that first, which is a
-- separate, pre-existing gap and not part of this change. The signed-out
-- demo preview will not show a Drivers/Journey panel until that's done.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. insight_aggregates(): the shared helper. Not granted to anon/authenticated
-- — same posture as blended_trend() — it takes a raw org_id with no
-- authorisation check of its own; that check belongs to whichever caller
-- decided p_org_id was allowed, and callers reach it as their own
-- (already security-definer) role.
-- ----------------------------------------------------------------------------
create or replace function public.insight_aggregates(
  p_org_id uuid, p_is_demo boolean, p_min_group_n int
)
returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (
    select rsp.item_key, rsp.raw_value, s.id as sid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.question_domain in ('drivers', 'journey')
      and o.is_demo = p_is_demo
      and (p_org_id is null or o.id = p_org_id)
  ),
  -- n per item = respondents who reached and submitted it, even with an
  -- empty selection ("none of these") — same "n is always real" principle
  -- as org_dashboard()'s own suppression.
  item_n as (
    select item_key, count(distinct sid) as n from r group by item_key
  ),
  -- One row per (item, selected option, respondent). Defensive typeof guard:
  -- these items are multi_select today (a JSON array), but question_domain
  -- is versioned config, not a type guarantee — a future single_select or
  -- open_text item tagged into these domains must degrade to zero option
  -- rows rather than throw, since jsonb_array_elements_text errors on a
  -- non-array scalar.
  opt_counts as (
    select r.item_key, opt.value as option_value, count(distinct r.sid) as n
    from r,
      jsonb_array_elements_text(
        case when jsonb_typeof(r.raw_value) = 'array' then r.raw_value else '[]'::jsonb end
      ) as opt(value)
    group by r.item_key, opt.value
  )
  select coalesce(jsonb_object_agg(
    item_n.item_key,
    jsonb_build_object(
      'n', item_n.n,
      'options', case when item_n.n >= p_min_group_n
        then coalesce(
          (select jsonb_object_agg(oc.option_value, oc.n) from opt_counts oc where oc.item_key = item_n.item_key),
          '{}'::jsonb
        )
        else null end
    )
  ), '{}'::jsonb)
  from item_n;
$$;

-- ----------------------------------------------------------------------------
-- 2. org_dashboard(): add 'insights'. Below the org's own min_group_n floor,
-- everything is already suppressed (including, now, insights); above it,
-- insight_aggregates() applies its own per-item floor on top, since an
-- individual Drivers/Journey item's n can be smaller than the org's overall
-- completions (continue_to_extras is an opt-in step, not everyone who
-- finishes the Index says yes to the extras).
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb;
  v_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select count(distinct sid) into v_n from r;

  -- Below the floor: n is real and always shown ("of those who completed the
  -- Index" needs it to mean something) -- everything derived from it is not.
  if v_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', false,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. collab_intelligence(): add 'insights', gated the same way the rest of
-- the page is — the early "not published yet" stub gets an empty object;
-- the real computation only runs once the platform-wide publish gate has
-- already passed, on top of which insight_aggregates() applies its own
-- per-item min_group_n floor.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb; v_gate int; v_country_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
begin
  v_gate         := setting_int('critical_mass_gate', 400);
  v_country_gate := setting_int('country_critical_mass_gate', 2000);
  v_publish      := setting_bool('publish_global_view', false);
  v_min_group_n  := setting_int('min_group_n', 10);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'country_gate', v_country_gate,
      'completions', v_total,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0),
      'insights',  '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'country_gate', v_country_gate,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    -- COUNTRY: gated on v_country_gate (2000), not v_gate. A country with
    -- 400-1999 respondents now shows in totals.countries (it's counted) but
    -- is never named with a score in this array until it independently
    -- clears the higher bar.
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_country_gate),
    -- REGION: unchanged, still v_gate (400) — coarser than a country, not finer.
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, false, v_min_group_n)
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. collab_intelligence_demo(): add 'insights'. No publish/critical-mass
-- gate here at all, matching every other field this function already
-- returns — synthetic data has never been gated, by existing convention
-- (see migration 0020). insight_aggregates()'s own min_group_n floor still
-- applies, since the demo data's per-item n can genuinely vary.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_min_group_n int;
begin
  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, true),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, true, v_min_group_n)
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;


-- ─── 0022_worklist_country_source.sql ──────────────────────────────────

-- ============================================================================
-- The Jesus Index — collab_worklist() country source, reconciled (migration 0022)
--
-- Flagged in the review that produced migrations 0020/0021 and left for a
-- separate change: collab_worklist() ranked countries by sessions.country
-- (the respondent's own self-reported demographic answer) while every other
-- geography query on the platform — collab_intelligence()'s countries[],
-- org_benchmark()'s country baseline, the regions rollups — uses
-- organisations.country (the organisation's registered country).
--
-- Two different things were both called "country" and silently disagreed:
-- a Kenyan respondent answering a UK-registered ministry's survey while
-- travelling would count toward Kenya in the worklist ("Kenya needs 40 more
-- completions") but toward the UK everywhere else the platform names a
-- country. Concentration is the whole point of this worklist's ranking
-- ("the same sixty organisations spread across forty countries unlocks
-- nothing; concentrated in ten it unlocks all ten") — a worklist counting a
-- different "country" than the gate it's steering toward can recommend
-- effort that never actually closes the gap collab_intelligence() checks.
--
-- Fix: collab_worklist() now uses organisations.country, matching
-- collab_intelligence() and org_benchmark(). This is the only change —
-- ranking logic, the "never fielded" nudge, and the returned shape are
-- otherwise identical to the version in migration 0014.
--
-- Deliberately NOT a schema change: sessions.country (the respondent's own
-- answer) still exists and is still collected — this migration only changes
-- which "country" collab_worklist() reads for its own ranking, to agree with
-- the rest of the platform. Whether a future rollup should ever use the
-- respondent's self-reported country instead of the organisation's is a
-- separate, larger question this migration deliberately does not settle.
-- ============================================================================

create or replace function public.collab_worklist()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_gate int; v_c bigint;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  v_gate := setting_int('country_critical_mass_gate', 2000);

  -- Coverage, not volume. The same sixty organisations spread across forty
  -- countries unlocks nothing; concentrated in ten it unlocks all ten. So the
  -- worklist ranks by who is CLOSEST to a benchmark, not by who has the most.
  --
  -- o.country, not s.country: this must count completions the same way
  -- collab_intelligence()'s countries[] does, or "Kenya is 40 away" can
  -- describe a gap that closing doesn't actually close.
  v_items := (
    select coalesce(jsonb_agg(jsonb_build_object(
             'urgency', 'high',
             'label', x.country || ' is ' || (v_gate - x.completions)
                      || ' completions from its first benchmark',
             'meta', x.completions || ' / ' || v_gate,
             'action', 'See who can close it')
           order by x.completions desc), '[]'::jsonb)
      from (
        select o.country, count(*) as completions
          from sessions s
          join campaigns c on c.id = s.campaign_id
          join organisations o on o.id = c.org_id
         where s.completed and o.is_demo = false and o.country is not null
         group by o.country
        having count(*) < v_gate
      ) x
  );

  select count(*) into v_c
    from organisations o
   where o.is_demo = false
     and not exists (select 1 from campaigns c where c.org_id = o.id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high',
      'label', v_c || ' organisation' || case when v_c = 1 then '' else 's' end
        || ' joined and never fielded', 'action', 'Nudge');
  end if;

  return jsonb_build_object(
    'gate',  v_gate,
    'waves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', w.short_name, 'name', w.name, 'item_set', w.item_set,
               'audiences', w.audiences, 'opens_on', w.opens_on, 'closes_on', w.closes_on,
               'adopted', (select count(*) from wave_adoptions a where a.wave_id = w.id))
             order by w.created_at desc)
        from waves w where w.is_demo = false), '[]'::jsonb),
    'items', v_items
  );
end;
$$;

grant execute on function public.collab_worklist() to authenticated;


-- ─── 0023_reconcile_demo_dashboard.sql ─────────────────────────────────

-- ============================================================================
-- The Jesus Index — reconcile org_dashboard_demo() with org_dashboard() (migration 0023)
--
-- Flagged during the Drivers/Journey reporting review and left for a
-- separate change: org_dashboard_demo() (the signed-out /demo/dashboard
-- preview) was never updated when migration 0019 fixed org_dashboard() —
-- it drifted on three points:
--
--   1. No min_group_n floor. A demo org with a handful of synthetic
--      responses could still show a derived score, which is exactly the
--      suppression 0019 added everywhere else on the platform.
--   2. The same n-counting bug 0019 fixed in org_dashboard(): 'n' was
--      count(*) over response ROWS (one row per item answered), not
--      count(distinct session) — a 3-respondent demo org answering a
--      24-item Index reported n=72, not 3.
--   3. Trend computed inline from raw responses instead of via
--      blended_trend(), so a demo org's "movement over time" ignores
--      the retention-archive blending every other trend chart already
--      gets.
--
-- Fix: org_dashboard_demo()'s body is now structurally identical to
-- org_dashboard()'s (post-0021), with only the is_demo guard and the anon
-- grant kept — both of which are this function's entire reason to exist as
-- a separate sibling rather than reusing org_dashboard() directly. This
-- includes migration 0021's 'insights' key (Drivers/Journey option rates),
-- now that 0021 has merged — the demo preview should show the same panels
-- the real dashboard does, not a strict subset of them.
-- ============================================================================

create or replace function public.org_dashboard_demo(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype; result jsonb;
  v_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if not coalesce(v_org.is_demo, false) then
    raise exception 'demo preview is only available for demo organisations';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select count(distinct sid) into v_n from r;

  -- Same suppression as org_dashboard(): n is real and always shown,
  -- everything derived from it is not, below the floor.
  if v_n < v_min_group_n then
    return jsonb_build_object(
      'demo', true,
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'demo', true,
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', false,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard_demo(text) to anon, authenticated;


-- ─── 0024_schema_migrations_ledger.sql ─────────────────────────────────

-- ============================================================================
-- The Jesus Index — track which migrations have been applied (migration 0024)
--
-- Until 16 September 2026 nothing recorded what this database had actually run.
-- Every migration was applied by hand, and the only record that 0021 had landed
-- was that org_dashboard() answered with an 'insights' key. That works until the
-- day someone forgets, and then the deployed application calls a function that
-- does not exist with no way to tell from the outside.
--
-- JFI Publish now applies migrations itself and writes to this table. The table
-- is created here so it is part of the tracked schema rather than a thing that
-- exists only because a service made it once.
--
-- 'baselined' marks the twenty-three migrations that were applied by hand before
-- this existed. They were recorded, not re-run — re-running 0001 against a live
-- database is not a thing you do to prove a point.
--
-- Idempotent: safe to run against a database that already has the table.
-- ============================================================================

create table if not exists public.schema_migrations (
  filename    text primary key,
  checksum    text        not null,
  applied_at  timestamptz not null default now(),
  applied_by  text,
  baselined   boolean     not null default false
);

comment on table public.schema_migrations is
  'One row per applied migration file. Written by JFI Publish. baselined = true means the row records a migration applied by hand before automated application existed, and its SQL was never executed by the publisher.';

comment on column public.schema_migrations.checksum is
  'sha256 of the migration file as applied. A mismatch means the file was edited after the fact — the publisher refuses to proceed rather than guess which side is right.';

-- Deployment history is not public data. The service reaches this table through
-- the Management API, which bypasses RLS, so no policy is needed here.
revoke all on public.schema_migrations from anon, authenticated;


-- ─── 0025_reinstate_gender_and_city.sql ────────────────────────────────

-- ============================================================================
-- The Jesus Index — reinstate gender, add city/area (migration 0025)
--
-- Instrument v4 (Youth-Collab-Survey-Augmented_F.docx) asks both branches a
-- "What best describes your gender?" question and, separately, "In which
-- city or area do you live?" — reopening two decisions migration 0019 made
-- during the approved-metadata privacy review:
--
--   * gender was DROPPED there ("never approved"). v4 REINSTATES it: an
--     explicit, deliberate decision for this version, made by the person who
--     owns the instrument content, not a silent reversal of 0019. It is
--     still a single_select from a fixed, non-identifying option list
--     (male/female/other/prefer_not_say), still asked with no name/email/
--     precise location, and still reported only in aggregate — same posture
--     as every other demographic field.
--
--   * city was ALSO dropped there, and is ADDED BACK here — but this time
--     with the current project's non-negotiable #1 explicitly in mind: a
--     free-text city/area is a real re-identification risk for a small town,
--     independent of the existing country-level critical-mass gate (migration
--     0020). This migration only adds the column and lets it be written; the
--     CITY-LEVEL critical-mass gate that non-negotiable #1 requires before any
--     city-scoped figure is ever shown is NOT implemented here — no query in
--     this codebase groups by city yet, so there is nothing to gate. Flagged
--     explicitly so it isn't forgotten: build the city-tier gate (mirroring
--     0020's country-tier pattern) before any surface reports by city.
--
-- Both columns are exactly what they were before 0019 dropped them: coarse,
-- optional, respondent-supplied text/category, no PII, written the same way
-- age_band/country already are — through set_session_context(), never
-- start_session(), so nothing new is exposed to anon beyond an allow-listed
-- column write on a session the caller already owns implicitly (RLS on
-- sessions has no anon policies at all; this RPC is SECURITY DEFINER and
-- validates the session exists, same as today).
-- ============================================================================

alter table public.sessions add column if not exists gender text;
alter table public.sessions add column if not exists city   text; -- optional, coarse (city/area free text)

create or replace function public.set_session_context(
  p_session_id uuid, p_field text, p_value text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;

  if p_field not in ('age_band', 'country', 'gender', 'city') then
    raise exception 'field % is not settable from the survey', p_field;
  end if;

  if p_value is not null and length(p_value) > 64 then
    raise exception 'value too long for %', p_field;
  end if;

  if    p_field = 'age_band' then update sessions set age_band = p_value where id = p_session_id;
  elsif p_field = 'country'  then update sessions set country  = p_value where id = p_session_id;
  elsif p_field = 'gender'   then update sessions set gender   = p_value where id = p_session_id;
  elsif p_field = 'city'     then update sessions set city     = p_value where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.set_session_context(uuid, text, text) to anon, authenticated;


-- ─── 0026_exploration_index.sql ────────────────────────────────────────

-- ============================================================================
-- The Jesus Index — the Exploration Index (migration 0026)
--
-- Instrument v4 gives respondents on the Unengaged branch (see
-- instrument.v4.json's version note) a full 24-item parallel measure, using
-- the SAME domain x tier cells as the official Index. The draft this was
-- built from says outright: "it does not make the scores equivalent." This
-- migration is the database half of honouring that: a second, completely
-- separate figure (the "Exploration Index"), computed the exact same way as
-- the official Index, that never contributes to it and is never summed or
-- averaged with it anywhere.
--
-- Mechanism: items.branch and responses.branch carry the instrument's own
-- `branch` tag ("engaged" | "unengaged" | null) through to every stored
-- response — the same pattern tier/question_domain already use (denormalised
-- onto the response row at write time, from the versioned instrument, never
-- hard-coded as a list of item keys in SQL). org_dashboard(),
-- collab_intelligence() and collab_intelligence_demo() then aggregate twice:
-- once excluding branch = 'unengaged' (unchanged behaviour — this is
-- 'index'/'tiers'/'domains'/'matrix', exactly as before), and once including
-- ONLY branch = 'unengaged' (new — 'exploration_index' etc.), and the two
-- are never combined.
--
-- src/lib/scoring.ts (the TS engine used for any client-side/dev computation)
-- got the identical split in the same PR.
-- ============================================================================

alter table public.items     add column if not exists branch text; -- 'engaged' | 'unengaged' | null
alter table public.responses add column if not exists branch text;

-- ----------------------------------------------------------------------------
-- 1. save_response(): carry the item's branch tag onto the response row,
-- exactly like tier/question_domain already are.
-- ----------------------------------------------------------------------------
create or replace function public.save_response(
  p_session_id uuid, p_item_key text, p_raw jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_item public.items%rowtype; v_iv uuid; v_norm numeric;
begin
  select c.instrument_version_id into v_iv
  from sessions s join campaigns c on c.id = s.campaign_id
  where s.id = p_session_id;
  if v_iv is null then raise exception 'session not found'; end if;

  select * into v_item from items where instrument_version_id = v_iv and key = p_item_key;
  if not found then raise exception 'unknown item %', p_item_key; end if;

  v_norm := public.ngjfi_normalize(v_item.type, v_item.scored, v_item.reverse_scored, v_item.scale, p_raw);

  insert into responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain, branch)
  values (p_session_id, v_item.id, p_item_key, p_raw, v_norm, v_item.tier, v_item.question_domain, v_item.branch)
  on conflict (session_id, item_id)
    do update set raw_value = excluded.raw_value, normalized = excluded.normalized, branch = excluded.branch;
end;
$$;

grant execute on function public.save_response(uuid, text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. org_dashboard(): exclude branch = 'unengaged' from the existing 'r' CTE
-- (so 'tiers'/'domains'/'matrix'/'index'/'items'/'n' behave exactly as
-- before — this is the defensive half of "never blended"), and add a second
-- 're' CTE + 'exploration_*' keys computed the identical way. Suppression:
-- the official figures keep their existing v_n / v_min_group_n gate,
-- unchanged; the exploration figures get their OWN independent v_explore_n
-- gate against the same v_min_group_n floor, since an org can clear one
-- without clearing the other.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb; result2 jsonb;
  v_n bigint; v_explore_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
  )
  select count(distinct sid) into v_n from r;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
  )
  select count(distinct sid) into v_explore_n from re;

  -- Below the floor: n is real and always shown ("of those who completed the
  -- Index" needs it to mean something) -- everything derived from it is not.
  -- The official and exploration figures are suppressed independently.
  if v_n < v_min_group_n and v_explore_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb,
      'exploration_n', v_explore_n, 'exploration_suppressed', true,
      'exploration_index', null, 'exploration_tiers', '{}'::jsonb,
      'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', v_n < v_min_group_n,
    'tiers',   case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t) end,
    'domains', case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d) end,
    'matrix',  case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y) end,
    'items',   case when v_n < v_min_group_n then '[]'::jsonb else
               (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z) end,
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  if v_n >= v_min_group_n then
    result := result || jsonb_build_object('index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('index', null);
  end if;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', v_explore_n,
    'exploration_suppressed', v_explore_n < v_min_group_n,
    'exploration_tiers',   case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from re group by tier) t) end,
    'exploration_domains', case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from re group by question_domain) d) end,
    'exploration_matrix',  case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from re group by question_domain, tier) x
                  group by question_domain) y) end
  ) into result2;

  result := result || result2;

  if v_explore_n >= v_min_group_n then
    result := result || jsonb_build_object('exploration_index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('exploration_index', null);
  end if;

  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. collab_intelligence(): same split. 'funnel'/'domains'/'matrix' exclude
-- branch = 'unengaged' (defensive, matches 0021's own comment that these
-- three never read question_domain in ('drivers','journey') -- now also
-- true of branch = 'unengaged'). 'exploration_funnel'/'exploration_domains'/
-- 'exploration_matrix'/'exploration_index'/'exploration_n' are new, gated by
-- the same platform-wide publish/critical-mass gate as everything else on
-- this page (unlike org_dashboard(), there is no separate per-org floor
-- here to apply independently).
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb; result2 jsonb; v_gate int; v_country_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
begin
  v_gate         := setting_int('critical_mass_gate', 400);
  v_country_gate := setting_int('country_critical_mass_gate', 2000);
  v_publish      := setting_bool('publish_global_view', false);
  v_min_group_n  := setting_int('min_group_n', 10);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'country_gate', v_country_gate,
      'completions', v_total,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0),
      'insights',  '{}'::jsonb,
      'exploration_n', 0, 'exploration_index', null,
      'exploration_funnel', '{}'::jsonb, 'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
      and (rsp.branch is distinct from 'unengaged')
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'country_gate', v_country_gate,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_country_gate),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, false, v_min_group_n)
  ) into result;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id as sid, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', (select count(distinct sid) from re),
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from re group by question_domain, tier) x
                  group by question_domain) y)
  ) into result2;

  result := result || result2;

  result := result || jsonb_build_object(
    'exploration_index',
    case when (result->>'exploration_n')::bigint >= v_min_group_n
      then (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_funnel','{}'::jsonb))
              where key in ('exposure','response','formation','multiplication'))
      else null
    end
  );

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. collab_intelligence_demo(): same split, no publish/critical-mass gate
-- (matches every other field here, per 0021's own comment -- synthetic data
-- has never been gated).
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; result2 jsonb; v_min_group_n int;
begin
  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
      and (rsp.branch is distinct from 'unengaged')
  ),
  ctry_tier as (
    select country, tier, round(avg(normalized),1) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, round(avg(normalized),1) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, true),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select round(avg(mm),1) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, true, v_min_group_n)
  ) into result;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id as sid, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', (select count(distinct sid) from re),
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from re group by question_domain, tier) x
                  group by question_domain) y)
  ) into result2;

  result := result || result2;

  result := result || jsonb_build_object(
    'exploration_index',
    case when (result->>'exploration_n')::bigint >= v_min_group_n
      then (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_funnel','{}'::jsonb))
              where key in ('exposure','response','formation','multiplication'))
      else null
    end
  );

  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;


-- ─── 0027_fix_start_session_overload.sql ───────────────────────────────

-- ============================================================================
-- The Jesus Index — fix start_session() overload ambiguity (migration 0027)
--
-- PRE-EXISTING BUG, unrelated to v4: migration 0019 changed start_session()'s
-- signature from 7 params (p_campaign_id, p_age_band, p_gender, p_country,
-- p_city, p_locale, p_consent) to 5 (p_campaign_id, p_age_band, p_country,
-- p_locale, p_consent), dropping p_gender/p_city. `create or replace
-- function` only replaces a function with the identical argument signature,
-- so this did not replace the old 7-arg function -- it created a second,
-- overloaded start_session() alongside it. Nothing ever dropped the old one.
--
-- Result: PostgREST cannot resolve which overload a call to
-- rpc('start_session', { p_campaign_id, p_locale }) means (both accept those
-- two), and returns PGRST203 "Could not choose the best candidate function."
-- Every call to start_session() -- i.e. every attempt to begin the survey,
-- for every organisation -- has been failing since 0019 was applied.
--
-- Fix: drop the orphaned 7-arg overload. The 5-arg version from 0019 (and
-- carried forward unchanged by 0025's set_session_context() work) is the one
-- application code actually calls; it's the only one that should exist.
-- ============================================================================

drop function if exists public.start_session(uuid, text, text, text, text, text, jsonb);

-- Confirm exactly one start_session() remains, with the expected signature.
do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'start_session';

  if v_count <> 1 then
    raise exception 'expected exactly 1 start_session() after this migration, found %', v_count;
  end if;
end $$;


-- ─── 0028_distribution_links_and_admin_console.sql ─────────────────────

-- ============================================================================
-- The Jesus Index — distribution links ("rooms") + the admin org console
-- (migration 0028)
--
-- Everything from this PR's Supabase-touching work, as one migration: a
-- named, rename-able distribution link an org can hand out (with its own
-- active window), and the staff-facing admin console detail that reads it
-- back alongside an org's countries, responses and real sign-in members.
--
-- PART 1 — distribution links ("rooms"). Locked Phase 2 brief: an org can
-- create multiple named, rename-able distribution links, each with its own
-- active date/time window. Responses captured through a link aggregate to
-- that link's own scoped view AND roll up into the org's total (they are
-- still ordinary sessions on the org's existing campaign — a link only tags
-- which door a respondent came through). A link's own view is NEVER
-- compared to the Collab (CLAUDE.md: "compare to Collab" stays house-level
-- only) — nothing below returns a compare baseline for a link, by
-- construction.
--
-- SCORING: deliberately NOT included. The brief itself flags the room-level
-- minimum-n privacy gate as an open research question (should a room need
-- its own critical-mass floor before showing a score, same as orgs and
-- countries do?). Per an explicit decision on this PR, rooms ship with NO
-- scores yet — org_distribution_links() returns only a response count and a
-- place descriptor (aggregate, not tied to any one respondent's answers).
-- Add scoring once researchers set a real per-room threshold; until then
-- there is nothing here for a missing gate to fail to protect.
--
-- PLACES: "which cities and countries a link's responses came from," so an
-- org can see at a glance what spaces it's sending a link to. This reads
-- sessions.city/country (already collected as ordinary demographic
-- questions, same as everywhere else on the platform) as a DISTINCT list —
-- never a per-respondent row, never combined with an answer or a score. Not
-- shown to any org until the SAME privacy bar as everywhere else applies:
-- aggregate only, respondent stays anonymous.
--
-- PART 2 — the admin org console. Ports the locked "Admin Console" demo
-- (JFINDX Redesign Demo artifact, Admin.dc.html) into the real /build
-- console's existing Band D ("The roll"): clicking an organisation opens a
-- detail panel with its survey links (Community/Open + any rooms), which
-- countries it's reached, how many responses it's gathered, and who its
-- signed-in admins are — no password field anywhere, because JFINDX has
-- none; every sign-in is Supabase Auth's one-time email link.
--
-- Deliberately NOT a new "primary contact" field. The demo's mockup used
-- one, but this repo already has a real concept for that — org_members rows
-- (people who signed in and self-claimed access via join_org_by_domain(),
-- migration 0002) — and adding a second, parallel, staff-typed "contact"
-- field would duplicate that and could drift from who can actually sign in.
-- So admin_org_detail() surfaces the REAL members instead of inventing one.
-- An org with nobody signed in yet correctly shows an empty list, not a
-- fabricated contact.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. distribution_links
-- ----------------------------------------------------------------------------
create table if not exists public.distribution_links (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id) on delete cascade,
  name         text not null,
  slug         text not null,
  -- Which of the org's two existing campaigns (community/open) this link
  -- feeds. Not a new instrument or scoring path — see CAMPAIGN_SLUG in
  -- src/components/survey/Survey.tsx. Config, not a hardcoded branch.
  audience     text not null default 'community' check (audience in ('community', 'public')),
  active_from  timestamptz,
  active_to    timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  unique (org_id, slug)
);

alter table public.distribution_links enable row level security;

-- No direct client SELECT/INSERT policies: every read and write goes through
-- the security-definer RPCs below (org_distribution_links /
-- upsert_distribution_link / resolve_distribution_link / admin_org_detail),
-- matching this repo's existing convention (org_dashboard(), org_benchmark(),
-- etc. — never raw table access from the browser for anything org- or
-- respondent-scoped).
revoke all on public.distribution_links from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. sessions gains an optional tag — which link (if any) a respondent came
-- through. Nullable: the two existing fixed audience links (community/open)
-- keep working exactly as before with no link at all.
-- ----------------------------------------------------------------------------
alter table public.sessions
  add column if not exists distribution_link_id uuid references public.distribution_links(id) on delete set null;

create index if not exists sessions_distribution_link_id_idx
  on public.sessions (distribution_link_id) where distribution_link_id is not null;

-- ----------------------------------------------------------------------------
-- 3. start_session(): drop the 5-arg version from 0019/0025 and recreate
-- with one new optional trailing param, p_distribution_link_slug. This MUST
-- be an explicit drop, not just create-or-replace — 0027 is exactly the bug
-- that happens when a signature changes without one (a silent second
-- overload, PostgREST then can't pick between them).
-- ----------------------------------------------------------------------------
drop function if exists public.start_session(uuid, text, text, text, jsonb);

create or replace function public.start_session(
  p_campaign_id uuid,
  p_age_band text default null,
  p_country  text default null,
  p_locale   text default 'en',
  p_consent  jsonb default '{}'::jsonb,
  p_distribution_link_slug text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  v_org_status text;
  v_org_id uuid;
  v_link_id uuid;
  v_now timestamptz := now();
begin
  if not exists (select 1 from campaigns c where c.id = p_campaign_id and c.active) then
    raise exception 'campaign not found or inactive';
  end if;

  select o.status, o.id into v_org_status, v_org_id
  from campaigns c join organisations o on o.id = c.org_id
  where c.id = p_campaign_id;

  if v_org_status = 'paused' then
    raise exception 'organisation access is paused';
  elsif v_org_status = 'closed' then
    raise exception 'organisation access is closed';
  end if;

  if p_distribution_link_slug is not null then
    select l.id into v_link_id
    from distribution_links l
    where l.org_id = v_org_id and l.slug = p_distribution_link_slug;

    if v_link_id is null then
      raise exception 'link not found';
    end if;

    if not exists (
      select 1 from distribution_links l
      where l.id = v_link_id
        and (l.active_from is null or l.active_from <= v_now)
        and (l.active_to   is null or l.active_to   >= v_now)
    ) then
      raise exception 'link is not open right now';
    end if;
  end if;

  insert into sessions (campaign_id, age_band, country, locale, consent, distribution_link_id)
  values (p_campaign_id, p_age_band, p_country,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb), v_link_id)
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.start_session(uuid, text, text, text, jsonb, text) to anon, authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'start_session';

  if v_count <> 1 then
    raise exception 'expected exactly 1 start_session() after this migration, found %', v_count;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. resolve_distribution_link(): public, read-only — lets the respondent
-- survey route (jfindx.org/<org>/l/<link>) find which audience/instrument a
-- link feeds and whether it is currently open, WITHOUT exposing the table
-- directly or any response data.
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
           and (v_link.active_to   is null or v_link.active_to   >= v_now)
  );
end;
$$;

grant execute on function public.resolve_distribution_link(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. org_distribution_links(): the links panel an org sees on its own
-- dashboard — AND, since admin/collab staff need to read the exact same
-- list for any org from the admin console (part 2 below), authorised for
-- both: the org's own active members, or platform staff. No score of any
-- kind (see header note) — response count + a place descriptor only, both
-- plain aggregates.
--
-- NAMED DELIBERATELY NOT "org_links" — that name is already taken by
-- org_links(text) in migration 0011 (the two fixed community/open URLs an
-- org hands out; still used by campaign_upsert()-adjacent admin RPCs in
-- 0014/0016). `create or replace function public.org_links(text)` would have
-- silently REPLACED that function instead of erroring, since Postgres
-- overloads by argument type, not name or param name, and text = text. This
-- is the same class of bug migration 0027 had to fix for start_session() —
-- caught here before it shipped.
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
          select distinct
                 trim(both ', ' from coalesce(s.city, '') ||
                      case when s.city is not null and s.country is not null then ', ' else '' end ||
                      coalesce(s.country, '')) as place
          from sessions s
          where s.distribution_link_id = l.id and s.completed and (s.city is not null or s.country is not null)
        ) distinct_places
      ) numbered
    ) places on true
    where l.org_id = v_org.id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.org_distribution_links(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. upsert_distribution_link(): create a new link, or rename/reschedule an
-- existing one (p_id supplied). Members only, own org only — creating and
-- editing links stays an org's own act, never something staff do on their
-- behalf from the admin console.
-- ----------------------------------------------------------------------------
create or replace function public.upsert_distribution_link(
  p_org_slug text,
  p_name text,
  p_slug text,
  p_id uuid default null,
  p_audience text default 'community',
  p_active_from timestamptz default null,
  p_active_to timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; v_id uuid;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then raise exception 'name is required'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,63}$' then raise exception 'slug must be lowercase letters, numbers and hyphens'; end if;
  if p_audience not in ('community', 'public') then raise exception 'audience must be community or public'; end if;

  if p_id is not null then
    update distribution_links
       set name = trim(p_name), slug = p_slug, audience = p_audience,
           active_from = p_active_from, active_to = p_active_to
     where id = p_id and org_id = v_org.id
    returning id into v_id;
    if v_id is null then raise exception 'link not found'; end if;
  else
    insert into distribution_links (org_id, name, slug, audience, active_from, active_to, created_by)
    values (v_org.id, trim(p_name), p_slug, p_audience, p_active_from, p_active_to, v_uid)
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id);
exception
  when unique_violation then
    raise exception 'a link with that URL already exists for this organisation';
end;
$$;

grant execute on function public.upsert_distribution_link(text, text, text, uuid, text, timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. admin_org_detail(p_org_slug): the staff-facing per-org summary behind
-- the admin console's "Links & access" panel. Admin or Collab tier only
-- (my_role(), same guard as admin_worklist()/collab_worklist()).
--
-- 'countries': distinct count + list of countries that org's respondents
-- reported — same count(distinct country) pattern collab_intelligence()
-- (migration 0021) already uses globally, scoped here to one org_id via
-- campaigns. This is aggregate geography, never a respondent row: no age,
-- no score, no city-level granularity returned here (city-level place
-- detail is what org_distribution_links()'s 'places' already covers, per
-- link, capped and aggregate — this stays coarser, at country level, for
-- the whole org at a glance).
--
-- 'responses': distinct COMPLETED SESSIONS, not response rows — matches
-- org_dashboard()'s own 'n', not admin_worklist()'s raw response-row count
-- (which is answers, not respondents, and would read as a much bigger,
-- more confusing number here).
--
-- 'members': org_members joined to app_users — the platform's one real
-- concept of "who can sign in to this org" (self-claimed via
-- join_org_by_domain()). No email is returned for anyone who is not an
-- active member of THIS org — this is not a platform-wide people list
-- (that's admin_worklist()'s existing 'people' key, unchanged).
-- ----------------------------------------------------------------------------
create or replace function public.admin_org_detail(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org public.organisations%rowtype; v_responses bigint; v_countries jsonb; v_country_count int;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'the org console is for administrators and the Collab';
  end if;

  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  select count(distinct s.id) into v_responses
    from sessions s
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and s.completed;

  select
    coalesce(jsonb_agg(x.country order by x.country), '[]'::jsonb),
    coalesce(count(*), 0)
  into v_countries, v_country_count
  from (
    select distinct s.country
    from sessions s
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and s.completed and s.country is not null
  ) x;

  return jsonb_build_object(
    'org', jsonb_build_object(
      'slug', v_org.slug,
      'short_name', v_org.short_name,
      'name', v_org.name,
      'website_domain', v_org.website_domain,
      'verified', v_org.verified,
      'status', v_org.status
    ),
    'responses', coalesce(v_responses, 0),
    'countries', v_countries,
    'countries_count', v_country_count,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(au.full_name, au.email),
        'email', au.email,
        'role', m.role,
        'status', m.status
      ) order by m.created_at)
      from org_members m
      join app_users au on au.id = m.user_id
      where m.org_id = v_org.id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_org_detail(text) to authenticated;


-- ─── 0029_score_scale_1_to_5.sql ───────────────────────────────────────

-- ============================================================================
-- The Jesus Index — report scores on a 1–5 scale, not 0–100 (migration 0029)
--
-- Every scored item in the live instrument (instrument.v4.json) is a
-- likert_5 item, so "1–5" is not a rebrand of the same number — it is the
-- actual raw Likert mean of what respondents answered. A tier/domain/matrix
-- cell of "3.4" now means "the average answer across these items was a 3.4
-- on a 1–5 scale," which a researcher or ministry leader can read without
-- translation, the way "62.3 out of 100" never quite could.
--
-- What did NOT change, on purpose:
--   - ngjfi_normalize() and responses.normalized stay exactly as they were:
--     every response is still stored normalised to 0–100 internally. This
--     is deliberate, not an oversight — it is the one common scale that can
--     absorb yes_no/frequency items too if the instrument ever adds scored
--     ones (today it has none), it keeps every already-stored response
--     re-scorable without a backfill, and it keeps retained_aggregates
--     (the purge-and-archive table) internally consistent with freshly
--     computed live figures, so blended_trend() can keep blending them
--     together exactly as before.
--   - Every internal aggregation (avg(), the correlation in
--     findings.formation_corr/formation_mult_r2, the n-weighted blend in
--     blended_trend()) is computed on that same internal 0–100 figures,
--     completely unchanged. Correlation is scale-invariant under a linear
--     transform anyway, so formation_mult_r2/formation_corr need no change
--     at all.
--
-- What DID change: every function below that used to hand a 0–100 number to
-- a client now converts it to 1–5 at the exact point it becomes an output
-- value, via the new ngjfi_to_5() helper. Anywhere a number is DERIVED from
-- an already-converted value inside the same function (e.g. "index" is the
-- mean of four already-converted tier scores; a region's "index" is the
-- mean of its already-converted tier object) needed NO code change — the
-- transform is linear, so the mean of converted values equals the
-- converted mean, and that identity is relied on deliberately throughout
-- this migration rather than converting the same number twice.
--
-- SCORING_VERSION bumps from v0.1.0 to v0.2.0: the scoring MATH is
-- identical (same items, same weights, same aggregation), but what the
-- number returned to a client means changed, which is exactly the kind of
-- fact a report generated before vs. after this migration needs to be able
-- to tell apart. src/lib/scoring.ts gets the identical version bump.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. The single conversion point. new = 1 + (old / 100) * 4, rounded to one
-- decimal — the inverse of likert_5's own (v-1)/4*100 normalisation, so for
-- every currently-scored item this is exactly the raw Likert mean, not an
-- approximation of it.
-- ----------------------------------------------------------------------------
create or replace function public.ngjfi_to_5(p_v numeric)
returns numeric
language sql immutable as $$
  select case when p_v is null then null else round(1 + (p_v / 100.0) * 4, 1) end;
$$;

comment on function public.ngjfi_to_5(numeric) is
  'Converts an internal 0-100 normalised mean to the 1-5 scale every client-facing score is now reported on. Null-safe. Inverse of the likert_5 branch of ngjfi_normalize().';

-- ----------------------------------------------------------------------------
-- 1. org_dashboard() — tiers/domains/matrix/items and their exploration
-- twins are leaf outputs, converted. index/exploration_index are derived
-- from the (now-converted) tiers objects — unchanged, correct for free.
-- Structurally identical to migration 0026's version otherwise.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb; result2 jsonb;
  v_n bigint; v_explore_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
  )
  select count(distinct sid) into v_n from r;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
  )
  select count(distinct sid) into v_explore_n from re;

  if v_n < v_min_group_n and v_explore_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'scale', 5,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb,
      'exploration_n', v_explore_n, 'exploration_suppressed', true,
      'exploration_index', null, 'exploration_tiers', '{}'::jsonb,
      'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', v_n < v_min_group_n,
    'scale', 5,
    'tiers',   case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t) end,
    'domains', case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d) end,
    'matrix',  case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y) end,
    'items',   case when v_n < v_min_group_n then '[]'::jsonb else
               (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z) end,
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  if v_n >= v_min_group_n then
    result := result || jsonb_build_object('index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('index', null);
  end if;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', v_explore_n,
    'exploration_suppressed', v_explore_n < v_min_group_n,
    'exploration_tiers',   case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t) end,
    'exploration_domains', case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d) end,
    'exploration_matrix',  case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                  group by question_domain) y) end
  ) into result2;

  result := result || result2;

  if v_explore_n >= v_min_group_n then
    result := result || jsonb_build_object('exploration_index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('exploration_index', null);
  end if;

  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. org_dashboard_demo() — same treatment, structurally identical to 0023.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_demo(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype; result jsonb;
  v_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if not coalesce(v_org.is_demo, false) then
    raise exception 'demo preview is only available for demo organisations';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select count(distinct sid) into v_n from r;

  if v_n < v_min_group_n then
    return jsonb_build_object(
      'demo', true,
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'scale', 5,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'demo', true,
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', false,
    'scale', 5,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard_demo(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. collab_intelligence() — funnel/domains/matrix/by_age/country+region
-- tiers/exploration_* are leaf outputs, converted. regions[].index is
-- derived from an already-converted tiers object — unchanged. mult_top/
-- mult_bottom ARE converted (they're displayed directly), which means the
-- formation_mult_r2/formation_corr/org_means (f, mm) intermediates stay on
-- the raw 0-100 scale throughout (untouched — correlation is scale
-- invariant, so this is correct either way), and the client-side ratio that
-- reads mult_top/mult_bottom needs its own fix — see IntelligenceView.tsx.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb; result2 jsonb; v_gate int; v_country_gate int; v_total bigint; v_publish boolean; v_min_group_n int;
begin
  v_gate         := setting_int('critical_mass_gate', 400);
  v_country_gate := setting_int('country_critical_mass_gate', 2000);
  v_publish      := setting_bool('publish_global_view', false);
  v_min_group_n  := setting_int('min_group_n', 10);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'country_gate', v_country_gate,
      'completions', v_total,
      'scale', 5,
      'totals',    jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0),
      'insights',  '{}'::jsonb,
      'exploration_n', 0, 'exploration_index', null,
      'exploration_funnel', '{}'::jsonb, 'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
      and (rsp.branch is distinct from 'unengaged')
  ),
  ctry_tier as (
    select country, tier, ngjfi_to_5(avg(normalized)) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, ngjfi_to_5(avg(normalized)) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'country_gate', v_country_gate,
    'scale', 5,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, false),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country and cn.n >= v_country_gate),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region and rn.n >= v_gate),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, false, v_min_group_n)
  ) into result;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id as sid, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', (select count(distinct sid) from re),
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                  group by question_domain) y)
  ) into result2;

  result := result || result2;

  result := result || jsonb_build_object(
    'exploration_index',
    case when (result->>'exploration_n')::bigint >= v_min_group_n
      then (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_funnel','{}'::jsonb))
              where key in ('exposure','response','formation','multiplication'))
      else null
    end
  );

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. collab_intelligence_demo() — same treatment as #3, is_demo = true.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; result2 jsonb; v_min_group_n int;
begin
  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
      and (rsp.branch is distinct from 'unengaged')
  ),
  ctry_tier as (
    select country, tier, ngjfi_to_5(avg(normalized)) m from r where country is not null group by country, tier
  ),
  ctry_n as (
    select country, count(distinct sid) n from r where country is not null group by country
  ),
  rgn_tier as (
    select region, tier, ngjfi_to_5(avg(normalized)) m from r where region is not null group by region, tier
  ),
  rgn_n as (
    select region, count(distinct sid) n from r where region is not null group by region
  ),
  org_means as (
    select oid,
           avg(normalized) filter (where tier = 'formation') as f,
           avg(normalized) filter (where tier = 'multiplication') as mm
    from r group by oid
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'scale', 5,
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band having count(distinct sid) >= v_min_group_n) a),
    'trend',   blended_trend(null, true),
    'countries', (select jsonb_agg(jsonb_build_object('country', ct.country, 'n', cn.n, 'tiers', ct.tiers)) from
                   (select country, jsonb_object_agg(tier, m) tiers from ctry_tier group by country) ct
                   join ctry_n cn on cn.country = ct.country),
    'regions', (select jsonb_agg(jsonb_build_object('region', rt.region, 'n', rn.n, 'tiers', rt.tiers,
                                                     'index', (select round(avg(value::numeric),1) from jsonb_each_text(rt.tiers)
                                                               where key in ('exposure','response','formation','multiplication')))
                                 order by rn.n desc) from
                 (select region, jsonb_object_agg(tier, m) tiers from rgn_tier group by region) rt
                 join rgn_n rn on rn.region = rt.region),
    'findings', jsonb_build_object(
      'formation_mult_r2', (select round((corr(f, mm)^2)*100)::int from org_means where f is not null and mm is not null),
      'formation_corr',    (select round(corr(f, mm)::numeric, 2) from org_means where f is not null and mm is not null),
      'mult_top',          (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 4),
      'mult_bottom',       (select ngjfi_to_5(avg(mm)) from (select mm, ntile(4) over (order by mm) q from org_means where mm is not null) z where q = 1)
    ),
    'insights', insight_aggregates(null, true, v_min_group_n)
  ) into result;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id as sid, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true
      and rsp.branch = 'unengaged'
  )
  select jsonb_build_object(
    'exploration_n', (select count(distinct sid) from re),
    'exploration_funnel',  (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t),
    'exploration_domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d),
    'exploration_matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                  group by question_domain) y)
  ) into result2;

  result := result || result2;

  result := result || jsonb_build_object(
    'exploration_index',
    case when (result->>'exploration_n')::bigint >= v_min_group_n
      then (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_funnel','{}'::jsonb))
              where key in ('exposure','response','formation','multiplication'))
      else null
    end
  );

  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. network_console() — funnel/domains and per-org index are leaf outputs.
-- ----------------------------------------------------------------------------
create or replace function public.network_console(p_short_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_net public.networks%rowtype; v_uid uuid := auth.uid(); result jsonb;
begin
  select * into v_net from networks where short_name = lower(btrim(p_short_name));
  if not found then raise exception 'network not found'; end if;

  if my_role() <> 'admin' and not exists (
    select 1 from network_members_users m
     where m.network_id = v_net.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this network';
  end if;

  with mem as (
    select o.id, o.short_name, o.name, o.country, nm.shares_index
      from network_members nm join organisations o on o.id = nm.org_id
     where nm.network_id = v_net.id
  ),
  r as (
    select rsp.tier, rsp.question_domain, rsp.normalized, s.id sid, m.id oid, m.shares_index
      from mem m
      join campaigns c on c.org_id = m.id
      join sessions s on s.campaign_id = c.id
      join responses rsp on rsp.session_id = s.id
     where rsp.normalized is not null
  )
  select jsonb_build_object(
    'network', jsonb_build_object('short_name', v_net.short_name, 'name', v_net.name, 'kind', v_net.kind),
    'members', (select count(*) from mem),
    'scale', 5,
    'headline', jsonb_build_object(
      'organisations', (select count(distinct oid) from r),
      'responses',     (select count(distinct sid) from r)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from
                 (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from
                 (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'short_name', m.short_name, 'name', m.name, 'country', m.country,
        'shares_index', m.shares_index,
        'index', case when m.shares_index then (
          select ngjfi_to_5(avg(x.normalized)) from r x where x.oid = m.id
        ) else null end,
        'responses', (select count(distinct x.sid) from r x where x.oid = m.id)
      ) order by m.name) from mem m
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.network_console(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. org_dashboard_admin() — tiers/domains/by_audience are leaf outputs.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_admin(p_short_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org public.organisations%rowtype; result jsonb;
begin
  if my_role() <> 'admin' then raise exception 'administrators only'; end if;
  select * into v_org from organisations where short_name = lower(btrim(p_short_name));
  if not found then raise exception 'organisation not found'; end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id sid, c.audience
      from responses rsp
      join sessions s on s.id = rsp.session_id
      join campaigns c on c.id = s.campaign_id
     where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('short_name', v_org.short_name, 'name', v_org.name,
                              'country', v_org.country, 'verified', v_org.verified),
    'n', (select count(distinct sid) from r),
    'scale', 5,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'by_audience', (select jsonb_object_agg(audience, m) from
                     (select audience, ngjfi_to_5(avg(normalized)) m from r group by audience) a)
  ) into result;
  return result;
end;
$$;

grant execute on function public.org_dashboard_admin(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. org_benchmark() — country/global tiers objects are leaf outputs; the
-- country_index/global_index scalars are derived from those same
-- (now-converted) tiers objects and need no separate change.
-- ----------------------------------------------------------------------------
create or replace function public.org_benchmark(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_gate int;
  v_country_gate int;
  v_publish_global boolean;
  v_country_n bigint;
  v_country_tiers jsonb;
  v_country_index numeric;
  v_global_n bigint;
  v_global_tiers jsonb;
  v_global_index numeric;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_gate           := setting_int('critical_mass_gate', 400);
  v_country_gate   := setting_int('country_critical_mass_gate', 2000);
  v_publish_global := setting_bool('publish_global_view', false);

  if v_org.country is not null then
    with country_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.country = v_org.country
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from country_r),
      (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from country_r group by tier) t)
    into v_country_n, v_country_tiers;
  end if;

  if v_country_n >= v_country_gate then
    select round(avg(value::numeric),1) into v_country_index
    from jsonb_each_text(coalesce(v_country_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_country_tiers := null;
  end if;

  if v_publish_global then
    with global_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from global_r),
      (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from global_r group by tier) t)
    into v_global_n, v_global_tiers;
  end if;

  if v_global_n >= v_gate then
    select round(avg(value::numeric),1) into v_global_index
    from jsonb_each_text(coalesce(v_global_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_global_tiers := null;
  end if;

  return jsonb_build_object(
    'gate', v_gate,
    'scale', 5,
    'country', jsonb_build_object(
      'geography', v_org.country,
      'available', v_country_n >= v_country_gate,
      'gate', v_country_gate,
      'n', coalesce(v_country_n, 0),
      'index', v_country_index,
      'tiers', v_country_tiers
    ),
    'global', jsonb_build_object(
      'available', v_publish_global and v_global_n >= v_gate,
      'n', coalesce(v_global_n, 0),
      'index', v_global_index,
      'tiers', v_global_tiers
    )
  );
end;
$$;

grant execute on function public.org_benchmark(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. blended_trend() — the ONLY change is the final conversion at the return
-- statement. `live`/`archived`/`combined`/`yearly_tier` all keep computing
-- on the raw 0-100 scale internally, so a live figure and an archived
-- retained_aggregates.mean (which is NOT rescaled by this migration, and
-- never will need to be) blend together exactly as they did before —
-- there is no scale-mixing hazard here precisely because the conversion
-- happens once, at the very end, after the blend.
-- ----------------------------------------------------------------------------
create or replace function public.blended_trend(p_org_id uuid, p_is_demo boolean)
returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (
    select extract(year from s.created_at)::int as yr, rsp.question_domain as dom, rsp.tier,
           avg(rsp.normalized) as m, count(*) as n
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = p_is_demo
      and (p_org_id is null or o.id = p_org_id)
    group by 1, 2, 3
  ),
  archived as (
    select year as yr, question_domain as dom, tier, mean as m, n
    from retained_aggregates
    where is_demo = p_is_demo
      and (p_org_id is null or org_id = p_org_id)
  ),
  combined as (
    select yr, dom, tier, m, n from live
    union all
    select yr, dom, tier, m, n from archived
  ),
  yearly_tier as (
    select yr, tier, sum(m * n) / nullif(sum(n), 0) as tm
    from combined group by yr, tier
  )
  select coalesce(jsonb_agg(jsonb_build_object('year', yr, 'index', ngjfi_to_5(idx)) order by yr), '[]'::jsonb)
  from (select yr, avg(tm) as idx from yearly_tier group by yr) y;
$$;


-- ─── 0030_platform_totals_seasons_consulting.sql ───────────────────────

-- ============================================================================
-- The Jesus Index — platform totals, org dashboard season picker, and the
-- consulting-question feature (migration 0030)
--
-- Three independent, additive pieces for this PR. Nothing here touches an
-- existing function's signature or behaviour — org_dashboard(),
-- collab_intelligence() and every other 0029 body are untouched.
--
--   1. platform_totals()        — ungated public counter for the homepage.
--   2. org_seasons() /
--      org_dashboard_season()   — a full season picker for the org dashboard.
--   3. consulting_questions +
--      submit_consulting_question() /
--      list_consulting_questions() — "what do we do with this?" repository.
-- ============================================================================


-- ============================================================================
-- 1. platform_totals() — ungated public counter for the homepage.
--
-- A bare count of live organisations-with-at-least-one-response and live
-- responses. Deliberately NOT gated behind the critical-mass check that
-- guards every SCORE on the platform (collab_intelligence(), org_benchmark()):
-- CLAUDE.md non-negotiable #1 is "never overclaim" about a BENCHMARK — a raw
-- headcount carries no score, no tier, no domain and no geography breakdown,
-- so it is not the thing that gate protects. Mirrors the existing is_demo
-- split pattern (0009): explicit `o.is_demo = false`, enforced inside the
-- SECURITY DEFINER body, not left to the caller.
--
-- "responses" counts distinct completed-response SESSIONS, matching this
-- repo's existing vocabulary for that word everywhere a totals object is
-- returned (collab_intelligence()'s totals.responses, admin_org_detail()'s
-- responses) — never a raw response-row count, which would silently read as
-- a much bigger, more confusing number than "how many people took the Index".
--
-- Returns: jsonb { "orgs": int, "responses": int }
-- ----------------------------------------------------------------------------
create or replace function public.platform_totals()
returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (
    select s.id as sid, c.org_id
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false
  )
  select jsonb_build_object(
    'orgs',      (select count(distinct org_id) from r),
    'responses', (select count(distinct sid) from r)
  );
$$;

comment on function public.platform_totals() is
  'Ungated public counter for the marketing homepage: live org count + live response count only. No score, no benchmark, so it is exempt from the critical-mass gate that guards collab_intelligence()/org_benchmark() — see CLAUDE.md non-negotiable #1.';

grant execute on function public.platform_totals() to anon, authenticated;


-- ============================================================================
-- 2. Season picker — org_seasons() + org_dashboard_season()
--
-- The season boundary is VERSIONED CONFIG (CLAUDE.md "never hardcode"), not a
-- June-1 constant baked into function logic. Reuses the existing generic
-- key-value config table, platform_settings (introduced in 0009 for exactly
-- this purpose — the critical-mass gate is already stored the same way), so
-- no new config table is created. One new row:
--   ('season_boundary', '{"month": 6, "day": 1}')
-- Editable by an administrator without a deploy, the same as every other
-- platform_settings row.
--
-- A "season" is a rolling window starting on (season_boundary.month,
-- season_boundary.day) of some year Y and ending the day before the same
-- date in year Y+1 — e.g. with the default boundary, season 2025 runs
-- 2025-06-01 .. 2026-05-31 and is labelled "2025–2026". Which years exist is
-- never hardcoded: org_seasons() derives them from the org's own response
-- timestamps.
--
-- Both functions use sessions.created_at as the respondent-completion
-- timestamp for bucketing — the same column blended_trend() (0029) already
-- reads for its own year-based bucketing, and the column org_dashboard()'s
-- own `r` CTE already selects (s.created_at) for exactly this kind of use.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2a. season_boundary config row. `on conflict do nothing` so re-running this
-- migration (or a fresh bootstrap that already seeded it) is a no-op.
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('season_boundary', '{"month": 6, "day": 1}'::jsonb,
   'Month/day a "season" starts on for the org dashboard season picker (default: Jun 1, so a season reads like a school year, e.g. 2025-06-01..2026-05-31 = "2025-2026"). Data, not a hardcoded constant in org_seasons()/org_dashboard_season() — move it without a deploy.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2b. org_seasons(p_org_slug) — every season the org has at least one live
-- response in, most recent first, plus a leading "All time" pseudo-entry.
-- Same authorisation contract as org_dashboard()/org_distribution_links():
-- an active member of the org only.
--
-- Returns: jsonb array of
--   { "label": text, "start": date|null, "end": date|null, "n": int }
-- ----------------------------------------------------------------------------
create or replace function public.org_seasons(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_boundary jsonb;
  v_month int;
  v_day int;
  v_total bigint;
  v_seasons jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_boundary := coalesce((select value from platform_settings where key = 'season_boundary'), '{"month":6,"day":1}'::jsonb);
  v_month := coalesce((v_boundary->>'month')::int, 6);
  v_day   := coalesce((v_boundary->>'day')::int, 1);

  with r as (
    select distinct s.id as sid, s.created_at
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  ),
  bucketed as (
    select sid,
           -- Which season-year a session's completion timestamp falls in:
           -- on/after this year's boundary date -> this year; before it ->
           -- the previous year's season (which started the prior boundary
           -- date and is still running).
           case when ROW(extract(month from created_at)::int, extract(day from created_at)::int)
                     >= ROW(v_month, v_day)
                then extract(year from created_at)::int
                else extract(year from created_at)::int - 1
           end as season_year
    from r
  ),
  per_season as (
    select season_year, count(*) as n
    from bucketed
    group by season_year
  )
  select jsonb_agg(
           jsonb_build_object(
             'label', season_year::text || '–' || (season_year + 1)::text,
             'start', make_date(season_year, v_month, v_day),
             'end',   make_date(season_year + 1, v_month, v_day) - 1,
             'n', n
           ) order by season_year desc
         )
    into v_seasons
    from per_season;

  select count(*) into v_total from r;

  return jsonb_build_array(
           jsonb_build_object('label', 'All time', 'start', null, 'end', null, 'n', v_total)
         ) || coalesce(v_seasons, '[]'::jsonb);
end;
$$;

comment on function public.org_seasons(text) is
  'Every season (rolling window from platform_settings.season_boundary) the org has at least one live response in, most recent first, prefixed with an "All time" pseudo-entry. Drives the org dashboard season-picker dropdown.';

grant execute on function public.org_seasons(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2c. org_dashboard_season(p_org_slug, p_season_start, p_season_end) — same
-- output shape/contract as org_dashboard() (0029), with an optional date
-- range applied on sessions.created_at. When both bounds are null this is
-- behaviourally identical to org_dashboard() (the "All time" case), so the
-- frontend can call this one function for every entry in org_seasons().
--
-- Structurally a straight copy of org_dashboard()'s body (0029) with one
-- addition: `v_season_filter` (a boolean built once from the two params) is
-- ANDed into each of the four response-selecting CTEs. blended_trend() and
-- insight_aggregates() are left calling with the org's full history, exactly
-- as org_dashboard() does — those are their own already-time-aware views
-- (the year-by-year trend, and the insight thresholds), not the season-cut
-- headline this function adds.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_season(
  p_org_slug text,
  p_season_start date default null,
  p_season_end date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb; result2 jsonb;
  v_n bigint; v_explore_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select count(distinct sid) into v_n from r;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select count(distinct sid) into v_explore_n from re;

  if v_n < v_min_group_n and v_explore_n < v_min_group_n then
    return jsonb_build_object(
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'season', jsonb_build_object('start', p_season_start, 'end', p_season_end),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'scale', 5,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb,
      'exploration_n', v_explore_n, 'exploration_suppressed', true,
      'exploration_index', null, 'exploration_tiers', '{}'::jsonb,
      'exploration_domains', '{}'::jsonb, 'exploration_matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'season', jsonb_build_object('start', p_season_start, 'end', p_season_end),
    'n', v_n,
    'suppressed', v_n < v_min_group_n,
    'scale', 5,
    'tiers',   case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t) end,
    'domains', case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d) end,
    'matrix',  case when v_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y) end,
    'items',   case when v_n < v_min_group_n then '[]'::jsonb else
               (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, ngjfi_to_5(avg(normalized)) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z) end,
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  if v_n >= v_min_group_n then
    result := result || jsonb_build_object('index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('index', null);
  end if;

  with re as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
      and rsp.branch = 'unengaged'
      and (p_season_start is null or s.created_at::date >= p_season_start)
      and (p_season_end   is null or s.created_at::date <= p_season_end)
  )
  select jsonb_build_object(
    'exploration_n', v_explore_n,
    'exploration_suppressed', v_explore_n < v_min_group_n,
    'exploration_tiers',   case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from re group by tier) t) end,
    'exploration_domains', case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from re group by question_domain) d) end,
    'exploration_matrix',  case when v_explore_n < v_min_group_n then '{}'::jsonb else
               (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from re group by question_domain, tier) x
                  group by question_domain) y) end
  ) into result2;

  result := result || result2;

  if v_explore_n >= v_min_group_n then
    result := result || jsonb_build_object('exploration_index',
      (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'exploration_tiers','{}'::jsonb))
         where key in ('exposure','response','formation','multiplication')));
  else
    result := result || jsonb_build_object('exploration_index', null);
  end if;

  return result;
end;
$$;

comment on function public.org_dashboard_season(text, date, date) is
  'Same contract as org_dashboard(), with an optional [p_season_start, p_season_end] filter on sessions.created_at. Both null = identical to org_dashboard() (the "All time" case) — the frontend can call this one function for every org_seasons() entry.';

grant execute on function public.org_dashboard_season(text, date, date) to authenticated;


-- ============================================================================
-- 3. Consulting-question feature — "what do we do with this?"
--
-- A free-text question an org submits from its dashboard, landing in a
-- repository the Collab/admin can review. Aggregate-adjacent staff tooling,
-- not a score — no individual response is exposed either way, but this is
-- still org-identified free text, so writes require an authenticated,
-- active org member (mirrors upsert_distribution_link(), 0028) and the
-- review list requires staff tier (mirrors admin_org_detail(), 0028).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 3a. consulting_questions. No direct client SELECT/INSERT policies — every
-- read and write goes through the SECURITY DEFINER RPCs below, matching this
-- repo's existing convention for every org- or respondent-scoped table
-- (distribution_links, sessions, responses, scores).
-- ----------------------------------------------------------------------------
create table if not exists public.consulting_questions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  prompt     text not null,
  created_at timestamptz not null default now()
);

alter table public.consulting_questions enable row level security;

revoke all on public.consulting_questions from anon, authenticated;

create index if not exists idx_consulting_questions_org on public.consulting_questions(org_id);

-- ----------------------------------------------------------------------------
-- 3b. submit_consulting_question(p_org_slug, p_prompt) — an authenticated,
-- active org member asks "what do we do with this?" from their own
-- dashboard. Same org-slug lookup + org_members authorisation check as
-- upsert_distribution_link() (0028). Anonymous respondents can never call
-- this (it is not part of the respondent survey path, and is granted to
-- `authenticated` only, not `anon`).
-- ----------------------------------------------------------------------------
create or replace function public.submit_consulting_question(p_org_slug text, p_prompt text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org public.organisations%rowtype; v_id uuid; v_prompt text;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_prompt := trim(p_prompt);
  if v_prompt is null or length(v_prompt) = 0 then
    raise exception 'a question is required';
  end if;
  if length(v_prompt) > 4000 then
    raise exception 'question is too long';
  end if;

  insert into consulting_questions (org_id, prompt)
  values (v_org.id, v_prompt)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.submit_consulting_question(text, text) is
  'Org dashboard "what do we do with this?" submission. Inserts one consulting_questions row for the calling user''s own org. Requires an authenticated, active org member — see org_members check.';

grant execute on function public.submit_consulting_question(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3c. list_consulting_questions() — the Collab/admin-facing repository view.
-- Staff tooling, not an org-scoped endpoint: gated with the same my_role()
-- check admin_org_detail() (0028) uses for its own staff-only surface, not
-- the org_members check above. Granted to `authenticated` only (matching
-- every other my_role()-gated RPC in this schema) — the my_role() check
-- inside the body is the actual admission control; the admin console's own
-- existing role-check pattern (redirecting a non-admin/collab session away
-- from /build) should additionally apply on the frontend, same as it does
-- for admin_org_detail() and admin_worklist().
-- ----------------------------------------------------------------------------
create or replace function public.list_consulting_questions()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'the consulting question repository is for administrators and the Collab';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'org', jsonb_build_object('slug', o.slug, 'short_name', o.short_name, 'name', o.name),
      'prompt', q.prompt,
      'created_at', q.created_at
    ) order by q.created_at desc)
    from consulting_questions q
    join organisations o on o.id = q.org_id
  ), '[]'::jsonb);
end;
$$;

comment on function public.list_consulting_questions() is
  'Staff-facing consulting-question repository: every question, with org name and date asked, newest first. Administrator/Collab tier only (my_role()) — mirrors admin_org_detail() (0028).';

grant execute on function public.list_consulting_questions() to authenticated;


-- ─── 0031_my_context_add_slug.sql ──────────────────────────────────────

-- ============================================================================
-- my_context() — add `slug` to each org entry (migration 0031)
--
-- my_context() (0014) already returns each org the signed-in user belongs to
-- as { short_name, name, is_demo } — enough for the internal /build console,
-- which routes by short_name. The new public "Your Organization" tab
-- (src/app/organization/page.tsx) needs to send a signed-in org member
-- straight to their own dashboard at /[slug]/dashboard, and org_dashboard()
-- takes the URL slug, not the short_name (organisations.slug vs
-- organisations.short_name are two separate columns — see 0001 and 0010).
-- Rather than add a second round trip, this re-declares my_context() with one
-- additional key per org. Everything else about the function — its signature,
-- its grants, the rest of its shape — is unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.my_context()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('signed_in', false); end if;

  return jsonb_build_object(
    'signed_in', true,
    'email',     (select email from app_users where id = v_uid),
    'role',      my_role(),
    'orgs',      coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', o.slug, 'short_name', o.short_name, 'name', o.name, 'is_demo', o.is_demo)
             order by o.name)
        from org_members m join organisations o on o.id = m.org_id
       where m.user_id = v_uid and m.status = 'active'), '[]'::jsonb),
    'networks',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', n.short_name, 'name', n.name, 'kind', n.kind)
             order by n.name)
        from network_members_users u join networks n on n.id = u.network_id
       where u.user_id = v_uid and u.status = 'active'), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.my_context() to anon, authenticated;


-- ─── 0032_collab_overview.sql ──────────────────────────────────────────

-- ============================================================================
-- collab_overview() — the figures behind the Collab console's four tiles
-- (migration 0032)
--
-- The Collab console moved from five stacked bands to the same tile layout
-- the Administrator console uses: Organisations · Surveys sent out · Collab
-- Intelligence · Development. collab_worklist() (0022) only returns the gate,
-- the waves and the coverage worklist, so two tiles had nothing to read:
--
--   organisations  every LIVE organisation taking part — name, country,
--                  activation status, whether it is fielding right now.
--                  A roster, not a reading: no score, no response count per
--                  organisation, so nothing here is a per-member figure that
--                  network/member consent (0013) would need to govern.
--   surveys        started sessions, completed sessions, and the same two
--                  counts per survey language (sessions.locale). Counts only.
--                  A session is one anonymous respondent's pass through the
--                  survey — "unique respondents" in the UI means exactly
--                  this, never a person-level identity (none is held).
--   development    the active instrument version and the three platform
--                  settings that change the meaning of every number: the
--                  org/region gate, the country gate, and the global-view
--                  publish switch. Read-only here; editing stays with the
--                  administrator and the researchers.
--
-- Live space only (o.is_demo = false), enforced inside the SECURITY DEFINER
-- body, never left to the caller — same pattern as platform_totals() (0030).
-- Gates are read from platform_settings via setting_int()/setting_bool(), so
-- they stay versioned config (CLAUDE.md non-negotiable #3).
--
-- Additive: no table changes, no existing function redefined.
-- ----------------------------------------------------------------------------
create or replace function public.collab_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  with live_sessions as (
    select s.id, coalesce(s.locale, 'en') as locale, s.completed
      from sessions s
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
     where o.is_demo = false
  )
  select jsonb_build_object(
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', o.short_name,
               'name',       o.name,
               'country',    o.country,
               'status',     o.status,
               'fielding',   exists (select 1 from campaigns c where c.org_id = o.id and c.active))
             order by o.name)
        from organisations o
       where o.is_demo = false), '[]'::jsonb),

    'surveys', jsonb_build_object(
      'started',   (select count(*) from live_sessions),
      'completed', (select count(*) from live_sessions where completed),
      'languages', coalesce((
        select jsonb_agg(jsonb_build_object('locale', l.locale, 'started', l.started, 'completed', l.completed)
                         order by l.started desc, l.locale)
          from (
            select locale, count(*) as started, count(*) filter (where completed) as completed
              from live_sessions
             group by locale
          ) l), '[]'::jsonb)
    ),

    'development', jsonb_build_object(
      'instrument', (
        select jsonb_build_object(
                 'version', iv.version,
                 'status',  iv.status,
                 'items',   (select count(*) from items i where i.instrument_version_id = iv.id))
          from instrument_versions iv
         where iv.status = 'active'
         limit 1),
      'gate',                  setting_int('critical_mass_gate', 400),
      'country_gate',          setting_int('country_critical_mass_gate', 2000),
      'global_view_published', setting_bool('publish_global_view', false)
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.collab_overview() is
  'Collab/admin console tiles: live organisation roster, session start/completion counts (total and per locale), and the read-only instrument + gate settings. Counts and config only — no scores, no per-organisation readings.';

revoke all on function public.collab_overview() from public, anon;
grant execute on function public.collab_overview() to authenticated;


-- ─── 0033_rooms_scoring_and_consulting_requests.sql ────────────────────

-- ============================================================================
-- The Jesus Index — signed-in two-dashboard view (migration 0033)
--
-- Backs the locked "two tabs" design (an org's own dashboard + Collab
-- Intelligence, identical in shape; see the Organisation console preview):
--
--   1. room_min_n            — a per-room minimum-n, as versioned config.
--   2. org_link_dashboard()  — a room's own J12 (matrix / tiers / index).
--   3. org_reach_countries() — which countries an org's links reached, for
--                              the heat map outline. Countries only, gated.
--   4. consulting_questions  — gains context / status / assignee / requester,
--                              so "What does this mean?" requests can be
--                              worked from the Collab console's new tile E.
--   5. submit_consulting_question() — takes the view snapshot (p_context).
--   6. list_consulting_questions()  — returns the new fields.
--   7. update_consulting_question() — Collab/admin move a request along.
--
-- Nothing here exposes an individual response. Every read is an aggregate
-- behind a minimum-n; the consulting context is a description of the
-- aggregate VIEW the asker was looking at, never data about a respondent.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. room_min_n. 0028 shipped rooms with counts only, because the per-room
-- privacy floor was an open research question. This sets a working value —
-- 10, the same floor an organisation's own score already holds to
-- (min_group_n) — as a platform_settings row, so researchers can raise it
-- without a deploy. PROPOSED, NOT RESEARCHER-SIGNED-OFF: see the PR notes.
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('room_min_n', '10'::jsonb,
   'Minimum completions before a distribution link ("room") shows any score. Working value = min_group_n; proposed Sept 2026, pending researcher sign-off. Below it a room shows its count only.')
on conflict (key) do nothing;


-- ----------------------------------------------------------------------------
-- 2. org_link_dashboard(p_org_slug, p_link_id) — one room's J12.
--
-- Same authorisation contract as org_dashboard_season(): an active member of
-- the org only. The link must belong to that org. Deliberately returns NO
-- benchmark, NO per-item table and NO insights: "compare to the Collab" is
-- house-level only (CLAUDE.md), and a room is small enough that per-item
-- rows would be the first thing to become identifying.
-- ----------------------------------------------------------------------------
create or replace function public.org_link_dashboard(p_org_slug text, p_link_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_link public.distribution_links%rowtype;
  v_min int;
  v_n bigint;
  result jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  select * into v_link from distribution_links where id = p_link_id and org_id = v_org.id;
  if not found then raise exception 'link not found'; end if;

  v_min := setting_int('room_min_n', setting_int('min_group_n', 10));

  select count(distinct s.id) into v_n
    from sessions s
    join responses rsp on rsp.session_id = s.id
   where s.distribution_link_id = v_link.id
     and rsp.normalized is not null
     and (rsp.branch is distinct from 'unengaged');

  if v_n < v_min then
    return jsonb_build_object(
      'link', jsonb_build_object('id', v_link.id, 'name', v_link.name, 'slug', v_link.slug),
      'n', v_n, 'suppressed', true, 'min_n', v_min, 'scale', 5,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized
    from responses rsp
    join sessions s on s.id = rsp.session_id
    where s.distribution_link_id = v_link.id
      and rsp.normalized is not null
      and (rsp.branch is distinct from 'unengaged')
  )
  select jsonb_build_object(
    'link', jsonb_build_object('id', v_link.id, 'name', v_link.name, 'slug', v_link.slug),
    'n', v_n, 'suppressed', false, 'min_n', v_min, 'scale', 5,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, ngjfi_to_5(avg(normalized)) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, ngjfi_to_5(avg(normalized)) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, ngjfi_to_5(avg(normalized)) m from r group by question_domain, tier) x
                  group by question_domain) y)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric), 1) from jsonb_each_text(coalesce(result->'tiers', '{}'::jsonb))
      where key in ('exposure', 'response', 'formation', 'multiplication')));

  return result;
end;
$$;

comment on function public.org_link_dashboard(text, uuid) is
  'One distribution link''s ("room''s") J12: n, tiers, domains, matrix, index. Active org members only; suppressed below room_min_n. Never returns a benchmark — Collab comparison is house-level only.';

grant execute on function public.org_link_dashboard(text, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. org_reach_countries(p_org_slug) — the countries an org's respondents
-- reported, for outlining on the heat map ("your links reached here").
-- Country names only — no counts, no cities, no scores — and only countries
-- where this org has at least min_group_n completions, so a single young
-- person in an unusual country is never singled out by an outline.
-- ----------------------------------------------------------------------------
create or replace function public.org_reach_countries(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; v_min int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_min := setting_int('min_group_n', 10);

  return coalesce((
    select jsonb_agg(country order by country) from (
      select s.country
        from sessions s
        join campaigns c on c.id = s.campaign_id
       where c.org_id = v_org.id and s.completed and s.country is not null
       group by s.country
      having count(*) >= v_min
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.org_reach_countries(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. consulting_questions gains what the Collab needs to work a request.
--    context      — the aggregate view the asker was on (see 5). Never
--                   respondent data.
--    status       — new → assigned → answered.
--    assigned_to  — free text: the facilitator taking it (an adult staff
--                   member, named by the Collab).
--    requested_by — the signed-in org member who asked, so a facilitator can
--                   reply. Adult staff, not a respondent. The email is read
--                   from app_users at list time, never copied into this row.
-- ----------------------------------------------------------------------------
alter table public.consulting_questions
  add column if not exists context      jsonb not null default '{}'::jsonb,
  add column if not exists status       text  not null default 'new',
  add column if not exists assigned_to  text,
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at   timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'consulting_questions_status_check') then
    alter table public.consulting_questions
      add constraint consulting_questions_status_check check (status in ('new', 'assigned', 'answered'));
  end if;
end $$;

create index if not exists idx_consulting_questions_status on public.consulting_questions(status, created_at desc);


-- ----------------------------------------------------------------------------
-- 5. submit_consulting_question(): one new optional trailing param,
-- p_context. Explicit drop of the 2-arg version first — a changed signature
-- without one leaves a silent second overload (the 0027 bug).
--
-- The context is whitelisted, not trusted: only these keys survive, each
-- coerced to short text, so a client cannot smuggle anything else (let alone
-- respondent rows) into the Collab's queue.
-- ----------------------------------------------------------------------------
drop function if exists public.submit_consulting_question(text, text);

create or replace function public.submit_consulting_question(
  p_org_slug text,
  p_prompt   text,
  p_context  jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_prompt text := trim(coalesce(p_prompt, ''));
  v_ctx jsonb := '{}'::jsonb;
  v_key text;
  v_id uuid;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  if length(v_prompt) = 0 then raise exception 'question is required'; end if;
  if length(v_prompt) > 4000 then raise exception 'question is too long'; end if;

  if p_context is not null and jsonb_typeof(p_context) = 'object' then
    foreach v_key in array array['tab', 'scope', 'room', 'view', 'tier', 'overlay', 'summary'] loop
      if p_context ? v_key and jsonb_typeof(p_context->v_key) in ('string', 'boolean', 'number') then
        v_ctx := v_ctx || jsonb_build_object(v_key, left(p_context->>v_key, 200));
      end if;
    end loop;
  end if;

  insert into consulting_questions (org_id, prompt, context, requested_by)
  values (v_org.id, v_prompt, v_ctx, v_uid)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.submit_consulting_question(text, text, jsonb) is
  '"What does this mean?" — an active org member sends a question plus a whitelisted description of the aggregate view they were on (tab, scope, room, view, tier, overlay, summary). Never carries respondent data.';

grant execute on function public.submit_consulting_question(text, text, jsonb) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. list_consulting_questions() — the Collab console's tile E. Same
-- Collab/admin-only guard as 0030; now returns status, assignee, context and
-- the asker's email (so a facilitator can reply). New requests first.
-- ----------------------------------------------------------------------------
create or replace function public.list_consulting_questions()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'the consulting question repository is for administrators and the Collab';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'org', jsonb_build_object('slug', o.slug, 'short_name', o.short_name, 'name', o.name),
      'prompt', q.prompt,
      'context', q.context,
      'status', q.status,
      'assigned_to', q.assigned_to,
      'requested_by', (select u.email from app_users u where u.id = q.requested_by),
      'created_at', q.created_at,
      'updated_at', q.updated_at
    ) order by (q.status = 'new') desc, q.created_at desc)
    from consulting_questions q
    join organisations o on o.id = q.org_id
    where o.is_demo = false
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_consulting_questions() to authenticated;


-- ----------------------------------------------------------------------------
-- 7. update_consulting_question() — Collab/admin move a request along.
-- Assigning someone moves a new request to 'assigned' unless a status is
-- given explicitly.
-- ----------------------------------------------------------------------------
create or replace function public.update_consulting_question(
  p_id uuid,
  p_status text default null,
  p_assigned_to text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.consulting_questions%rowtype;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'only administrators and the Collab can update consulting requests';
  end if;
  if p_status is not null and p_status not in ('new', 'assigned', 'answered') then
    raise exception 'status must be new, assigned or answered';
  end if;

  update consulting_questions q
     set assigned_to = coalesce(nullif(trim(p_assigned_to), ''), q.assigned_to),
         status = coalesce(p_status,
                           case when nullif(trim(p_assigned_to), '') is not null and q.status = 'new'
                                then 'assigned' else q.status end),
         updated_at = now()
   where q.id = p_id
  returning * into v_row;

  if not found then raise exception 'request not found'; end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'assigned_to', v_row.assigned_to);
end;
$$;

grant execute on function public.update_consulting_question(uuid, text, text) to authenticated;


-- ─── 0034_onboarding.sql ───────────────────────────────────────────────

-- ============================================================================
-- The Jesus Index — onboarding (migration 0034)
--
-- Until now there was no way for an organisation to come into existence or
-- for a person to be attached to one, except the email-domain claim on an
-- organisation that already existed. "Approve" on an access request only
-- flipped a flag, and "Join the JFINDX" applications landed in a table no
-- screen read. This migration adds the missing path, end to end:
--
--   1. organisations.status gains 'pending'   (set up, not yet collecting)
--   2. a trigger refuses new sessions for a pending organisation
--   3. org_invites                             (email → organisation)
--   4. claim_my_invites()                      (attach on verified sign-in)
--   5. admin_applications()                    (Join + access requests, one list)
--   6. admin_create_org()                      (org + survey + invite, one action)
--   7. admin_update_org() / admin_org_members() / admin_add_member() /
--      admin_remove_member() / admin_decline_application()
--   8. set_org_status() accepts 'pending'
--   9. self-serve: my_onboarding(), self_serve_create_org()
--
-- Everything here is about ADULT STAFF of organisations (names, work email
-- addresses, roles). Nothing touches respondents, sessions' content or
-- responses. Every admin_* function checks my_role() = 'admin' first; the
-- self-serve functions act only on the caller's own verified email.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. 'pending': an organisation that exists and can be set up (links,
-- branding, team) but cannot collect a single response until an
-- administrator activates it. This is how self-serve stays "deliberate
-- rather than automatic" — the ministry does the work, a person approves.
-- ----------------------------------------------------------------------------
alter table public.organisations drop constraint if exists organisations_status_check;
alter table public.organisations
  add constraint organisations_status_check check (status in ('pending', 'active', 'paused', 'closed'));


-- ----------------------------------------------------------------------------
-- 2. Belt and braces: whatever path creates a session, a pending
-- organisation cannot receive one. A trigger, so start_session() (0028)
-- does not have to be rewritten — and so a future overload cannot forget it.
-- ----------------------------------------------------------------------------
create or replace function public.refuse_sessions_for_pending_orgs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from campaigns c join organisations o on o.id = c.org_id
     where c.id = new.campaign_id and o.status = 'pending'
  ) then
    raise exception 'this organisation is still being set up and is not collecting responses yet';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_refuse_pending_orgs on public.sessions;
create trigger sessions_refuse_pending_orgs
  before insert on public.sessions
  for each row execute function public.refuse_sessions_for_pending_orgs();


-- ----------------------------------------------------------------------------
-- 3. Invitations. An email address is invited to an organisation; the first
-- time that address signs in (a magic link proves they own it), the
-- invitation turns into a membership. Works for people who have never
-- signed in before — which is exactly a new ministry.
-- ----------------------------------------------------------------------------
create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  email       citext not null,
  role        text not null default 'org_admin',
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);

alter table public.org_invites enable row level security;
-- No policies on purpose: read and written only through the functions below.

create index if not exists idx_org_invites_email on public.org_invites(email) where accepted_at is null;


-- Internal helper: invite an email to an org, and attach at once if the
-- account already exists. Not granted to anyone; called by the functions below.
create or replace function public._invite_member(p_org_id uuid, p_email text, p_role text, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(p_email)); v_uid uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not an email address'; end if;
  if p_role not in ('org_admin', 'facilitator') then raise exception 'role must be org_admin or facilitator'; end if;

  insert into org_invites (org_id, email, role, invited_by)
  values (p_org_id, v_email, p_role, p_by)
  on conflict (org_id, email) do update set role = excluded.role;

  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is not null then
    insert into app_users (id, email) values (v_uid, v_email) on conflict (id) do nothing;
    insert into org_members (org_id, user_id, role) values (p_org_id, v_uid, p_role)
    on conflict (org_id, user_id) do update set role = excluded.role, status = 'active';
    update org_invites set accepted_at = coalesce(accepted_at, now()) where org_id = p_org_id and email = v_email;
    return jsonb_build_object('email', v_email, 'attached', true);
  end if;
  return jsonb_build_object('email', v_email, 'attached', false);
end;
$$;

revoke all on function public._invite_member(uuid, text, text, uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. claim_my_invites() — called by the console on every signed-in load.
-- Attaches the caller to every organisation their (verified) email was
-- invited to. Uses the email on auth.users, never a client-supplied one.
-- ----------------------------------------------------------------------------
create or replace function public.claim_my_invites()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_n int := 0; r record;
begin
  if v_uid is null then return jsonb_build_object('attached', 0); end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then return jsonb_build_object('attached', 0); end if;

  insert into app_users (id, email) values (v_uid, v_email) on conflict (id) do nothing;

  for r in select i.id, i.org_id, i.role from org_invites i where i.email = v_email and i.accepted_at is null loop
    insert into org_members (org_id, user_id, role) values (r.org_id, v_uid, r.role)
    on conflict (org_id, user_id) do update set status = 'active';
    update org_invites set accepted_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('attached', v_n);
end;
$$;

grant execute on function public.claim_my_invites() to authenticated;


-- ----------------------------------------------------------------------------
-- 5. admin_applications() — everything waiting on an administrator, in one
-- list: "Join the JFINDX" applications that have not become an organisation,
-- and access requests still undecided. Also every pending (self-serve)
-- organisation awaiting activation.
-- ----------------------------------------------------------------------------
create or replace function public.admin_applications()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can see applications'; end if;

  return jsonb_build_object(
    'join', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'email', w.email, 'org_name', w.org_name, 'role', w.role,
        'country', w.primary_country, 'countries', w.countries, 'reach_band', w.reach_band,
        'languages', w.languages, 'decision_it_changes', w.decision_it_changes,
        'wants_setup_call', w.wants_setup_call, 'is_collab_member', w.is_collab_member,
        'status', w.status, 'created_at', w.created_at
      ) order by w.created_at desc)
      from waitlist_contacts w
      where w.status not in ('onboarded', 'declined', 'bounced')
    ), '[]'::jsonb),
    'access', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'email', a.email, 'reason', a.reason, 'created_at', a.created_at
      ) order by a.created_at desc)
      from access_requests a where a.status = 'requested'
    ), '[]'::jsonb),
    'pending_orgs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'short_name', o.short_name, 'name', o.name, 'website_domain', o.website_domain,
        'country', o.country, 'created_at', o.created_at,
        'members', (select jsonb_agg(u.email) from org_members m join app_users u on u.id = m.user_id where m.org_id = o.id)
      ) order by o.created_at desc)
      from organisations o where o.status = 'pending' and o.is_demo = false
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_applications() to authenticated;


-- ----------------------------------------------------------------------------
-- 6. admin_create_org() — one action turns an application into a working
-- organisation: the organisation row, an active survey on the current
-- instrument, and an invitation for the owner's email (attached at once if
-- they already have an account). Optionally closes the Join application or
-- access request it came from.
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_org(
  p_name           text,
  p_short_name     text,
  p_owner_email    text,
  p_website_domain text default null,
  p_country        text default null,
  p_status         text default 'active',
  p_waitlist_id    uuid default null,
  p_access_id      uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_short text := lower(btrim(p_short_name));
  v_org uuid;
  v_inst uuid;
  v_invite jsonb;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can create an organisation'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'a name is required'; end if;
  if v_short !~ '^[a-z][a-z0-9-]{1,31}$' then
    raise exception 'short name must be 2–32 characters: lowercase letters, digits and hyphens, starting with a letter';
  end if;
  if exists (select 1 from organisations where short_name = v_short or slug = v_short) then
    raise exception 'the short name % is already taken', v_short;
  end if;
  if p_status not in ('pending', 'active') then raise exception 'a new organisation starts pending or active'; end if;

  select id into v_inst from instrument_versions where status in ('active', 'published') order by created_at desc limit 1;
  if v_inst is null then raise exception 'no active instrument version to attach a survey to'; end if;

  insert into organisations (name, slug, short_name, website_domain, country, status)
  values (btrim(p_name), v_short, v_short, nullif(lower(btrim(p_website_domain)), ''), nullif(btrim(p_country), ''), p_status)
  returning id into v_org;

  insert into campaigns (org_id, instrument_version_id) values (v_org, v_inst);

  v_invite := _invite_member(v_org, p_owner_email, 'org_admin', auth.uid());

  if p_waitlist_id is not null then
    update waitlist_contacts set status = 'onboarded', updated_at = now() where id = p_waitlist_id;
  end if;
  if p_access_id is not null then
    update access_requests set status = 'approved', decided_at = now() where id = p_access_id and status = 'requested';
  end if;

  return jsonb_build_object('short_name', v_short, 'owner', v_invite);
end;
$$;

grant execute on function public.admin_create_org(text, text, text, text, text, text, uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Managing an organisation that exists.
-- ----------------------------------------------------------------------------

-- Edit details. Whitelisted fields only; short_name is deliberately NOT
-- editable here (it is printed on QR codes and posters — see 0010).
create or replace function public.admin_update_org(p_short_name text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can edit an organisation'; end if;
  select id into v_id from organisations where short_name = lower(btrim(p_short_name));
  if v_id is null then raise exception 'no organisation with short name %', p_short_name; end if;
  if p_patch ? 'brand_color' and coalesce(p_patch->>'brand_color', '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'brand colour must look like #1f5f8b';
  end if;
  if p_patch ? 'membership_tier' and p_patch->>'membership_tier' not in ('collab_member', 'external') then
    raise exception 'membership tier must be collab_member or external';
  end if;

  update organisations o set
    name            = coalesce(nullif(btrim(p_patch->>'name'), ''), o.name),
    website_domain  = case when p_patch ? 'website_domain' then nullif(lower(btrim(p_patch->>'website_domain')), '') else o.website_domain end,
    country         = case when p_patch ? 'country' then nullif(btrim(p_patch->>'country'), '') else o.country end,
    region          = case when p_patch ? 'region' then nullif(btrim(p_patch->>'region'), '') else o.region end,
    brand_color     = coalesce(p_patch->>'brand_color', o.brand_color),
    logo_url        = case when p_patch ? 'logo_url' then nullif(btrim(p_patch->>'logo_url'), '') else o.logo_url end,
    welcome_message = case when p_patch ? 'welcome_message' then nullif(btrim(p_patch->>'welcome_message'), '') else o.welcome_message end,
    closing_message = case when p_patch ? 'closing_message' then nullif(btrim(p_patch->>'closing_message'), '') else o.closing_message end,
    membership_tier = coalesce(p_patch->>'membership_tier', o.membership_tier)
  where o.id = v_id;

  return jsonb_build_object('short_name', lower(btrim(p_short_name)));
end;
$$;

grant execute on function public.admin_update_org(text, jsonb) to authenticated;


create or replace function public.admin_org_members(p_short_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can see an organisation''s team'; end if;
  select id into v_id from organisations where short_name = lower(btrim(p_short_name));
  if v_id is null then raise exception 'no organisation with short name %', p_short_name; end if;

  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role, 'status', m.status, 'since', m.created_at) order by m.created_at)
      from org_members m join app_users u on u.id = m.user_id where m.org_id = v_id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'created_at', i.created_at) order by i.created_at)
      from org_invites i where i.org_id = v_id and i.accepted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_org_members(text) to authenticated;


create or replace function public.admin_add_member(p_short_name text, p_email text, p_role text default 'org_admin')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can add someone to an organisation'; end if;
  select id into v_id from organisations where short_name = lower(btrim(p_short_name));
  if v_id is null then raise exception 'no organisation with short name %', p_short_name; end if;
  return _invite_member(v_id, p_email, p_role, auth.uid());
end;
$$;

grant execute on function public.admin_add_member(text, text, text) to authenticated;


create or replace function public.admin_remove_member(p_short_name text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(btrim(p_email)); v_m int; v_i int;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can remove someone from an organisation'; end if;
  select id into v_id from organisations where short_name = lower(btrim(p_short_name));
  if v_id is null then raise exception 'no organisation with short name %', p_short_name; end if;

  delete from org_members m using app_users u
   where m.org_id = v_id and m.user_id = u.id and lower(u.email) = v_email;
  get diagnostics v_m = row_count;
  delete from org_invites where org_id = v_id and email = v_email and accepted_at is null;
  get diagnostics v_i = row_count;
  if v_m + v_i = 0 then raise exception '% is not on this organisation''s team', v_email; end if;
  return jsonb_build_object('removed', v_email);
end;
$$;

grant execute on function public.admin_remove_member(text, text) to authenticated;


create or replace function public.admin_decline_application(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can decline an application'; end if;
  if p_kind = 'join' then
    update waitlist_contacts set status = 'declined', updated_at = now() where id = p_id;
  elsif p_kind = 'access' then
    update access_requests set status = 'declined', decided_at = now() where id = p_id and status = 'requested';
  else
    raise exception 'kind must be join or access';
  end if;
end;
$$;

grant execute on function public.admin_decline_application(text, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 8. set_org_status() accepts 'pending' (and activating a pending org is
-- the approval step for self-serve).
-- ----------------------------------------------------------------------------
create or replace function public.set_org_status(p_short_name text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can change an organisation''s status';
  end if;
  if p_status not in ('pending', 'active', 'paused', 'closed') then
    raise exception 'status must be pending, active, paused, or closed';
  end if;
  update organisations set status = p_status where short_name = p_short_name;
  if not found then
    raise exception 'no organisation with short_name %', p_short_name;
  end if;
end;
$$;

grant execute on function public.set_org_status(text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 9. Self-serve onboarding.
--
-- my_onboarding(): what a signed-in person with no organisation can do next —
-- their Join application (by their verified email), any organisation whose
-- website domain matches their email domain (claimable via the existing
-- join_org_by_domain()), and any pending organisation they created.
--
-- self_serve_create_org(): a ministry sets itself up. Rules:
--   - the caller's email domain must equal (or be a subdomain of) the
--     website domain they give — the same proof join_org_by_domain() uses;
--   - common free-mail domains cannot be a ministry's website domain;
--   - the organisation starts PENDING: it can prepare, not collect;
--   - one pending organisation per person at a time.
-- ----------------------------------------------------------------------------
create or replace function public._is_free_mail(p_domain text)
returns boolean language sql immutable as $$
  select lower(p_domain) = any (array[
    'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','yahoo.com','yahoo.co.uk',
    'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','gmx.com','gmx.net','mail.com',
    'yandex.com','zoho.com','qq.com','163.com','web.de','hey.com','fastmail.com'
  ]);
$$;


create or replace function public.my_onboarding()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_domain text;
begin
  if v_uid is null then return jsonb_build_object('signed_in', false); end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  v_domain := split_part(v_email, '@', 2);

  return jsonb_build_object(
    'signed_in', true,
    'email', v_email,
    'free_mail', _is_free_mail(v_domain),
    'application', (
      select jsonb_build_object('org_name', w.org_name, 'status', w.status, 'created_at', w.created_at)
      from waitlist_contacts w where lower(w.email) = v_email limit 1
    ),
    'domain_matches', case when _is_free_mail(v_domain) then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('slug', o.slug, 'name', o.name))
      from organisations o
      where o.is_demo = false and o.website_domain is not null
        and (lower(o.website_domain) = v_domain or v_domain like '%.' || lower(o.website_domain))
        and not exists (select 1 from org_members m where m.org_id = o.id and m.user_id = v_uid)
    ), '[]'::jsonb) end,
    'pending_orgs', coalesce((
      select jsonb_agg(jsonb_build_object('slug', o.slug, 'name', o.name))
      from organisations o join org_members m on m.org_id = o.id
      where m.user_id = v_uid and o.status = 'pending'
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.my_onboarding() to authenticated;


create or replace function public.self_serve_create_org(
  p_name           text,
  p_short_name     text,
  p_website_domain text,
  p_country        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_email_domain text;
  v_site text := lower(btrim(regexp_replace(coalesce(p_website_domain, ''), '^(https?://)?(www\.)?|/.*$', '', 'g')));
  v_short text := lower(btrim(p_short_name));
  v_org uuid;
  v_inst uuid;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  v_email_domain := split_part(v_email, '@', 2);

  if coalesce(btrim(p_name), '') = '' then raise exception 'your organisation''s name is required'; end if;
  if v_short !~ '^[a-z][a-z0-9-]{1,31}$' then
    raise exception 'short name must be 2–32 characters: lowercase letters, digits and hyphens, starting with a letter';
  end if;
  if v_site = '' or v_site !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'enter your organisation''s website domain, like shoreline.org'; end if;
  if _is_free_mail(v_site) or _is_free_mail(v_email_domain) then
    raise exception 'self-serve setup needs an email address at your organisation''s own domain — a personal address can request access instead';
  end if;
  if v_email_domain <> v_site and v_email_domain not like '%.' || v_site then
    raise exception 'your email (%) must be at your organisation''s website domain (%)', v_email_domain, v_site;
  end if;
  if exists (select 1 from organisations where short_name = v_short or slug = v_short) then
    raise exception 'the short name % is already taken', v_short;
  end if;
  if exists (select 1 from organisations o where lower(o.website_domain) = v_site and o.is_demo = false) then
    raise exception 'an organisation with the domain % is already on the platform — claim access to it instead', v_site;
  end if;
  if exists (
    select 1 from organisations o join org_members m on m.org_id = o.id
     where m.user_id = v_uid and o.status = 'pending'
  ) then
    raise exception 'you already have an organisation waiting for approval';
  end if;

  select id into v_inst from instrument_versions where status in ('active', 'published') order by created_at desc limit 1;
  if v_inst is null then raise exception 'the platform has no active instrument yet'; end if;

  insert into organisations (name, slug, short_name, website_domain, country, status)
  values (btrim(p_name), v_short, v_short, v_site, nullif(btrim(p_country), ''), 'pending')
  returning id into v_org;

  insert into campaigns (org_id, instrument_version_id) values (v_org, v_inst);

  insert into app_users (id, email) values (v_uid, v_email) on conflict (id) do nothing;
  insert into org_members (org_id, user_id, role) values (v_org, v_uid, 'org_admin');

  update waitlist_contacts set status = 'onboarded', updated_at = now() where lower(email) = v_email;

  return jsonb_build_object('slug', v_short, 'status', 'pending');
end;
$$;

grant execute on function public.self_serve_create_org(text, text, text, text) to authenticated;


-- ─── 0035_instrument_change_requests.sql ───────────────────────────────

-- ============================================================================
-- The Jesus Index — instrument change proposals (migration 0035)
--
-- The instrument admin UI (/build/instrument) lets the Collab and
-- administrators browse the live item bank and PROPOSE changes to it. It
-- deliberately does not edit items in place:
--
--   - src/data/instrument.v4.json is the single source of truth (CLAUDE.md),
--     bundled into the survey so it runs offline;
--   - a scoring change must land in src/lib/scoring.ts AND the SQL
--     normaliser together, with a test;
--   - wording and scoring are researcher-owned.
--
-- So a proposal is recorded here, reviewed by researchers, and — if
-- accepted — implemented as an ordinary reviewed PR that bumps the version.
-- Responses stay bound to the version they were captured under.
-- ============================================================================

create table if not exists public.instrument_change_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  version      text not null,                 -- the version the proposal was made against
  item_key     text,                          -- null for "add a new item"
  kind         text not null check (kind in ('wording', 'translation', 'tagging', 'scoring', 'options', 'new_item', 'remove_item', 'other')),
  locale       text,
  proposal     text not null check (length(proposal) between 1 and 4000),
  reason       text check (reason is null or length(reason) <= 4000),
  status       text not null default 'open' check (status in ('open', 'accepted', 'declined', 'implemented')),
  decision_note text,
  proposed_by  uuid references auth.users(id) on delete set null,
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz
);

alter table public.instrument_change_requests enable row level security;
-- No policies: functions only.

create or replace function public.propose_instrument_change(
  p_version text, p_item_key text, p_kind text, p_proposal text, p_reason text default null, p_locale text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'instrument proposals are for administrators and the Collab';
  end if;
  insert into instrument_change_requests (version, item_key, kind, locale, proposal, reason, proposed_by)
  values (btrim(p_version), nullif(btrim(p_item_key), ''), p_kind, nullif(btrim(p_locale), ''), btrim(p_proposal), nullif(btrim(p_reason), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.propose_instrument_change(text, text, text, text, text, text) to authenticated;


create or replace function public.list_instrument_changes()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'instrument proposals are for administrators and the Collab';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'version', r.version, 'item_key', r.item_key,
      'kind', r.kind, 'locale', r.locale, 'proposal', r.proposal, 'reason', r.reason,
      'status', r.status, 'decision_note', r.decision_note,
      'proposed_by', (select u.email from app_users u where u.id = r.proposed_by),
      'decided_at', r.decided_at
    ) order by (r.status = 'open') desc, r.created_at desc)
    from instrument_change_requests r
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_instrument_changes() to authenticated;


-- Deciding is an administrator's act — the record of a researcher decision,
-- not the change itself.
create or replace function public.decide_instrument_change(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator records a decision on an instrument proposal';
  end if;
  if p_status not in ('open', 'accepted', 'declined', 'implemented') then
    raise exception 'status must be open, accepted, declined or implemented';
  end if;
  update instrument_change_requests
     set status = p_status, decision_note = nullif(btrim(p_note), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id;
  if not found then raise exception 'proposal not found'; end if;
end;
$$;

grant execute on function public.decide_instrument_change(uuid, text, text) to authenticated;


-- ─── 0036_public_campaign_fix_and_org_settings.sql ─────────────────────

-- ============================================================================
-- The Jesus Index — launch round (migration 0036)
--
-- 1. BUG: public links said "isn't collecting answers yet".
--    A survey writes to the campaign matching its audience: community →
--    slug 'default', public → slug 'open'. Organisations created by 0034's
--    admin_create_org() / self_serve_create_org() only ever got the 'default'
--    campaign, so every PUBLIC link (and /<org>/open) found no campaign and
--    refused — whatever its open/close dates said. Fixed three ways:
--      a. backfill an 'open' campaign for every organisation that lacks one;
--      b. whenever a 'default' campaign is created, create its 'open' twin;
--      c. saving a public distribution link makes sure the 'open' campaign
--         exists and is active.
--
-- 2. Organisations edit their OWN survey settings (until now only an
--    administrator could, through admin_update_org()):
--      org_update_settings()  name, logo, colour, welcome/closing messages
--      org_set_duration()     full (~7 min) or core (~3 min) item set
--      org_settings()         what the settings page reads
--    Active org_admin members only. Nothing here touches respondents.
-- ============================================================================


-- 1a. Backfill.
insert into public.campaigns (org_id, slug, audience, instrument_version_id, locale, active, item_set, scoring_version)
select c.org_id, 'open', 'public', c.instrument_version_id, c.locale, true, c.item_set, c.scoring_version
  from public.campaigns c
 where c.slug = 'default'
   and not exists (select 1 from public.campaigns o where o.org_id = c.org_id and o.slug = 'open');


-- 1b. Every new community campaign gets its public twin.
create or replace function public.ensure_open_twin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.slug = 'default' and not exists (select 1 from campaigns where org_id = new.org_id and slug = 'open') then
    insert into campaigns (org_id, slug, audience, instrument_version_id, locale, active, item_set, scoring_version)
    values (new.org_id, 'open', 'public', new.instrument_version_id, new.locale, true, new.item_set, new.scoring_version);
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_open_twin on public.campaigns;
create trigger campaigns_open_twin
  after insert on public.campaigns
  for each row execute function public.ensure_open_twin();


-- 1c. A public link always has a live public campaign behind it.
create or replace function public.ensure_campaign_for_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_default campaigns%rowtype;
begin
  if new.audience = 'public' then
    if exists (select 1 from campaigns where org_id = new.org_id and slug = 'open') then
      update campaigns set active = true where org_id = new.org_id and slug = 'open' and active = false;
    else
      select * into v_default from campaigns where org_id = new.org_id and slug = 'default' order by created_at limit 1;
      if found then
        insert into campaigns (org_id, slug, audience, instrument_version_id, locale, active, item_set, scoring_version)
        values (new.org_id, 'open', 'public', v_default.instrument_version_id, v_default.locale, true, v_default.item_set, v_default.scoring_version);
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists distribution_links_ensure_campaign on public.distribution_links;
create trigger distribution_links_ensure_campaign
  after insert or update of audience on public.distribution_links
  for each row execute function public.ensure_campaign_for_link();


-- 2. Organisation self-serve settings.
create or replace function public._require_org_admin(p_org_slug text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null or not exists (
    select 1 from org_members m
     where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active' and m.role = 'org_admin'
  ) then
    raise exception 'only an organisation admin can change survey settings';
  end if;
  return v_org;
end;
$$;

revoke all on function public._require_org_admin(text) from public, anon, authenticated;


create or replace function public.org_settings(p_org_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; r organisations%rowtype;
begin
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null or not exists (select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'not authorised for this organisation';
  end if;
  select * into r from organisations where id = v_org;
  return jsonb_build_object(
    'name', r.name, 'short_name', r.short_name, 'logo_url', r.logo_url, 'brand_color', r.brand_color,
    'welcome_message', r.welcome_message, 'closing_message', r.closing_message, 'country', r.country,
    'status', r.status,
    'can_edit', exists (select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active' and m.role = 'org_admin'),
    'item_set', (select item_set from campaigns where org_id = v_org and slug = 'default' limit 1),
    'locales', (select coalesce(jsonb_agg(distinct locale), '[]'::jsonb) from campaigns where org_id = v_org)
  );
end;
$$;

grant execute on function public.org_settings(text) to authenticated;


create or replace function public.org_update_settings(p_org_slug text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_admin(p_org_slug);
begin
  if p_patch ? 'brand_color' and coalesce(p_patch->>'brand_color', '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'colour must look like #1f5f8b';
  end if;
  if p_patch ? 'logo_url' and coalesce(p_patch->>'logo_url', '') <> '' and p_patch->>'logo_url' !~ '^https://' then
    raise exception 'the logo must be an https:// image address';
  end if;
  if p_patch ? 'name' and length(btrim(coalesce(p_patch->>'name', ''))) not between 2 and 80 then
    raise exception 'the name must be 2–80 characters';
  end if;
  if (p_patch ? 'welcome_message' and length(coalesce(p_patch->>'welcome_message', '')) > 600)
     or (p_patch ? 'closing_message' and length(coalesce(p_patch->>'closing_message', '')) > 600) then
    raise exception 'messages must be 600 characters or fewer';
  end if;

  update organisations o set
    name            = coalesce(nullif(btrim(p_patch->>'name'), ''), o.name),
    brand_color     = coalesce(p_patch->>'brand_color', o.brand_color),
    logo_url        = case when p_patch ? 'logo_url' then nullif(btrim(p_patch->>'logo_url'), '') else o.logo_url end,
    welcome_message = case when p_patch ? 'welcome_message' then nullif(btrim(p_patch->>'welcome_message'), '') else o.welcome_message end,
    closing_message = case when p_patch ? 'closing_message' then nullif(btrim(p_patch->>'closing_message'), '') else o.closing_message end
  where o.id = v_org;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.org_update_settings(text, jsonb) to authenticated;


-- Duration: which item set both of the organisation's campaigns field.
-- 'full' ≈ 7 minutes; 'core' ≈ 3 minutes (the twelve core items + context).
-- Responses stay bound to the instrument version they were answered under.
create or replace function public.org_set_duration(p_org_slug text, p_item_set text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_admin(p_org_slug);
begin
  if p_item_set not in ('full', 'core') then raise exception 'duration must be full or core'; end if;
  update campaigns set item_set = p_item_set where org_id = v_org and slug in ('default', 'open');
  return jsonb_build_object('item_set', p_item_set);
end;
$$;

grant execute on function public.org_set_duration(text, text) to authenticated;

