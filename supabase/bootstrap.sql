-- ============================================================================
-- The Jesus Index — full schema bootstrap
--
-- GENERATED FILE. Do not edit: change a migration and re-run
--   node scripts/build-bootstrap.mjs
--
-- Stands up a complete, empty database in one paste. Run it in a new Supabase
-- project's SQL editor, top to bottom, then:
--
--   1.  npm run db:seed            loads instrument v1 + the demo organisation
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

