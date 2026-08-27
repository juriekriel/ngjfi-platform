-- ============================================================================
-- The Jesus Index — survey setup at every tier (migration 0014)
--
-- The brief was "every tier can set up surveys". That sentence hides two
-- different verbs, and conflating them is what would break the arithmetic:
--
--   FIELD    run a survey and collect responses.
--            ALWAYS owned by exactly one organisation. Every response traces
--            to an owner that can be counted once — which is what stops a
--            church sitting in three networks from appearing three times in a
--            benchmark, and what makes "delete my data" answerable.
--
--   CONVENE  define a WAVE — version, item set, audiences, window, locales —
--            that organisations adopt in one click. Collects nothing itself.
--            This is what makes forty organisations comparable rather than
--            merely simultaneous.
--
-- So 0013's rule survives intact: a network still fields nothing AS a network.
-- When NXT Move wants to run its own camp survey it becomes an organisation
-- too and joins its own network. That is honest rather than a workaround —
-- the ministry and the container genuinely are different objects.
--
-- Nothing here changes an existing table's meaning, and nothing here touches
-- the respondent path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · The second consent.
--
-- 0013 gave a membership `shares_index`: may this network SEE our number.
-- Fielding on our behalf is a bigger ask than seeing our score, so it gets its
-- own flag and its own default. Being added to a network is not consent to be
-- seen, and it is certainly not consent to be spoken for.
-- ----------------------------------------------------------------------------
alter table public.network_members
  add column if not exists manages_surveys boolean not null default false;

comment on column public.network_members.manages_surveys is
  'Consent: this network may create and edit campaigns on the organisation''s behalf. Defaults to false. Strictly stronger than shares_index.';

-- ----------------------------------------------------------------------------
-- 2 · Waves — the convening object.
--
-- A wave has no org_id, no campaign, no respondents and no link. It cannot
-- collect anything. It is a shape that campaigns are cut to, which is exactly
-- why an organisation that strips out non-core items drops out of the
-- comparison for those cells instead of quietly distorting it.
-- ----------------------------------------------------------------------------
create table if not exists public.waves (
  id                    uuid primary key default gen_random_uuid(),
  short_name            text unique not null,
  name                  text not null,
  instrument_version_id uuid not null references public.instrument_versions(id),
  item_set              text not null default 'core'
                          check (item_set in ('full', 'core')),
  -- Two audiences off one instrument. The comparison between them is the most
  -- useful thing a ministry gets out of the Index, so it is structural.
  audiences             text[] not null default array['community']::text[]
                          check (audiences <@ array['community','public']::text[]
                                 and array_length(audiences, 1) >= 1),
  locales               text[] not null default array['en']::text[],
  opens_on              date,
  closes_on             date,
  -- Who called it. A network convenes for its members; the Collab convenes for
  -- everyone. Null network_id means coalition-wide.
  convened_by_network_id uuid references public.networks(id) on delete set null,
  convened_by            uuid references public.app_users(id),
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now()
);

alter table public.waves drop constraint if exists waves_short_name_shape;
alter table public.waves
  add constraint waves_short_name_shape
    check (short_name ~ '^[a-z][a-z0-9-]{1,39}$');

alter table public.waves drop constraint if exists waves_window_ordered;
alter table public.waves
  add constraint waves_window_ordered
    check (closes_on is null or opens_on is null or closes_on >= opens_on);

comment on table public.waves is
  'A convening shape. Owns no responses and has no link — organisations adopt it, which is what makes their campaigns comparable.';

create table if not exists public.wave_adoptions (
  wave_id     uuid not null references public.waves(id) on delete cascade,
  org_id      uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  adopted_by  uuid references public.app_users(id),
  adopted_at  timestamptz not null default now(),
  primary key (wave_id, org_id)
);

alter table public.waves          enable row level security;
alter table public.wave_adoptions enable row level security;

-- Waves are public knowledge — a season is an announcement, not a secret.
-- Adoptions are not: who has and has not fielded is the network's business.
drop policy if exists "waves are publicly readable" on public.waves;
create policy "waves are publicly readable" on public.waves for select using (true);

