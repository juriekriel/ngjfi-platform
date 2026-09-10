-- ============================================================================
-- The Jesus Index — organisation activation status (migration 0016)
--
-- Item 5 from the batch request: "toggle activation status (open, pause, or
-- shut down access) for any organization space." campaigns already had an
-- `active` flag (one campaign, one link), but nothing let an administrator
-- pause an ORGANISATION as a whole — every campaign it owns, in one action,
-- without having to find and flip each one.
-- ============================================================================

alter table public.organisations
  add column if not exists status text not null default 'active'
    check (status in ('active', 'paused', 'closed'));

comment on column public.organisations.status is
  'active: normal. paused: existing links stop accepting new sessions, reversible, org-visible. closed: same effect, intended as durable — the two are the same mechanism, status is the only difference.';

-- ----------------------------------------------------------------------------
-- start_session() now also refuses on behalf of a paused/closed organisation,
-- not just an inactive campaign. Two different, distinguishable messages, so
-- the frontend can tell a respondent something true rather than a generic
-- failure -- and so this is not confused with the campaign-level `active`
-- flag, which still means "this specific link," not "this organisation."
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
declare new_id uuid; v_org_status text;
begin
  if not exists (select 1 from campaigns c where c.id = p_campaign_id and c.active) then
    raise exception 'campaign not found or inactive';
  end if;

  select o.status into v_org_status
  from campaigns c join organisations o on o.id = c.org_id
  where c.id = p_campaign_id;

  if v_org_status = 'paused' then
    raise exception 'organisation access is paused';
  elsif v_org_status = 'closed' then
    raise exception 'organisation access is closed';
  end if;

  insert into sessions (campaign_id, age_band, gender, country, city, locale, consent)
  values (p_campaign_id, p_age_band, p_gender, p_country, p_city,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.start_session(uuid,text,text,text,text,text,jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Admin-only status changes. Same shape as set_user_role() and
-- decide_access_request(): the check is the first line, and the action is
-- logged nowhere special because my_role() itself is the audit trail --
-- only an administrator's session can ever reach this branch.
-- ----------------------------------------------------------------------------
create or replace function public.set_org_status(p_short_name text, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can change an organisation''s status';
  end if;
  if p_status not in ('active', 'paused', 'closed') then
    raise exception 'status must be active, paused, or closed';
  end if;
  update organisations set status = p_status where short_name = p_short_name;
  if not found then
    raise exception 'no organisation with short_name %', p_short_name;
  end if;
end;
$$;

grant execute on function public.set_org_status(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_worklist() gains status per organisation, and a fourth item: any org
-- an admin left paused/closed for more than a beat is worth a second look,
-- the same way "has a live survey and no responses" already is.
-- ----------------------------------------------------------------------------
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
        'status', o.status,
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
-- org_worklist() gains the same status awareness. Paused/closed surfaces as a
-- Band A item -- the console already renders exactly this shape for "your
-- logo is not set" etc, so this needs no new UI, just a truthful item.
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

  if v_org.status = 'paused' then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label',
      'Your access is paused by an administrator — your links stop accepting new responses until this is lifted',
      'action', 'Contact an administrator');
  elsif v_org.status = 'closed' then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label',
      'Your access is closed by an administrator — your links no longer accept new responses',
      'action', 'Contact an administrator');
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
                                    'is_demo', v_org.is_demo, 'status', v_org.status),
    'responses', v_n,
    'links',     org_links(v_org.short_name),
    'items',     v_items
  );
end;
$$;

grant execute on function public.org_worklist(text) to authenticated;
