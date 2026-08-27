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