-- ----------------------------------------------------------------------------
-- 3 · May I field for this organisation?
--
-- One function, consulted by everything that writes a campaign, so the answer
-- cannot drift between surfaces. Returns the reason as text rather than a
-- boolean: the console needs to say "because NXT Move manages your surveys",
-- and the audit log needs to record which door someone came through.
-- ----------------------------------------------------------------------------
create or replace function public.field_authority(p_org_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then return null; end if;
  v_role := my_role();

  -- Their own house first: the common case should not depend on a tier.
  if exists (
    select 1 from org_members m
     where m.org_id = p_org_id and m.user_id = v_uid and m.status = 'active'
  ) then return 'own_organisation'; end if;

  -- A network may act for a member that said it could. Note manages_surveys,
  -- NOT shares_index — seeing a number and speaking for a ministry are
  -- different permissions and are deliberately not bundled.
  if exists (
    select 1
      from network_members nm
      join network_members_users nu on nu.network_id = nm.network_id
     where nm.org_id = p_org_id
       and nm.manages_surveys
       and nu.user_id = v_uid
       and nu.status = 'active'
  ) then return 'network_delegated'; end if;

  if v_role = 'admin'  then return 'administrator'; end if;
  if v_role = 'collab' then return 'collab';        end if;

  return null;
end;
$$;

grant execute on function public.field_authority(uuid) to authenticated;

-- Fielding for someone else leaves a trace. Same discipline as view_as_log:
-- acting on a ministry's behalf is a normal thing to need and an abnormal
-- thing to do quietly.
create table if not exists public.campaign_action_log (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references public.app_users(id),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  authority  text not null,
  action     text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
alter table public.campaign_action_log enable row level security;

-- ----------------------------------------------------------------------------
-- 4 · campaign_upsert — the one entry point.
--
-- Every tier's "set up a survey" ends here. The tier check happens inside the
-- function body, never in the client, so a surface cannot forget it.
-- ----------------------------------------------------------------------------
create or replace function public.campaign_upsert(
  p_org_short_name  text,
  p_audience        text default 'community',
  p_item_set        text default 'core',
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
  v_slug   text;
begin
  if p_audience not in ('community', 'public') then
    raise exception 'audience must be community or public';
  end if;
  if p_item_set not in ('full', 'core') then
    raise exception 'item set must be full or core';
  end if;

  select * into v_org from organisations o
   where o.short_name = lower(btrim(p_org_short_name));
  if not found then raise exception 'organisation not found'; end if;

  v_auth := field_authority(v_org.id);
  if v_auth is null then
    raise exception 'not authorised to field for "%"', v_org.short_name;
  end if;

  -- A wave, if adopted, fixes the shape. That is the entire point of a wave:
  -- the organisation does not get to keep its own item set and still claim to
  -- be part of the season.
  if p_wave_short_name is not null then
    select * into v_wave from waves w where w.short_name = lower(btrim(p_wave_short_name));
    if not found then raise exception 'wave not found'; end if;
    if v_wave.is_demo <> v_org.is_demo then
      raise exception 'a % wave cannot be adopted by a % organisation',
        case when v_wave.is_demo then 'sandbox' else 'live' end,
        case when v_org.is_demo  then 'sandbox' else 'live' end;
    end if;
    if p_audience <> all (v_wave.audiences) then
      raise exception 'wave "%" does not field the % audience', v_wave.short_name, p_audience;
    end if;
    v_iv       := v_wave.instrument_version_id;
    p_item_set := v_wave.item_set;
  else
    select id into v_iv from instrument_versions where status = 'active'
     order by created_at desc limit 1;
    if v_iv is null then
      raise exception 'no active instrument version — run npm run db:seed first';
    end if;
  end if;

  -- One campaign per organisation per audience. The two links are two
  -- campaigns off one instrument, which is what makes them comparable.
  v_slug := case when p_audience = 'public' then 'open' else 'default' end;

  insert into campaigns as c
    (org_id, slug, instrument_version_id, locale, active, source_label, item_set, audience)
  values
    (v_org.id, v_slug, v_iv, p_locale, true, p_source_label, p_item_set, p_audience)
  on conflict (org_id, slug) do update
     set instrument_version_id = excluded.instrument_version_id,
         locale                = excluded.locale,
         item_set              = excluded.item_set,
         audience              = excluded.audience,
         active                = true
  returning c.id into v_camp;

  if v_wave.id is not null then
    insert into wave_adoptions (wave_id, org_id, campaign_id, adopted_by)
    values (v_wave.id, v_org.id, v_camp, auth.uid())
    on conflict (wave_id, org_id) do update set campaign_id = excluded.campaign_id;
  end if;

  -- Only log when someone acted for a house that is not their own. Logging a
  -- youth pastor editing their own survey would bury the entries that matter.
  if v_auth <> 'own_organisation' then
    insert into campaign_action_log (actor, org_id, authority, action, detail)
    values (auth.uid(), v_org.id, v_auth, 'campaign_upsert',
            jsonb_build_object('audience', p_audience, 'item_set', p_item_set,
                               'wave', v_wave.short_name));
  end if;

  return jsonb_build_object(
    'campaign_id', v_camp,
    'authority',   v_auth,
    'audience',    p_audience,
    'item_set',    p_item_set,
    'links',       org_links(v_org.short_name)
  );
end;
$$;

grant execute on function public.campaign_upsert(text, text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5 · wave_upsert — convening.
-- ----------------------------------------------------------------------------
create or replace function public.wave_upsert(
  p_short_name   text,
  p_name         text,
  p_item_set     text default 'core',
  p_audiences    text[] default array['community','public']::text[],
  p_locales      text[] default array['en']::text[],
  p_opens_on     date default null,
  p_closes_on    date default null,
  p_network      text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role text := my_role(); v_net public.networks%rowtype; v_iv uuid; v_id uuid;
begin
  if v_role not in ('admin', 'collab') and p_network is null then
    raise exception 'only the Collab or an administrator may convene coalition-wide';
  end if;

  if p_network is not null then
    select * into v_net from networks n where n.short_name = lower(btrim(p_network));
    if not found then raise exception 'network not found'; end if;
    if v_role <> 'admin' and not exists (
      select 1 from network_members_users u
       where u.network_id = v_net.id and u.user_id = auth.uid() and u.status = 'active'
    ) then raise exception 'not authorised for this network'; end if;
  end if;

  select id into v_iv from instrument_versions where status = 'active'
   order by created_at desc limit 1;
  if v_iv is null then raise exception 'no active instrument version'; end if;

  insert into waves as w
    (short_name, name, instrument_version_id, item_set, audiences, locales,
     opens_on, closes_on, convened_by_network_id, convened_by)
  values
    (lower(btrim(p_short_name)), p_name, v_iv, p_item_set, p_audiences, p_locales,
     p_opens_on, p_closes_on, v_net.id, auth.uid())
  on conflict (short_name) do update
     set name       = excluded.name,
         item_set   = excluded.item_set,
         audiences  = excluded.audiences,
         locales    = excluded.locales,
         opens_on   = excluded.opens_on,
         closes_on  = excluded.closes_on
  returning w.id into v_id;

  return jsonb_build_object('wave_id', v_id, 'short_name', lower(btrim(p_short_name)));
end;
$$;

grant execute on function public.wave_upsert(text, text, text, text[], text[], date, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6 · my_context — what the console needs to route.
--
-- One round trip on load: who am I, what tier, and which houses am I inside.
-- Without this the console would have to guess its own shape from failures.
-- ----------------------------------------------------------------------------
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
               'short_name', o.short_name, 'name', o.name, 'is_demo', o.is_demo)
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

-- ----------------------------------------------------------------------------
-- 7 · Band A at the other three tiers.
--
-- A worklist, not a dashboard: every row is something waiting on a person. If
-- one of these returns empty, nobody is blocked — which is why they are
-- allowed to be empty and the other bands are not.
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
                                    'is_demo', v_org.is_demo),
    'responses', v_n,
    'links',     org_links(v_org.short_name),
    'items',     v_items
  );
end;
$$;

create or replace function public.network_worklist(p_short_name text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_net public.networks%rowtype; v_items jsonb := '[]'::jsonb; v_c bigint;
begin
  select * into v_net from networks n where n.short_name = lower(btrim(p_short_name));
  if not found then raise exception 'network not found'; end if;
  if my_role() <> 'admin' and not exists (
    select 1 from network_members_users u
     where u.network_id = v_net.id and u.user_id = auth.uid() and u.status = 'active'
  ) then raise exception 'not authorised for this network'; end if;

  select count(*) into v_c from network_members nm
    where nm.network_id = v_net.id
      and not exists (select 1 from campaigns c where c.org_id = nm.org_id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high', 'label', v_c || ' member' || case when v_c = 1 then '' else 's' end
        || ' have not fielded', 'action', 'Send the link');
  end if;

  select count(*) into v_c from network_members nm
    where nm.network_id = v_net.id and not nm.shares_index;
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'low', 'label', v_c || ' member' || case when v_c = 1 then ' has' else 's have' end
        || ' not consented to share upward — you see them in the aggregate only',
      'action', 'Ask');
  end if;

  -- The network itself is an organisation only once it has chosen to be one.
  if not exists (
    select 1 from network_members nm join organisations o on o.id = nm.org_id
     where nm.network_id = v_net.id and o.short_name <> v_net.short_name
       and o.name = v_net.name
  ) then
    v_items := v_items || jsonb_build_object(
      'urgency', 'low',
      'label', v_net.name || ' cannot field its own survey yet — it exists as a network, not an organisation',
      'action', 'Create it');
  end if;

  return jsonb_build_object(
    'network', jsonb_build_object('short_name', v_net.short_name, 'name', v_net.name,
                                  'kind', v_net.kind),
    'items',   v_items
  );
end;
$$;

create or replace function public.collab_worklist()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_gate int; v_c bigint;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  v_gate := setting_int('critical_mass_gate', 400);

  -- Coverage, not volume. The same sixty organisations spread across forty
  -- countries unlocks nothing; concentrated in ten it unlocks all ten. So the
  -- worklist ranks by who is CLOSEST to a benchmark, not by who has the most.
  v_items := (
    select coalesce(jsonb_agg(jsonb_build_object(
             'urgency', 'high',
             'label', x.country || ' is ' || (v_gate - x.completions)
                      || ' completions from its first benchmark',
             'meta', x.completions || ' / ' || v_gate,
             'action', 'See who can close it')
           order by x.completions desc), '[]'::jsonb)
      from (
        select s.country, count(*) as completions
          from sessions s
          join campaigns c on c.id = s.campaign_id
          join organisations o on o.id = c.org_id
         where s.completed and o.is_demo = false and s.country is not null
         group by s.country
        having count(*) < v_gate
      ) x
  );

  select count(*) into v_c
    from organisations o
   where o.is_demo = false
     and not exists (select 1 from campaigns c where c.org_id = o.id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high',
      'label', v_c || ' organisation' || case when v_c = 1 then '' else 's' end
        || ' joined and never fielded', 'action', 'Nudge');
  end if;

  return jsonb_build_object(
    'gate',  v_gate,
    'waves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', w.short_name, 'name', w.name, 'item_set', w.item_set,
               'audiences', w.audiences, 'opens_on', w.opens_on, 'closes_on', w.closes_on,
               'adopted', (select count(*) from wave_adoptions a where a.wave_id = w.id))
             order by w.created_at desc)
        from waves w where w.is_demo = false), '[]'::jsonb),
    'items', v_items
  );
end;
$$;

grant execute on function public.org_worklist(text)     to authenticated;
grant execute on function public.network_worklist(text) to authenticated;
grant execute on function public.collab_worklist()      to authenticated;

-- ----------------------------------------------------------------------------
-- 8 · The organisations a caller may field for. Powers step 00 of the wizard.
-- ----------------------------------------------------------------------------
create or replace function public.fieldable_orgs()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  v_role := my_role();

  return coalesce((
    select jsonb_agg(x order by x->>'name')
      from (
        select distinct on (o.id) jsonb_build_object(
                 'short_name', o.short_name,
                 'name',       o.name,
                 'is_demo',    o.is_demo,
                 'authority',  field_authority(o.id)) as x
          from organisations o
         where field_authority(o.id) is not null
           -- An administrator may field for anyone, but listing every sandbox
           -- organisation would bury the live ones that matter.
           and (v_role not in ('admin','collab') or o.is_demo = false)
      ) s), '[]'::jsonb);
end;
$$;

grant execute on function public.fieldable_orgs() to authenticated;
