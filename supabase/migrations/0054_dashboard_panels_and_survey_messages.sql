-- 0054 · Dashboard panels an organisation chooses, and a welcome and closing
--        message for each survey (distribution link).
--
-- 1. organisations.dashboard_panels — { key: boolean } for "Edit your dashboard
--    → Your dashboard" (src/lib/dashboardPanels.ts). Missing key = shown.
--    Display only: it never changes what is collected, scored or gated.
--    Read by any active member; changed by an organisation admin.
--
-- 2. distribution_links.welcome_message / closing_message — each survey's own
--    first and last screen. Empty = the organisation's own message, else the
--    standard text. Written by the organisation's own staff, shown to
--    respondents; never holds anything about a respondent.
--
-- Additive only. No existing row changes meaning; every function keeps its
-- signature, so older clients keep working.

alter table public.organisations
  add column if not exists dashboard_panels jsonb;

alter table public.organisations
  drop constraint if exists organisations_dashboard_panels_object;
alter table public.organisations
  add constraint organisations_dashboard_panels_object
  check (dashboard_panels is null or jsonb_typeof(dashboard_panels) = 'object');

alter table public.distribution_links
  add column if not exists welcome_message text,
  add column if not exists closing_message text;

alter table public.distribution_links
  drop constraint if exists distribution_links_message_length;
alter table public.distribution_links
  add constraint distribution_links_message_length
  check (coalesce(length(welcome_message), 0) <= 600 and coalesce(length(closing_message), 0) <= 600);


-- 1a. Read: any active member of the organisation (or a platform admin / Collab).
create or replace function public.org_dashboard_panels(p_org_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org public.organisations%rowtype;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if auth.uid() is null or (
    not exists (select 1 from org_members m where m.org_id = v_org.id and m.user_id = auth.uid() and m.status = 'active')
    and my_role() not in ('admin', 'collab')
  ) then
    raise exception 'not authorised for this organisation';
  end if;
  return jsonb_build_object(
    'panels', coalesce(v_org.dashboard_panels, '{}'::jsonb),
    'can_edit', exists (select 1 from org_members m where m.org_id = v_org.id and m.user_id = auth.uid() and m.status = 'active' and m.role = 'org_admin')
  );
end;
$$;
grant execute on function public.org_dashboard_panels(text) to authenticated;


-- 1b. Write: organisation admin only. Booleans only, known shape only.
create or replace function public.org_set_dashboard_panels(p_org_slug text, p_panels jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_admin(p_org_slug); v_bad text;
begin
  if p_panels is null or jsonb_typeof(p_panels) <> 'object' then
    raise exception 'panels must be an object of on/off choices';
  end if;
  select k into v_bad from jsonb_each(p_panels) as e(k, v)
   where jsonb_typeof(v) <> 'boolean' or k !~ '^[a-z_]{1,40}$' limit 1;
  if v_bad is not null then raise exception 'not an on/off choice: %', v_bad; end if;

  update organisations set dashboard_panels = p_panels where id = v_org;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.org_set_dashboard_panels(text, jsonb) to authenticated;


-- 2a. Write a survey's messages: the same people who can make or rename it
--     (any active member, as upsert_distribution_link, 0044).
create or replace function public.set_distribution_link_messages(
  p_org_slug text, p_link_id uuid, p_welcome text, p_closing text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; v_id uuid;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;
  if length(coalesce(p_welcome, '')) > 600 or length(coalesce(p_closing, '')) > 600 then
    raise exception 'messages must be 600 characters or fewer';
  end if;

  update distribution_links
     set welcome_message = nullif(btrim(p_welcome), ''),
         closing_message = nullif(btrim(p_closing), '')
   where id = p_link_id and org_id = v_org.id
  returning id into v_id;
  if v_id is null then raise exception 'link not found'; end if;
  return jsonb_build_object('id', v_id);
end;
$$;
grant execute on function public.set_distribution_link_messages(text, uuid, text, text) to authenticated;


-- 2b. resolve_distribution_link(): + the survey's messages (0044 body otherwise).
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
    'audience', 'community',
    'item_set', v_link.item_set,
    'active_from', v_link.active_from,
    'active_to', v_link.active_to,
    'is_open', (v_link.active_from is null or v_link.active_from <= v_now)
           and (v_link.active_to   is null or v_link.active_to   >= v_now),
    'is_test', coalesce(v_link.is_test, false),
    'welcome_message', v_link.welcome_message,
    'closing_message', v_link.closing_message
  );
end;
$$;
grant execute on function public.resolve_distribution_link(text, text) to anon, authenticated;


-- 2c. org_distribution_links(): + the survey's messages (0044 body otherwise,
--     incl. its place floor).
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
      'audience', 'community',
      'item_set', l.item_set,
      'active_from', l.active_from,
      'active_to', l.active_to,
      'welcome_message', l.welcome_message,
      'closing_message', l.closing_message,
      'status', case
        when l.active_from is not null and l.active_from > v_now then 'scheduled'
        when l.active_to   is not null and l.active_to   < v_now then 'ended'
        else 'active'
      end,
      'n', coalesce(cnt.n, 0),
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
          select trim(both ', ' from coalesce(s.city, '') ||
                      case when s.city is not null and s.country is not null then ', ' else '' end ||
                      coalesce(s.country, '')) as place
          from sessions s
          where s.distribution_link_id = l.id and s.completed and (s.city is not null or s.country is not null)
          group by 1
          having count(*) >= setting_int('min_group_n', 10)
        ) distinct_places
      ) numbered
    ) places on true
    where l.org_id = v_org.id
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.org_distribution_links(text) to authenticated;
