-- ============================================================================
-- The Jesus Index — organisation team tiers (migration 0043)
--
-- Four tiers of access, from the Collab down to a young person:
--
--   Administrator      app_users.role = 'admin' (the Collab backbone). Unchanged.
--   Org Administrator  org_members.role = 'org_admin' — EXACTLY ONE active per
--                      organisation. The person who claims the organisation
--                      (sign-in link + website-domain check, or an invitation
--                      from the Collab). Manages the team, survey settings,
--                      consent and branding.
--   Coordinator        org_members.role = 'coordinator' — up to N per
--                      organisation (platform_settings.org_coordinator_limit,
--                      default 5; config, not code). Added BY EMAIL by the Org
--                      Administrator. Uses the dashboard exactly as it is:
--                      results, rooms, links, QR codes, exports, consulting.
--                      Cannot change settings, consent, branding or the team.
--   Respondent         no account at all. Anonymous, as ever.
--
-- What changes:
--   1. 'facilitator' (and the never-used legacy values) become 'coordinator'.
--   2. Organisations that had several org_admins keep the EARLIEST as Org
--      Administrator; the others become Coordinators. Nobody loses access.
--   3. A unique index holds "one active Org Administrator per organisation".
--   4. A trigger holds the coordinator limit for every new or re-activated
--      coordinator (sandbox organisations are exempt — the public demo org
--      is claimable by any gmail address on purpose).
--   5. join_org_by_domain(): a matching email domain claims an UNCLAIMED
--      organisation only. Once an organisation has its Org Administrator,
--      further people come in by invitation — that is the whole point.
--   6. Org-facing team functions: org_team(), org_add_coordinator(),
--      org_remove_member(), org_transfer_admin(); Collab-facing
--      admin_set_org_admin(). Every team change is written to
--      campaign_action_log.
--
-- Read access is untouched: every dashboard function already admits any
-- active member, and every write that should be the Org Administrator's
-- alone already checks role = 'org_admin' (0036 settings, 0037 logo, 0042
-- consent). So a Coordinator sees the dashboard as is, with no reporting
-- function rewritten. Everything here is about ADULT STAFF; nothing touches
-- respondents or their answers.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Roles: org_admin | coordinator.
-- ----------------------------------------------------------------------------
alter table public.org_members drop constraint if exists org_members_role_check;
update public.org_members set role = 'coordinator' where role <> 'org_admin';

alter table public.org_invites drop constraint if exists org_invites_role_check;
update public.org_invites set role = 'coordinator' where role <> 'org_admin';


-- ----------------------------------------------------------------------------
-- 2. One Org Administrator per organisation — the earliest keeps it.
-- ----------------------------------------------------------------------------
with ranked as (
  select id, row_number() over (partition by org_id order by created_at, id) as rn
    from public.org_members
   where role = 'org_admin' and status = 'active'
)
update public.org_members m set role = 'coordinator'
  from ranked r where r.id = m.id and r.rn > 1;

-- Pending org_admin invitations for an organisation that already has its
-- administrator would collide on acceptance; they become coordinator invites.
update public.org_invites i set role = 'coordinator'
 where i.role = 'org_admin' and i.accepted_at is null
   and exists (select 1 from public.org_members m
                where m.org_id = i.org_id and m.role = 'org_admin' and m.status = 'active');
-- …and only the earliest pending org_admin invite per unclaimed organisation stays one.
with ranked as (
  select id, row_number() over (partition by org_id order by created_at, id) as rn
    from public.org_invites where role = 'org_admin' and accepted_at is null
)
update public.org_invites i set role = 'coordinator' from ranked r where r.id = i.id and r.rn > 1;

alter table public.org_members
  add constraint org_members_role_check check (role in ('org_admin', 'coordinator'));
alter table public.org_members alter column role set default 'coordinator';
alter table public.org_invites
  add constraint org_invites_role_check check (role in ('org_admin', 'coordinator'));
alter table public.org_invites alter column role set default 'coordinator';

create unique index if not exists org_members_one_admin
  on public.org_members (org_id) where role = 'org_admin' and status = 'active';

comment on column public.org_members.role is
  'org_admin = the one Org Administrator (unique per org); coordinator = shares dashboard access (limit: platform_settings.org_coordinator_limit). Collab administrators live on app_users.role.';


