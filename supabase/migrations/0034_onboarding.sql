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
