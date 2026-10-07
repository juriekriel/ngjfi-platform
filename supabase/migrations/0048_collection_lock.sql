-- ============================================================================
-- The Jesus Index — collection lock (migration 0048)
--
-- Until pilot readiness is signed off, the survey must run end to end — every
-- screen, every branch, the completion page — while NOTHING reaches the live
-- tables or the pooled results. "Everything works, but nothing is collected."
--
-- How:
--   1. platform_settings.collection_locked (true). Data, not code, like every
--      other gate. Unlocking is a reviewed migration that sets it to false —
--      never a toggle in the Supabase dashboard — so the moment real data
--      starts flowing is visible in the repo history.
--   2. collection_locked() FAILS CLOSED: if the setting is missing or
--      unreadable, collection stays locked.
--   3. The anonymous write RPCs check it AFTER their test-link branch, so test
--      links (0038) keep writing to test_sessions exactly as before:
--        start_session        → returns a fresh uuid, inserts nothing
--        save_response        → returns, writes nothing
--        set_session_context  → returns, writes nothing
--        finish_session       → returns, writes nothing
--        delete_response      → returns, writes nothing
--      Each returns success, so a phone's outbox drains cleanly instead of
--      retrying forever. A session started BEFORE a lock stops receiving
--      answers the moment the lock lands.
--   4. discard_session (0042) is deliberately NOT locked: deleting an
--      under-13's in-progress session must always work.
--   5. Belt and braces (the 0034/0042 trigger pattern): while locked, no live
--      session or response can be inserted for a non-demo organisation by any
--      path at all. Demo organisations are exempt so demo re-seeding works.
--
-- Bodies below are the current ones (start_session from 0044; the rest from
-- 0038) with only the lock guard added. Nothing about any respondent is
-- stored, read or exposed.
-- ============================================================================

insert into public.platform_settings (key, value, note) values
  ('collection_locked', 'true'::jsonb,
   'While true, the survey runs but no live session or answer is stored or pooled (migration 0048). Test links still record to test tables. Set to false ONLY by a migration, after pilot readiness is signed off (docs/PILOT_LAUNCH_CHECKLIST.md).')
on conflict (key) do nothing;

create or replace function public.collection_locked()
returns boolean language sql stable set search_path = public as $$
  -- Fails closed: a missing row means locked.
  select public.setting_bool('collection_locked', true);
$$;
grant execute on function public.collection_locked() to anon, authenticated;


-- ----------------------------------------------------------------------------
-- Write RPCs with the lock guard
-- ----------------------------------------------------------------------------
create or replace function public.start_session(
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
  -- Collection lock (0048): while locked, a live session is never written.
  -- The phone gets an id it can carry through the survey; nothing is stored.
  if public.collection_locked() then
    return gen_random_uuid();
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

CREATE OR REPLACE FUNCTION public.save_response(p_session_id uuid, p_item_key text, p_raw jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_item public.items%rowtype; v_iv uuid; v_norm numeric;
begin
  -- Test links (0038): answers to a test session go to test_responses, raw
  -- only — test answers are never normalised, scored or counted.
  if exists (select 1 from public.test_sessions where id = p_session_id) then
    insert into public.test_responses (session_id, item_key, raw)
    values (p_session_id, p_item_key, p_raw)
    on conflict (session_id, item_key) do update set raw = excluded.raw, updated_at = now();
    return;
  end if;
  -- Collection lock (0048): nothing reaches the live tables while locked.
  if public.collection_locked() then return; end if;
  select c.instrument_version_id into v_iv
  from sessions s join campaigns c on c.id = s.campaign_id
  where s.id = p_session_id;
  if v_iv is null then raise exception 'session not found'; end if;

  select * into v_item from items where instrument_version_id = v_iv and key = p_item_key;
  if not found then raise exception 'unknown item %', p_item_key; end if;

  v_norm := public.ngjfi_normalize(v_item.type, v_item.scored, v_item.reverse_scored, v_item.scale, p_raw);

  insert into responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain, branch)
  values (p_session_id, v_item.id, p_item_key, p_raw, v_norm, v_item.tier, v_item.question_domain, v_item.branch)
  on conflict (session_id, item_id)
    do update set raw_value = excluded.raw_value, normalized = excluded.normalized, branch = excluded.branch;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_session_context(p_session_id uuid, p_field text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Test links (0038)
  if exists (select 1 from public.test_sessions where id = p_session_id) then
    update public.test_sessions set context = context || jsonb_build_object(p_field, p_value) where id = p_session_id;
    return;
  end if;
  -- Collection lock (0048): nothing reaches the live tables while locked.
  if public.collection_locked() then return; end if;
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;

  if p_field not in ('age_band', 'country', 'gender', 'city') then
    raise exception 'field % is not settable from the survey', p_field;
  end if;

  if p_value is not null and length(p_value) > 64 then
    raise exception 'value too long for %', p_field;
  end if;

  if    p_field = 'age_band' then update sessions set age_band = p_value where id = p_session_id;
  elsif p_field = 'country'  then update sessions set country  = p_value where id = p_session_id;
  elsif p_field = 'gender'   then update sessions set gender   = p_value where id = p_session_id;
  elsif p_field = 'city'     then update sessions set city     = p_value where id = p_session_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Test links (0038)
  if exists (select 1 from public.test_sessions where id = p_session_id) then
    update public.test_sessions set completed = true where id = p_session_id;
    return;
  end if;
  -- Collection lock (0048): nothing reaches the live tables while locked.
  if public.collection_locked() then return; end if;
  update sessions set completed = true where id = p_session_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_response(p_session_id uuid, p_item_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Test links (0038)
  if exists (select 1 from public.test_sessions where id = p_session_id) then
    delete from public.test_responses where session_id = p_session_id and item_key = p_item_key;
    return;
  end if;
  -- Collection lock (0048): nothing reaches the live tables while locked.
  if public.collection_locked() then return; end if;
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;
  delete from responses where session_id = p_session_id and item_key = p_item_key;
end;
$function$;

-- ----------------------------------------------------------------------------
-- Belt and braces: no live row for a real organisation while locked
-- ----------------------------------------------------------------------------
create or replace function public.refuse_live_writes_while_locked()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_campaign uuid;
begin
  if not public.collection_locked() then return new; end if;
  if tg_table_name = 'sessions' then
    v_campaign := new.campaign_id;
  else
    select s.campaign_id into v_campaign from sessions s where s.id = new.session_id;
  end if;
  if exists (select 1 from campaigns c join organisations o on o.id = c.org_id
              where c.id = v_campaign and not coalesce(o.is_demo, false)) then
    raise exception 'collection is locked until pilot readiness is signed off';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_refuse_while_locked on public.sessions;
create trigger sessions_refuse_while_locked
  before insert on public.sessions
  for each row execute function public.refuse_live_writes_while_locked();

drop trigger if exists responses_refuse_while_locked on public.responses;
create trigger responses_refuse_while_locked
  before insert on public.responses
  for each row execute function public.refuse_live_writes_while_locked();