-- ----------------------------------------------------------------------------
-- 3. The coordinator limit is config.
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('org_coordinator_limit', '5'::jsonb,
   'How many Coordinators (besides its one Org Administrator) an organisation may have, counting pending invitations. Sandbox organisations are exempt.')
on conflict (key) do nothing;

create or replace function public._coordinator_count(p_org uuid, p_except_email text default null)
returns int language sql stable security definer set search_path = public as $$
  select (
    select count(*) from org_members m join app_users u on u.id = m.user_id
     where m.org_id = p_org and m.role = 'coordinator' and m.status = 'active'
       and (p_except_email is null or lower(u.email) <> lower(p_except_email))
  )::int + (
    select count(*) from org_invites i
     where i.org_id = p_org and i.role = 'coordinator' and i.accepted_at is null
       and (p_except_email is null or lower(i.email) <> lower(p_except_email))
       -- an invite for someone who is already a member is not a second seat
       and not exists (select 1 from org_members m join app_users u on u.id = m.user_id
                        where m.org_id = p_org and lower(u.email) = lower(i.email))
  )::int;
$$;
revoke all on function public._coordinator_count(uuid, text) from public, anon, authenticated;

create or replace function public.enforce_coordinator_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit int := setting_int('org_coordinator_limit', 5); v_n int;
begin
  if new.role <> 'coordinator' or new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.role = 'coordinator' and old.status = 'active' then return new; end if;
  -- A handover swaps two people's roles; the count is unchanged by the end.
  if current_setting('jfindx.team_swap', true) = 'on' then return new; end if;
  if exists (select 1 from organisations o where o.id = new.org_id and o.is_demo) then return new; end if;
  select count(*) into v_n from org_members
   where org_id = new.org_id and role = 'coordinator' and status = 'active' and id <> new.id;
  if v_n >= v_limit then
    raise exception 'this organisation already has % coordinators — the most it can have. Remove one first.', v_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists org_members_coordinator_limit on public.org_members;
create trigger org_members_coordinator_limit
  before insert or update of role, status on public.org_members
  for each row execute function public.enforce_coordinator_limit();


