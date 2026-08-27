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
