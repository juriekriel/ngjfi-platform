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