-- ----------------------------------------------------------------------------
-- 4. Invitations, now tier-aware. Same signature as 0034, so admin_create_org
-- and admin_add_member keep working unchanged.
-- ----------------------------------------------------------------------------
create or replace function public._invite_member(p_org_id uuid, p_email text, p_role text, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_uid uuid;
  v_role text := case when p_role = 'facilitator' then 'coordinator' else p_role end;
  v_demo boolean;
  v_current_role text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not an email address'; end if;
  if v_role not in ('org_admin', 'coordinator') then raise exception 'role must be org_admin or coordinator'; end if;
  select is_demo into v_demo from organisations where id = p_org_id;

  select m.role into v_current_role
    from org_members m join app_users u on u.id = m.user_id
   where m.org_id = p_org_id and lower(u.email) = v_email and m.status = 'active';

  if v_role = 'org_admin' then
    if v_current_role = 'org_admin' then
      return jsonb_build_object('email', v_email, 'attached', true, 'role', 'org_admin');
    end if;
    if exists (select 1 from org_members where org_id = p_org_id and role = 'org_admin' and status = 'active')
       or exists (select 1 from org_invites where org_id = p_org_id and role = 'org_admin'
                   and accepted_at is null and email <> v_email) then
      raise exception 'this organisation already has its Org Administrator — hand the role over instead (admin_set_org_admin / org_transfer_admin)';
    end if;
  else
    if v_current_role = 'org_admin' then
      raise exception '% is this organisation''s Org Administrator — hand the role over before making them a coordinator', v_email;
    end if;
    if v_current_role = 'coordinator' then
      return jsonb_build_object('email', v_email, 'attached', true, 'role', 'coordinator');
    end if;
    if not v_demo and _coordinator_count(p_org_id, v_email) >= setting_int('org_coordinator_limit', 5) then
      raise exception 'this organisation already has % coordinators — the most it can have. Remove one first.',
        setting_int('org_coordinator_limit', 5);
    end if;
  end if;

  insert into org_invites (org_id, email, role, invited_by)
  values (p_org_id, v_email, v_role, p_by)
  on conflict (org_id, email) do update
    set role = excluded.role, invited_by = excluded.invited_by, accepted_at = null, created_at = now();

  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is not null then
    insert into app_users (id, email) values (v_uid, v_email) on conflict (id) do nothing;
    insert into org_members (org_id, user_id, role) values (p_org_id, v_uid, v_role)
    on conflict (org_id, user_id) do update set role = excluded.role, status = 'active';
    update org_invites set accepted_at = coalesce(accepted_at, now()) where org_id = p_org_id and email = v_email;
    return jsonb_build_object('email', v_email, 'attached', true, 'role', v_role);
  end if;
  return jsonb_build_object('email', v_email, 'attached', false, 'role', v_role);
end;
$$;
revoke all on function public._invite_member(uuid, text, text, uuid) from public, anon, authenticated;


-- claim_my_invites(): one invitation that can no longer be honoured (the
-- organisation found its administrator another way, or is full) never
-- blocks the others — it simply stays pending for the Org Administrator.
create or replace function public.claim_my_invites()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_n int := 0; v_role text; r record;
begin
  if v_uid is null then return jsonb_build_object('attached', 0); end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then return jsonb_build_object('attached', 0); end if;

  insert into app_users (id, email) values (v_uid, v_email) on conflict (id) do nothing;

  for r in select i.id, i.org_id, i.role from org_invites i where i.email = v_email and i.accepted_at is null loop
    v_role := r.role;
    if v_role = 'org_admin' and exists (
      select 1 from org_members where org_id = r.org_id and role = 'org_admin' and status = 'active' and user_id <> v_uid
    ) then
      v_role := 'coordinator';
    end if;
    begin
      insert into org_members (org_id, user_id, role) values (r.org_id, v_uid, v_role)
      on conflict (org_id, user_id) do update
        set status = 'active',
            role = case when org_members.role = 'org_admin' then 'org_admin' else excluded.role end;
      update org_invites set accepted_at = now() where id = r.id;
      v_n := v_n + 1;
    exception when others then
      null; -- left pending; the Org Administrator sees it on their Team view
    end;
  end loop;

  return jsonb_build_object('attached', v_n);
end;
$$;
grant execute on function public.claim_my_invites() to authenticated;


-- ----------------------------------------------------------------------------
-- 5. join_org_by_domain(): claims an UNCLAIMED organisation only.
-- Same signature and success shape as 0002, so the dashboard keeps working.
-- ----------------------------------------------------------------------------
create or replace function public.join_org_by_domain(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_email_domain text;
  v_org public.organisations%rowtype;
  v_mine text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'no email on account'; end if;
  v_email_domain := lower(split_part(v_email, '@', 2));

  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  insert into app_users (id, email) values (v_uid, v_email)
    on conflict (id) do update set email = excluded.email;

  -- An invitation always wins: accept it first.
  perform claim_my_invites();
  select role into v_mine from org_members where org_id = v_org.id and user_id = v_uid and status = 'active';
  if v_mine is not null then
    return jsonb_build_object('ok', true, 'org_id', v_org.id, 'role', v_mine);
  end if;

  if v_org.website_domain is null then raise exception 'organisation has no website domain set'; end if;
  if lower(v_org.website_domain) <> v_email_domain
     and v_email_domain not like ('%.' || lower(v_org.website_domain)) then
    return jsonb_build_object(
      'ok', false, 'reason', 'email_domain_mismatch',
      'email_domain', v_email_domain, 'expected', lower(v_org.website_domain));
  end if;

  if exists (select 1 from org_members where org_id = v_org.id and role = 'org_admin' and status = 'active')
     or exists (select 1 from org_invites where org_id = v_org.id and role = 'org_admin' and accepted_at is null) then
    -- The sandbox stays open to anyone at its domain, as a coordinator.
    if v_org.is_demo then
      insert into org_members (org_id, user_id, role) values (v_org.id, v_uid, 'coordinator')
      on conflict (org_id, user_id) do update set status = 'active';
      return jsonb_build_object('ok', true, 'org_id', v_org.id, 'role', 'coordinator');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  insert into org_members (org_id, user_id, role) values (v_org.id, v_uid, 'org_admin')
  on conflict (org_id, user_id) do update set role = 'org_admin', status = 'active';
  update organisations set verified = true where id = v_org.id;

  insert into campaign_action_log (actor, org_id, authority, action, detail)
  values (v_uid, v_org.id, 'own_organisation', 'team_claim_org_admin', jsonb_build_object('email', lower(v_email)));

  return jsonb_build_object('ok', true, 'org_id', v_org.id, 'role', 'org_admin');
end;
$$;
grant execute on function public.join_org_by_domain(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. The organisation's own team.
-- ----------------------------------------------------------------------------
create or replace function public._team_org(p_org_slug text, p_need_admin boolean)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = p_org_slug or short_name = p_org_slug limit 1;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if my_role() = 'admin' then return v_org; end if;
  if p_need_admin then
    if not exists (select 1 from org_members where org_id = v_org and user_id = auth.uid()
                    and status = 'active' and role = 'org_admin') then
      raise exception 'only the Org Administrator can change who has access';
    end if;
  elsif not exists (select 1 from org_members where org_id = v_org and user_id = auth.uid() and status = 'active') then
    raise exception 'not authorised for this organisation';
  end if;
  return v_org;
end;
$$;
revoke all on function public._team_org(text, boolean) from public, anon, authenticated;

create or replace function public._team_log(p_org uuid, p_action text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into campaign_action_log (actor, org_id, authority, action, detail)
  values (auth.uid(), p_org,
          case when exists (select 1 from org_members where org_id = p_org and user_id = auth.uid() and status = 'active')
               then 'own_organisation' else 'administrator' end,
          p_action, p_detail);
$$;
revoke all on function public._team_log(uuid, text, jsonb) from public, anon, authenticated;


-- Who has access. Any member sees their colleagues (adult staff only).
create or replace function public.org_team(p_org_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := _team_org(p_org_slug, false); v_demo boolean;
begin
  select is_demo into v_demo from organisations where id = v_org;
  return jsonb_build_object(
    'my_role', coalesce((select role from org_members where org_id = v_org and user_id = auth.uid() and status = 'active'),
                        case when my_role() = 'admin' then 'administrator' end),
    'can_manage', my_role() = 'admin' or exists (
      select 1 from org_members where org_id = v_org and user_id = auth.uid() and status = 'active' and role = 'org_admin'),
    'coordinator_limit', case when v_demo then null else setting_int('org_coordinator_limit', 5) end,
    'coordinators_used', _coordinator_count(v_org),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role, 'since', m.created_at,
                                          'is_me', m.user_id = auth.uid())
                       order by (m.role = 'org_admin') desc, m.created_at)
        from org_members m join app_users u on u.id = m.user_id
       where m.org_id = v_org and m.status = 'active'), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'created_at', i.created_at) order by i.created_at)
        from org_invites i
       where i.org_id = v_org and i.accepted_at is null
         and not exists (select 1 from org_members m join app_users u on u.id = m.user_id
                          where m.org_id = v_org and m.status = 'active' and lower(u.email) = lower(i.email))), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.org_team(text) to authenticated;


