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
