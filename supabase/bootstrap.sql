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