create or replace function public.org_add_coordinator(p_org_slug text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _team_org(p_org_slug, true); v_res jsonb;
begin
  v_res := _invite_member(v_org, p_email, 'coordinator', auth.uid());
  perform _team_log(v_org, 'team_add_coordinator', jsonb_build_object('email', v_res->>'email'));
  return v_res;
end;
$$;
grant execute on function public.org_add_coordinator(text, text) to authenticated;


-- The Org Administrator removes a coordinator or a pending invitation; a
-- coordinator may remove themselves (leave). Nobody removes the Org
-- Administrator — the role is handed over, never left empty by accident.
create or replace function public.org_remove_member(p_org_slug text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_self boolean := v_email = (select lower(email) from auth.users where id = auth.uid());
  v_org uuid := _team_org(p_org_slug, not v_self);
  v_m int; v_i int;
begin
  if exists (select 1 from org_members m join app_users u on u.id = m.user_id
              where m.org_id = v_org and lower(u.email) = v_email and m.role = 'org_admin' and m.status = 'active') then
    raise exception 'the Org Administrator can''t be removed — hand the role over to a coordinator first';
  end if;
  delete from org_members m using app_users u
   where m.org_id = v_org and m.user_id = u.id and lower(u.email) = v_email;
  get diagnostics v_m = row_count;
  delete from org_invites where org_id = v_org and email = v_email;
  get diagnostics v_i = row_count;
  if v_m + v_i = 0 then raise exception '% doesn''t have access to this organisation', v_email; end if;
  perform _team_log(v_org, case when v_self then 'team_leave' else 'team_remove' end, jsonb_build_object('email', v_email));
  return jsonb_build_object('removed', v_email);
end;
$$;
grant execute on function public.org_remove_member(text, text) to authenticated;


-- Hand the Org Administrator role to someone else. Shared by the org-facing
-- and Collab-facing entry points. The outgoing administrator becomes a
-- coordinator (or, for a Collab reassignment where that would exceed the
-- limit, is told to make room first).
create or replace function public._set_org_admin(p_org uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(p_email)); v_uid uuid; v_old uuid;
begin
  select id into v_uid from auth.users where lower(email) = v_email;
  select user_id into v_old from org_members where org_id = p_org and role = 'org_admin' and status = 'active';
  if v_old is not null and v_old = v_uid then
    return jsonb_build_object('org_admin', v_email, 'pending', false);
  end if;

  -- Handing over to an existing coordinator swaps two roles: the number of
  -- coordinators is the same at the end, so the limit is not re-checked mid-swap.
  if v_uid is not null and exists (select 1 from org_members where org_id = p_org and user_id = v_uid
                                     and role = 'coordinator' and status = 'active') then
    perform set_config('jfindx.team_swap', 'on', true);
  end if;

  -- Free the seat first (the unique index holds one active org_admin).
  if v_old is not null then
    update org_members set role = 'coordinator' where org_id = p_org and user_id = v_old;
  end if;
  update org_invites set role = 'coordinator' where org_id = p_org and role = 'org_admin' and accepted_at is null;

  if v_uid is not null then
    insert into app_users (id, email) values (v_uid, v_email) on conflict (id) do nothing;
    insert into org_members (org_id, user_id, role) values (p_org, v_uid, 'org_admin')
    on conflict (org_id, user_id) do update set role = 'org_admin', status = 'active';
    insert into org_invites (org_id, email, role, invited_by, accepted_at)
    values (p_org, v_email, 'org_admin', auth.uid(), now())
    on conflict (org_id, email) do update set role = 'org_admin', accepted_at = coalesce(org_invites.accepted_at, now());
    perform set_config('jfindx.team_swap', 'off', true);
    return jsonb_build_object('org_admin', v_email, 'pending', false);
  end if;

  insert into org_invites (org_id, email, role, invited_by)
  values (p_org, v_email, 'org_admin', auth.uid())
  on conflict (org_id, email) do update set role = 'org_admin', accepted_at = null, invited_by = excluded.invited_by;
  return jsonb_build_object('org_admin', v_email, 'pending', true);
end;
$$;
revoke all on function public._set_org_admin(uuid, text) from public, anon, authenticated;


-- From inside the organisation: only to an existing coordinator, so a
-- handover can never hand the organisation to a stranger by a typo.
create or replace function public.org_transfer_admin(p_org_slug text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _team_org(p_org_slug, true); v_email text := lower(btrim(p_email)); v_res jsonb;
begin
  if not exists (select 1 from org_members m join app_users u on u.id = m.user_id
                  where m.org_id = v_org and lower(u.email) = v_email and m.role = 'coordinator' and m.status = 'active') then
    raise exception 'hand the role to someone already on your team as a coordinator — add them first, and they must have signed in once';
  end if;
  v_res := _set_org_admin(v_org, v_email);
  perform _team_log(v_org, 'team_transfer_admin', jsonb_build_object('to', v_email));
  return v_res;
end;
$$;
grant execute on function public.org_transfer_admin(text, text) to authenticated;


-- From the Collab: reassign to anyone (they may not have signed in yet).
create or replace function public.admin_set_org_admin(p_short_name text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_res jsonb;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can reassign an organisation''s Org Administrator'; end if;
  if lower(btrim(p_email)) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not an email address'; end if;
  select id into v_org from organisations where short_name = lower(btrim(p_short_name));
  if v_org is null then raise exception 'no organisation with short name %', p_short_name; end if;
  v_res := _set_org_admin(v_org, p_email);
  perform _team_log(v_org, 'team_set_org_admin', jsonb_build_object('to', lower(btrim(p_email))));
  return v_res;
end;
$$;
grant execute on function public.admin_set_org_admin(text, text) to authenticated;


-- my_context() gains each organisation's tier, so the console can label it.
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
               'slug', o.slug, 'short_name', o.short_name, 'name', o.name, 'is_demo', o.is_demo,
               'org_role', m.role)
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
