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
