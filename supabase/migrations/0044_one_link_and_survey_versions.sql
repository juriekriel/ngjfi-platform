-- ============================================================================
-- The Jesus Index — one survey link, and survey versions (migration 0044)
--
-- A. ONE LINK PER ORGANISATION.
--    The "community" vs "public" split (0010, 0014, 0028, 0036) is retired:
--    with the way the survey is built it does not make sense to field two.
--      - New sessions all write to the organisation's 'default' campaign.
--      - The 'open' twin campaigns are no longer created (triggers dropped).
--        Existing ones are LEFT ACTIVE on purpose: a phone that cached the old
--        public link may still be holding queued answers, and they must land.
--        Their sessions stay what they were — nothing historical is rewritten.
--      - Distribution links no longer carry an audience (all 'community').
--      - org_links() returns the one link. /<org>/open redirects in the app.
--
-- B. SURVEY VERSIONS ("item sets").
--    An organisation can field the full survey or the J12 only — the J12
--    internal and external questions, with the screener that routes to them
--    and the demographics, but no Drivers, Journey or extras. (This replaces
--    the 'core' set that 0040 retired; that one dropped the screener, so its
--    respondents were asked four questions.)
--      - WHICH sets exist, and what each contains, is INSTRUMENT CONFIG
--        (definition->'item_sets'), never code. 'full' always exists.
--      - campaigns.item_set is the organisation's default; a distribution
--        link can override it (distribution_links.item_set, null = inherit).
--      - Every session records the version it was shown (sessions.item_set),
--        as the phone reports it — so a cached survey is never mislabelled.
--      - Scored items are asked identically in every set, so a J12-only
--        respondent counts in the same Index, cell for cell. Insight answers
--        are simply absent for them; every insight figure already reports
--        its own n.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- B1. Is this a set the instrument version defines?
-- ----------------------------------------------------------------------------
create or replace function public.item_set_valid(p_instrument_version_id uuid, p_item_set text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_item_set = 'full'
      or exists (select 1 from instrument_versions v
                  where v.id = p_instrument_version_id
                    and coalesce(v.definition->'item_sets', '{}'::jsonb) ? p_item_set);
$$;
grant execute on function public.item_set_valid(uuid, text) to anon, authenticated;

-- 0040's "always full" lock becomes "always a set the instrument defines".
-- Old callers still passing 'core' (campaign_upsert's and the wave RPCs'
-- historical default) get 'full', exactly as they did under 0040.
alter table public.campaigns drop constraint if exists campaigns_item_set_check;
alter table public.waves     drop constraint if exists waves_item_set_check;
drop trigger if exists trg_campaigns_full_item_set on public.campaigns;
drop trigger if exists trg_waves_full_item_set on public.waves;
drop function if exists public.force_full_item_set();

create or replace function public.validate_item_set()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.item_set is null or new.item_set = 'core' then new.item_set := 'full'; end if;
  if not item_set_valid(new.instrument_version_id, new.item_set) then
    raise exception 'instrument version has no survey version called "%"', new.item_set;
  end if;
  return new;
end;
$$;

create trigger trg_campaigns_item_set
  before insert or update of item_set, instrument_version_id on public.campaigns
  for each row execute function public.validate_item_set();
create trigger trg_waves_item_set
  before insert or update of item_set, instrument_version_id on public.waves
  for each row execute function public.validate_item_set();

comment on column public.campaigns.item_set is
  'Which survey version this campaign fields by default — a key of the instrument''s item_sets, or ''full''. A distribution link may override it.';


-- B2. A link may field its own version.
alter table public.distribution_links add column if not exists item_set text;
comment on column public.distribution_links.item_set is
  'Survey version this link fields (an instrument item_sets key). Null = the organisation''s default campaign setting.';

create or replace function public.validate_link_item_set()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_iv uuid;
begin
  if new.item_set is null then return new; end if;
  if new.item_set = 'core' then new.item_set := 'full'; end if;
  select instrument_version_id into v_iv from campaigns
   where org_id = new.org_id and slug = 'default' order by created_at limit 1;
  if v_iv is not null and not item_set_valid(v_iv, new.item_set) then
    raise exception 'there is no survey version called "%"', new.item_set;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_links_item_set on public.distribution_links;
create trigger trg_links_item_set
  before insert or update of item_set on public.distribution_links
  for each row execute function public.validate_link_item_set();


-- B3. Every session records the version it was shown.
alter table public.sessions add column if not exists item_set text not null default 'full';
comment on column public.sessions.item_set is
  'The survey version this respondent was shown (0044). Bound like the instrument version: never changed after the fact.';


-- ----------------------------------------------------------------------------
-- B4. start_session(): + p_item_set. Body otherwise exactly 0038's.
-- Dropped first so there is never a second overload (the 0027 lesson).
-- ----------------------------------------------------------------------------
drop function if exists public.start_session(uuid, text, text, text, jsonb, text);

create function public.start_session(
  p_campaign_id uuid,
  p_age_band text default null,
  p_country text default null,
  p_locale text default 'en',
  p_consent jsonb default '{}'::jsonb,
  p_distribution_link_slug text default null,
  p_item_set text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  v_org_status text;
  v_org_id uuid;
  v_link_id uuid;
  v_now timestamptz := now();
  v_iv uuid;
  v_set text;
begin
  -- The version the phone says it is asking, if the instrument defines it;
  -- otherwise the link's, then the campaign's. Never an unknown name.
  select c.instrument_version_id, c.item_set into v_iv, v_set from campaigns c where c.id = p_campaign_id;
  if p_item_set is not null and p_item_set <> 'core' and item_set_valid(v_iv, p_item_set) then
    v_set := p_item_set;
  elsif p_distribution_link_slug is not null then
    v_set := coalesce((select dl.item_set from distribution_links dl join campaigns c on c.org_id = dl.org_id
                        where c.id = p_campaign_id and dl.slug = p_distribution_link_slug), v_set);
  end if;
  v_set := coalesce(v_set, 'full');

  -- Test links (migration 0038): a session started through a TEST link is
  -- written to test_sessions, never to sessions, so no score, count, map or
  -- Collab figure can ever see it. It still honours the link's open window.
  if p_distribution_link_slug is not null then
    declare v_tl public.distribution_links%rowtype; v_tid uuid;
    begin
      select dl.* into v_tl
        from public.distribution_links dl
        join public.campaigns c on c.org_id = dl.org_id
       where c.id = p_campaign_id and dl.slug = p_distribution_link_slug and dl.is_test;
      if found then
        if (v_tl.active_from is not null and now() < v_tl.active_from)
           or (v_tl.active_to is not null and now() > v_tl.active_to) then
          raise exception 'link is not open right now';
        end if;
        perform public.purge_expired_test_data();
        insert into public.test_sessions (link_id, org_id, locale, context)
        values (v_tl.id, v_tl.org_id, coalesce(p_locale, 'en'),
                jsonb_strip_nulls(jsonb_build_object('age_band', p_age_band, 'country', p_country, 'item_set', v_set)))
        returning id into v_tid;
        return v_tid;
      end if;
    end;
  end if;
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

  insert into sessions (campaign_id, age_band, country, locale, consent, distribution_link_id, item_set)
  values (p_campaign_id, p_age_band, p_country,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb), v_link_id, v_set)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.start_session(uuid, text, text, text, jsonb, text, text) to anon, authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'start_session';
  if v_count <> 1 then
    raise exception 'expected exactly 1 start_session() after this migration, found %', v_count;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- A1. No more 'open' twins.
-- ----------------------------------------------------------------------------
drop trigger if exists campaigns_open_twin on public.campaigns;
drop function if exists public.ensure_open_twin();
drop trigger if exists distribution_links_ensure_campaign on public.distribution_links;
drop function if exists public.ensure_campaign_for_link();

comment on column public.campaigns.audience is
  'Historical (0010–0043). Since 0044 there is one survey link per organisation and every new session writes to the ''default'' campaign. Existing ''open'' campaigns stay active only so answers queued on phones still land.';

-- A2. Links no longer carry an audience.
update public.distribution_links set audience = 'community' where audience is distinct from 'community';
alter table public.distribution_links drop constraint if exists distribution_links_audience_check;
alter table public.distribution_links
  add constraint distribution_links_audience_check check (audience = 'community');
comment on column public.distribution_links.audience is
  'Always ''community'' since 0044 (one survey link). Kept so old clients that still send it don''t fail.';

-- A3. The one link.
create or replace function public.org_links(p_short_name text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'community', jsonb_build_object(
      'url',   'https://jfindx.org/' || o.short_name,
      'label', 'Your survey link',
      'note',  'One link for everyone you invite — camps, services, groups, social media.'
    )
  )
  from public.organisations o
  where o.short_name = lower(btrim(p_short_name))
  limit 1;
$$;
grant execute on function public.org_links(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- A4 + B5. upsert_distribution_link(): audience ignored, + p_item_set.
-- ----------------------------------------------------------------------------
drop function if exists public.upsert_distribution_link(text, text, text, uuid, text, timestamptz, timestamptz);

create function public.upsert_distribution_link(
  p_org_slug text,
  p_name text,
  p_slug text,
  p_id uuid default null,
  p_audience text default null,          -- ignored since 0044; accepted so old clients don't fail
  p_active_from timestamptz default null,
  p_active_to timestamptz default null,
  p_item_set text default null           -- null = the organisation's own setting
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

  if p_id is not null then
    update distribution_links
       set name = trim(p_name), slug = p_slug,
           active_from = p_active_from, active_to = p_active_to,
           item_set = nullif(p_item_set, '')
     where id = p_id and org_id = v_org.id
    returning id into v_id;
    if v_id is null then raise exception 'link not found'; end if;
  else
    insert into distribution_links (org_id, name, slug, audience, active_from, active_to, created_by, item_set)
    values (v_org.id, trim(p_name), p_slug, 'community', p_active_from, p_active_to, v_uid, nullif(p_item_set, ''))
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id);
exception
  when unique_violation then
    raise exception 'a link with that URL already exists for this organisation';
end;
$$;
grant execute on function public.upsert_distribution_link(text, text, text, uuid, text, timestamptz, timestamptz, text) to authenticated;


-- resolve_distribution_link(): + item_set (0042 body otherwise).
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
    'is_test', coalesce(v_link.is_test, false)
  );
end;
$$;
grant execute on function public.resolve_distribution_link(text, text) to anon, authenticated;


-- org_distribution_links(): + item_set (0042 body otherwise, incl. its place floor).
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


-- ----------------------------------------------------------------------------
-- campaign_upsert(): audience ignored (one link), item_set validated by the
-- trigger above. Same signature as 0014, so the console keeps working.
-- ----------------------------------------------------------------------------
create or replace function public.campaign_upsert(
  p_org_short_name  text,
  p_audience        text default 'community',
  p_item_set        text default 'full',
  p_locale          text default 'en',
  p_wave_short_name text default null,
  p_source_label    text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org    public.organisations%rowtype;
  v_wave   public.waves%rowtype;
  v_auth   text;
  v_iv     uuid;
  v_camp   uuid;
begin
  select * into v_org from organisations o where o.short_name = lower(btrim(p_org_short_name));
  if not found then raise exception 'organisation not found'; end if;

  v_auth := field_authority(v_org.id);
  if v_auth is null then
    raise exception 'not authorised to field for "%"', v_org.short_name;
  end if;

  if p_wave_short_name is not null then
    select * into v_wave from waves w where w.short_name = lower(btrim(p_wave_short_name));
    if not found then raise exception 'wave not found'; end if;
    if v_wave.is_demo <> v_org.is_demo then
      raise exception 'a % wave cannot be adopted by a % organisation',
        case when v_wave.is_demo then 'sandbox' else 'live' end,
        case when v_org.is_demo  then 'sandbox' else 'live' end;
    end if;
    v_iv       := v_wave.instrument_version_id;
    p_item_set := v_wave.item_set;
  else
    select id into v_iv from instrument_versions where status = 'active' order by created_at desc limit 1;
    if v_iv is null then raise exception 'no active instrument version — run npm run db:seed first'; end if;
  end if;

  insert into campaigns as c
    (org_id, slug, instrument_version_id, locale, active, source_label, item_set, audience)
  values
    (v_org.id, 'default', v_iv, p_locale, true, p_source_label, coalesce(p_item_set, 'full'), 'community')
  on conflict (org_id, slug) do update
     set instrument_version_id = excluded.instrument_version_id,
         locale                = excluded.locale,
         item_set              = excluded.item_set,
         active                = true
  returning c.id into v_camp;

  if v_wave.id is not null then
    insert into wave_adoptions (wave_id, org_id, campaign_id, adopted_by)
    values (v_wave.id, v_org.id, v_camp, auth.uid())
    on conflict (wave_id, org_id) do update set campaign_id = excluded.campaign_id;
  end if;

  if v_auth <> 'own_organisation' then
    insert into campaign_action_log (actor, org_id, authority, action, detail)
    values (auth.uid(), v_org.id, v_auth, 'campaign_upsert',
            jsonb_build_object('item_set', p_item_set, 'wave', v_wave.short_name));
  end if;

  return jsonb_build_object(
    'campaign_id', v_camp,
    'authority',   v_auth,
    'item_set',    (select item_set from campaigns where id = v_camp),
    'links',       org_links(v_org.short_name)
  );
end;
$$;
grant execute on function public.campaign_upsert(text, text, text, text, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- org_set_duration(): the organisation's default survey version.
-- ----------------------------------------------------------------------------
create or replace function public.org_set_duration(p_org_slug text, p_item_set text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_admin(p_org_slug);
begin
  -- validate_item_set() refuses a name the instrument doesn't define.
  update campaigns set item_set = p_item_set where org_id = v_org and slug = 'default';
  return jsonb_build_object('item_set', (select item_set from campaigns where org_id = v_org and slug = 'default' limit 1));
end;
$$;
grant execute on function public.org_set_duration(text, text) to authenticated;
