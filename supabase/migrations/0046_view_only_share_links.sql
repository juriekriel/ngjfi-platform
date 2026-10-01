-- ============================================================================
-- The Jesus Index — view-only share links (migration 0046)
--
-- An organisation asked for a way to put its results in front of 90+ field
-- leaders without giving each of them an account. This is a tokenised,
-- read-only link an Org Administrator or Coordinator creates from the
-- dashboard, scoped to the whole organisation (the "house") or to one
-- distribution link (a "room"):
--
--     https://jfindx.org/view/<token>
--
-- What a link shows: the organisation's OWN figures — J12 index, n, the
-- 3 × 4 matrix and the "more detail" panels — and, optionally, the heat map,
-- which (like the dashboard's) is linked to all data gathered per country.
-- What it never shows: a Collab benchmark or overlay on the organisation's
-- matrix; any individual response; anything below the platform's minimums.
--
-- THE SAME MINIMUMS, EVERYWHERE (decided Oct 2026 with the requesting org):
-- a shared link holds exactly the floors the signed-in dashboard holds, read
-- from the same platform_settings rows — no share-specific threshold exists.
--   - house score:    min_group_n                  (0019)
--   - room score:     room_min_n                   (0033)
--   - country colour: country_critical_mass_gate   (0020) — all data for
--                     that country, the dashboard's own map (see 6)
--   - country outline: min_group_n / room_min_n    (as org_reach_countries)
--   - insight layers: insight_aggregates()' own gate (0021/0039)
--   - trend years:    min_group_n per year (new here — see 2)
-- A survey (room) below its floor shows its count only; the house, which
-- pools every room, will usually have cleared its own floor by then.
--
-- To guarantee a shared view can never drift from the dashboard, the bodies
-- of org_dashboard_season() (0030) and org_link_dashboard() (0033) move,
-- verbatim, into two internal functions. The signed-in RPCs become an auth
-- check + a call; the share RPC is a token check + the SAME call. One path.
--
--   1. Settings (versioned config) and the reserved 'view' short name.
--   2. _gated_trend()          — the trend, with years below min_group_n dropped.
--   3. _org_dashboard_core()   — org_dashboard_season()'s body, no auth.
--   4. _link_dashboard_core()  — org_link_dashboard()'s body, no auth.
--   5. org_dashboard_season() / org_link_dashboard() re-pointed at the cores.
--   6. _scope_country_map()    — the map: every country's full data, as the dashboard.
--   7. share_links             — hashed tokens; no client access.
--   8. create_share_link() / org_share_links() / revoke_share_link().
--   9. shared_dashboard(token, passcode) — the only anon-callable read.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Config. Every number a researcher or the Collab might want to change is
-- a platform_settings row, never a literal in a function body.
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('share_link_default_days', '90'::jsonb,
   'Default lifetime of a view-only share link, in days (0046).'),
  ('share_link_max_days', '365'::jsonb,
   'Longest a view-only share link may be set to last, in days (0046). Links always expire.'),
  ('share_link_limit', '25'::jsonb,
   'Most live (not expired, not revoked) view-only share links one organisation may hold at once (0046).'),
  ('share_link_passcode_max_failures', '10'::jsonb,
   'Wrong passcodes in a row before a passcode-protected share link locks (0046).'),
  ('share_link_lockout_minutes', '60'::jsonb,
   'How long a share link stays locked after too many wrong passcodes (0046).')
on conflict (key) do nothing;

-- /view/<token> is a top-level route, so 'view' can never be an organisation.
insert into public.reserved_short_names (name, reason) values ('view', 'share links (0046)')
on conflict (name) do nothing;

do $$ begin
  if exists (select 1 from public.organisations where slug = 'view' or short_name = 'view') then
    raise warning 'An organisation already uses "view" as its slug — its /view/* pages are shadowed by share links. Rename it.';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 2. _gated_trend(org, is_demo, min_n) — blended_trend() (0029) with every
-- year below min_group_n completions removed. Until now the dashboard's
-- "movement over time" showed a year's index however few people it held;
-- that is the one place the house view did not hold the floor. A year counts
-- the distinct live sessions it holds. Years that survive only as
-- retained_aggregates (after a retention purge) are dropped too, because
-- that table stores response counts, not people — flagged in the PR; no
-- purge has run yet (respondent_retention_months is still null).
-- ----------------------------------------------------------------------------
create or replace function public._gated_trend(p_org_id uuid, p_is_demo boolean, p_min int)
returns jsonb
language sql stable security definer set search_path = public as $$
  with yearly as (
    select extract(year from s.created_at)::int as yr, count(distinct s.id) as n
      from sessions s
      join campaigns c  on c.id = s.campaign_id
      join responses r  on r.session_id = s.id
     where c.org_id = p_org_id and r.normalized is not null
     group by 1
  )
  select coalesce(jsonb_agg(t order by (t->>'year')::int), '[]'::jsonb)
    from jsonb_array_elements(coalesce(blended_trend(p_org_id, p_is_demo), '[]'::jsonb)) t
    join yearly y on y.yr = (t->>'year')::int
   where y.n >= p_min;
$$;

revoke all on function public._gated_trend(uuid, boolean, int) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. _org_dashboard_core(org_id, season_start, season_end) — the body of
-- org_dashboard_season() (0030), moved here unchanged except: no auth check
-- (callers do that), and 'trend' comes from _gated_trend(). Internal only.
-- ----------------------------------------------------------------------------
create or replace function public._org_dashboard_core(
  p_org_id uuid,
  p_season_start date default null,
  p_season_end date default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype; result jsonb; result2 jsonb;
  v_n bigint; v_explore_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where id = p_org_id;
  if not found then raise exception 'org not found'; end if;

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
    'trend',   _gated_trend(v_org.id, v_org.is_demo, v_min_group_n),
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

revoke all on function public._org_dashboard_core(uuid, date, date) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. _link_dashboard_core(link_id) — the body of org_link_dashboard() (0033),
-- moved here unchanged except for the auth check. Internal only.
-- ----------------------------------------------------------------------------
create or replace function public._link_dashboard_core(p_link_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_link public.distribution_links%rowtype;
  v_min int;
  v_n bigint;
  result jsonb;
begin
  select * into v_link from distribution_links where id = p_link_id;
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

revoke all on function public._link_dashboard_core(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. The signed-in RPCs keep their names, signatures and contracts; they now
-- authorise and delegate. The output is identical to before except that
-- trend years below min_group_n are no longer returned.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard_season(
  p_org_slug text,
  p_season_start date default null,
  p_season_end date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;
  return _org_dashboard_core(v_org.id, p_season_start, p_season_end);
end;
$$;

grant execute on function public.org_dashboard_season(text, date, date) to authenticated;

create or replace function public.org_link_dashboard(p_org_slug text, p_link_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;
  if not exists (select 1 from distribution_links where id = p_link_id and org_id = v_org.id) then
    raise exception 'link not found';
  end if;
  return _link_dashboard_core(p_link_id);
end;
$$;

grant execute on function public.org_link_dashboard(text, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. _scope_country_map(org, link) — the heat map on a shared view.
--
-- Decided Oct 2026: the map stays linked to ALL data gathered for each
-- country, exactly as on the signed-in dashboard — the map is the one
-- picture on a share link that is not the organisation's alone.
--   countries[] — straight from collab_intelligence(): the same countries,
--                 the same 2,000 country gate, the same publish switch. Until
--                 the Collab publishes its view (publish_global_view), no
--                 country is coloured here either, as on the dashboard.
--   reached[]   — names only, outlined: where THIS scope (the house, or one
--                 room) has at least its own floor of completions —
--                 min_group_n for the house, room_min_n for a room — the
--                 same rule as org_reach_countries().
-- ----------------------------------------------------------------------------
create or replace function public._scope_country_map(p_org_id uuid, p_link_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_floor int; v_collab jsonb; v_published boolean;
begin
  v_floor := case when p_link_id is null then setting_int('min_group_n', 10)
                  else setting_int('room_min_n', setting_int('min_group_n', 10)) end;
  v_collab := collab_intelligence();
  v_published := coalesce((v_collab->>'published')::boolean, false);

  return jsonb_build_object(
    'published', v_published,
    'country_gate', coalesce((v_collab->>'country_gate')::int, setting_int('country_critical_mass_gate', 2000)),
    'floor', v_floor,
    'countries', case when v_published then coalesce(v_collab->'countries', '[]'::jsonb) else '[]'::jsonb end,
    'reached', coalesce((
      select jsonb_agg(country order by country) from (
        select s.country
          from sessions s
          join campaigns c on c.id = s.campaign_id
         where c.org_id = p_org_id
           and (p_link_id is null or s.distribution_link_id = p_link_id)
           and s.completed and s.country is not null and btrim(s.country) <> ''
         group by s.country
        having count(*) >= v_floor
      ) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public._scope_country_map(uuid, uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. share_links. The token itself is never stored — only its sha256 — so a
-- read of this table cannot reconstruct a working link. The creator copies
-- the link once, at creation. No client policies: every read and write goes
-- through the RPCs below, like every other org-scoped table here.
--
-- distribution_link_id cascades on delete: if a room goes, its share links
-- go with it. (SET NULL would silently widen a room link to the whole house.)
-- ----------------------------------------------------------------------------
create table if not exists public.share_links (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organisations(id) on delete cascade,
  distribution_link_id uuid references public.distribution_links(id) on delete cascade,
  label                text not null check (length(btrim(label)) between 1 and 80),
  token_hash           text not null unique,
  passcode_hash        text,
  show_map             boolean not null default true,
  show_detail          boolean not null default true,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  revoked_at           timestamptz,
  revoked_by           uuid references auth.users(id) on delete set null,
  view_count           bigint not null default 0,
  last_viewed_at       timestamptz,
  failed_attempts      int not null default 0,
  locked_until         timestamptz
);

comment on table public.share_links is
  'View-only share links (0046). Token stored as sha256 only. Read through shared_dashboard(); managed through create_share_link / org_share_links / revoke_share_link. Records views as a count — never who viewed.';

alter table public.share_links enable row level security;
revoke all on public.share_links from anon, authenticated;
create index if not exists idx_share_links_org on public.share_links(org_id);

create or replace function public._share_hash(p_text text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_text, 'UTF8')), 'hex');
$$;

revoke all on function public._share_hash(text) from public, anon, authenticated;

-- Only an Org Administrator or Coordinator of the organisation (0043).
create or replace function public._require_org_team(p_org_slug text)
returns public.organisations
language plpgsql stable security definer set search_path = public as $$
declare v_org public.organisations%rowtype;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if auth.uid() is null or not exists (
    select 1 from org_members m
     where m.org_id = v_org.id and m.user_id = auth.uid()
       and m.status = 'active' and m.role in ('org_admin', 'coordinator')
  ) then
    raise exception 'only an Org Administrator or Coordinator can manage view-only links';
  end if;
  return v_org;
end;
$$;

revoke all on function public._require_org_team(text) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 8a. create_share_link — returns the link's token ONCE. Never again.
-- ----------------------------------------------------------------------------
create or replace function public.create_share_link(
  p_org_slug    text,
  p_label       text,
  p_link_id     uuid    default null,
  p_days        int     default null,
  p_passcode    text    default null,
  p_show_map    boolean default true,
  p_show_detail boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype;
  v_link public.distribution_links%rowtype;
  v_days int; v_max int; v_limit int; v_live int;
  v_label text := btrim(coalesce(p_label, ''));
  v_pass text := nullif(btrim(coalesce(p_passcode, '')), '');
  v_token text; v_id uuid := gen_random_uuid(); v_expires timestamptz;
begin
  v_org := _require_org_team(p_org_slug);

  if length(v_label) = 0 then raise exception 'give the link a name, so you can tell it apart later'; end if;
  if length(v_label) > 80 then raise exception 'keep the name under 80 characters'; end if;

  if p_link_id is not null then
    select * into v_link from distribution_links where id = p_link_id and org_id = v_org.id;
    if not found then raise exception 'link not found'; end if;
    if v_link.is_test then raise exception 'a test link has no results to share'; end if;
  end if;

  v_max  := setting_int('share_link_max_days', 365);
  v_days := coalesce(p_days, setting_int('share_link_default_days', 90));
  if v_days < 1 or v_days > v_max then
    raise exception 'a view-only link can last between 1 and % days', v_max;
  end if;

  v_limit := setting_int('share_link_limit', 25);
  select count(*) into v_live from share_links
   where org_id = v_org.id and revoked_at is null and expires_at > now();
  if v_live >= v_limit then
    raise exception 'you already have % live view-only links — revoke one first', v_limit;
  end if;

  if v_pass is not null and (length(v_pass) < 4 or length(v_pass) > 32) then
    raise exception 'a passcode is 4 to 32 characters';
  end if;

  -- Two v4 UUIDs: 244 random bits. Unguessable; stored only as a hash.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => v_days);

  insert into share_links (id, org_id, distribution_link_id, label, token_hash, passcode_hash,
                           show_map, show_detail, created_by, expires_at)
  values (v_id, v_org.id, p_link_id, v_label, _share_hash(v_token),
          case when v_pass is null then null else _share_hash(v_id::text || ':' || v_pass) end,
          coalesce(p_show_map, true),
          -- a room never had per-item rows or insight layers (0033): too small.
          case when p_link_id is null then coalesce(p_show_detail, true) else false end,
          auth.uid(), v_expires);

  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

revoke all on function public.create_share_link(text, text, uuid, int, text, boolean, boolean) from public, anon;
grant execute on function public.create_share_link(text, text, uuid, int, text, boolean, boolean) to authenticated;


-- ----------------------------------------------------------------------------
-- 8b. org_share_links — the team's list. No tokens (there are none to give).
-- ----------------------------------------------------------------------------
create or replace function public.org_share_links(p_org_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org public.organisations%rowtype;
begin
  v_org := _require_org_team(p_org_slug);
  return coalesce((
    select jsonb_agg(row order by (row->>'live')::boolean desc, row->>'created_at' desc) from (
      select jsonb_build_object(
        'id', sl.id,
        'label', sl.label,
        'scope', case when sl.distribution_link_id is null then 'house' else 'room' end,
        'room_name', dl.name,
        'created_at', sl.created_at,
        'created_by', u.email,
        'expires_at', sl.expires_at,
        'revoked_at', sl.revoked_at,
        'live', sl.revoked_at is null and sl.expires_at > now(),
        'has_passcode', sl.passcode_hash is not null,
        'show_map', sl.show_map,
        'show_detail', sl.show_detail,
        'view_count', sl.view_count,
        'last_viewed_at', sl.last_viewed_at
      ) as row
        from share_links sl
        left join distribution_links dl on dl.id = sl.distribution_link_id
        left join auth.users u on u.id = sl.created_by
       where sl.org_id = v_org.id
         and (sl.revoked_at is null and sl.expires_at > now()
              or coalesce(sl.revoked_at, sl.expires_at) > now() - interval '90 days')
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.org_share_links(text) from public, anon;
grant execute on function public.org_share_links(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 8c. revoke_share_link — any Org Administrator or Coordinator may revoke any
-- of the organisation's links (revoking only ever narrows access). Idempotent.
-- ----------------------------------------------------------------------------
create or replace function public.revoke_share_link(p_org_slug text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org public.organisations%rowtype;
begin
  v_org := _require_org_team(p_org_slug);
  update share_links set revoked_at = now(), revoked_by = auth.uid()
   where id = p_id and org_id = v_org.id and revoked_at is null;
  if not exists (select 1 from share_links where id = p_id and org_id = v_org.id) then
    raise exception 'link not found';
  end if;
  return jsonb_build_object('id', p_id, 'revoked', true);
end;
$$;

revoke all on function public.revoke_share_link(text, uuid) from public, anon;
grant execute on function public.revoke_share_link(text, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 9. shared_dashboard(token, passcode) — the ONLY function anon can call here.
--
-- Returns a status, never an exception, so a wrong passcode's counter
-- survives (an exception would roll it back). Unknown, revoked and expired
-- tokens all answer the same 'unavailable', so the endpoint can't be used to
-- learn which links once existed. Only the org's name and branding are shown
-- before a passcode is accepted.
--
-- The payload is the same core the signed-in dashboard reads, minus anything
-- the creator switched off. The organisation's figures carry no Collab
-- overlay or benchmark; the map's country colours are the dashboard's own.
-- ----------------------------------------------------------------------------
create or replace function public.shared_dashboard(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_share public.share_links%rowtype;
  v_org public.organisations%rowtype;
  v_link public.distribution_links%rowtype;
  v_brand jsonb; v_dash jsonb; v_max int; v_until timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into v_share from share_links where token_hash = _share_hash(p_token) for update;
  if not found or v_share.revoked_at is not null or v_share.expires_at <= now() then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into v_org from organisations where id = v_share.org_id;
  if v_share.distribution_link_id is not null then
    select * into v_link from distribution_links where id = v_share.distribution_link_id;
    if not found or v_link.is_test then return jsonb_build_object('status', 'unavailable'); end if;
  end if;

  v_brand := jsonb_build_object('name', v_org.name, 'logo_url', v_org.logo_url, 'brand_color', v_org.brand_color);

  if v_share.passcode_hash is not null then
    if v_share.locked_until is not null and v_share.locked_until > now() then
      return jsonb_build_object('status', 'locked', 'org', v_brand, 'until', v_share.locked_until);
    end if;
    if nullif(btrim(coalesce(p_passcode, '')), '') is null then
      return jsonb_build_object('status', 'passcode_required', 'org', v_brand);
    end if;
    if _share_hash(v_share.id::text || ':' || btrim(p_passcode)) <> v_share.passcode_hash then
      v_max := setting_int('share_link_passcode_max_failures', 10);
      if v_share.failed_attempts + 1 >= v_max then
        update share_links
           set failed_attempts = 0,
               locked_until = now() + make_interval(mins => setting_int('share_link_lockout_minutes', 60))
         where id = v_share.id
         returning locked_until into v_until;
        return jsonb_build_object('status', 'locked', 'org', v_brand, 'until', v_until);
      end if;
      update share_links set failed_attempts = failed_attempts + 1 where id = v_share.id;
      return jsonb_build_object('status', 'passcode_wrong', 'org', v_brand);
    end if;
  end if;

  update share_links
     set view_count = view_count + 1, last_viewed_at = now(), failed_attempts = 0, locked_until = null
   where id = v_share.id;

  if v_share.distribution_link_id is null then
    v_dash := _org_dashboard_core(v_org.id, null, null) - 'season' - 'org';
    if not v_share.show_detail then
      v_dash := v_dash - 'items' - 'insights' - 'trend'
                       - 'exploration_n' - 'exploration_suppressed' - 'exploration_index'
                       - 'exploration_tiers' - 'exploration_domains' - 'exploration_matrix';
    end if;
  else
    v_dash := _link_dashboard_core(v_link.id) - 'link';
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'org', v_brand,
    'min_group_n', setting_int('min_group_n', 10),
    'label', v_share.label,
    'scope', jsonb_build_object(
      'kind', case when v_share.distribution_link_id is null then 'house' else 'room' end,
      'room_name', v_link.name),
    'expires_at', v_share.expires_at,
    'show_map', v_share.show_map,
    'show_detail', v_share.show_detail and v_share.distribution_link_id is null,
    'dashboard', v_dash,
    'map', case when v_share.show_map then _scope_country_map(v_org.id, v_share.distribution_link_id) else null end
  );
end;
$$;

comment on function public.shared_dashboard(text, text) is
  'View-only share link read (0046). Token + optional passcode → the organisation''s own aggregates through the same core as the signed-in dashboard, behind the same minimums. Never a Collab figure, never an individual response.';

revoke all on function public.shared_dashboard(text, text) from public;
grant execute on function public.shared_dashboard(text, text) to anon, authenticated;
