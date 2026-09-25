-- ============================================================================
-- The Jesus Index — test links and admin response deletion (migration 0038)
--
-- 1. TEST LINKS. A distribution link can be marked as a test link. Everything
--    answered through it is kept apart — in test_sessions / test_responses,
--    never in sessions / responses — so it can NEVER reach a score, a count,
--    the map, a benchmark or Collab Intelligence: every one of those reads
--    sessions and responses, and test data simply isn't there. Test answers
--    are kept raw (never normalised or scored) and deleted automatically
--    after test_retention_days (7 by default).
--
--    Only the five functions that WRITE a session change, each gaining one
--    branch at the very top (start_session, save_response,
--    set_session_context, finish_session, delete_response). Their existing
--    bodies are otherwise identical.
--
-- 2. ADMIN RESPONSE DELETION. admin_response_deletion() lets a Collab
--    administrator delete real responses for one organisation — by link
--    and/or time window — after previewing the count and confirming it
--    exactly. Every deletion is written to campaign_action_log. Organisations
--    cannot delete responses themselves: if a ministry could remove answers
--    it didn't like, the Index would lose its credibility.
-- ============================================================================

insert into public.platform_settings (key, value, note) values
  ('test_retention_days', '7'::jsonb, 'Days a test link''s answers are kept before automatic deletion (migration 0038).')
on conflict (key) do nothing;

alter table public.distribution_links add column if not exists is_test boolean not null default false;

create table if not exists public.test_sessions (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.distribution_links(id) on delete cascade,
  org_id     uuid not null references public.organisations(id) on delete cascade,
  locale     text,
  context    jsonb not null default '{}'::jsonb,
  completed  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_test_sessions_link on public.test_sessions(link_id);
create index if not exists idx_test_sessions_created on public.test_sessions(created_at);

create table if not exists public.test_responses (
  session_id uuid not null references public.test_sessions(id) on delete cascade,
  item_key   text not null,
  raw        jsonb,
  updated_at timestamptz not null default now(),
  primary key (session_id, item_key)
);

alter table public.test_sessions enable row level security;
alter table public.test_responses enable row level security;
-- No policies: written and read only through the functions in this file.


-- Automatic deletion. Called on every test session start (cheap: indexed),
-- and by an administrator at will.
create or replace function public.purge_expired_test_data()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from test_sessions
   where created_at < now() - make_interval(days => setting_int('test_retention_days', 7));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- Mark a link as a test link (or back), while it has no real responses.
-- Once real answers have come through a link, it can't become a test link:
-- that would silently change what those answers are.
create or replace function public.set_link_test(p_org_slug text, p_link_id uuid, p_is_test boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null or not exists (
    select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;
  if not exists (select 1 from distribution_links where id = p_link_id and org_id = v_org) then
    raise exception 'link not found';
  end if;
  if p_is_test and exists (select 1 from sessions where distribution_link_id = p_link_id) then
    raise exception 'this link already has real responses, so it can''t become a test link — make a new test link instead';
  end if;
  if not p_is_test and exists (select 1 from test_sessions where link_id = p_link_id) then
    raise exception 'this test link has test answers; delete them first or make a new link';
  end if;
  update distribution_links set is_test = p_is_test where id = p_link_id;
  return jsonb_build_object('id', p_link_id, 'is_test', p_is_test);
end;
$$;

grant execute on function public.set_link_test(text, uuid, boolean) to authenticated;


-- Which of an organisation's links are test links, and how many test
-- answers each holds right now (counts only).
create or replace function public.org_test_links(p_org_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null or not exists (
    select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;
  return coalesce((
    select jsonb_object_agg(dl.id, jsonb_build_object(
      'started', (select count(*) from test_sessions t where t.link_id = dl.id),
      'completed', (select count(*) from test_sessions t where t.link_id = dl.id and t.completed),
      'retention_days', setting_int('test_retention_days', 7)))
    from distribution_links dl where dl.org_id = v_org and dl.is_test
  ), '{}'::jsonb);
end;
$$;

grant execute on function public.org_test_links(text) to authenticated;


-- Administrator: preview, then delete, real responses for one organisation.
--   Scope: a link (p_link_slug), a time window (p_from AND p_to), or both.
--   Never the whole organisation by accident: one of the two is required.
--   Call once with p_confirm = null to preview; call again with p_confirm set
--   to the previewed session count to delete. If the count has changed in
--   between (someone answered), nothing is deleted and the new count returns.
create or replace function public.admin_response_deletion(
  p_short_name text,
  p_link_slug  text default null,
  p_from       timestamptz default null,
  p_to         timestamptz default null,
  p_confirm    int default null,
  p_reason     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org organisations%rowtype;
  v_link uuid;
  v_sessions int; v_responses int; v_first timestamptz; v_last timestamptz;
  v_deleted int;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can delete responses'; end if;
  select * into v_org from organisations where short_name = lower(btrim(p_short_name));
  if not found then raise exception 'no organisation with short name %', p_short_name; end if;

  if p_link_slug is not null then
    select id into v_link from distribution_links where org_id = v_org.id and slug = p_link_slug;
    if v_link is null then raise exception 'no link % on %', p_link_slug, v_org.short_name; end if;
  end if;
  if v_link is null and (p_from is null or p_to is null) then
    raise exception 'choose a link, or a start and end time — never the whole organisation at once';
  end if;
  if p_from is not null and p_to is not null and p_to <= p_from then
    raise exception 'the end time must be after the start time';
  end if;

  select count(*), min(s.created_at), max(s.created_at)
    into v_sessions, v_first, v_last
    from sessions s join campaigns c on c.id = s.campaign_id
   where c.org_id = v_org.id
     and (v_link is null or s.distribution_link_id = v_link)
     and (p_from is null or s.created_at >= p_from)
     and (p_to   is null or s.created_at <  p_to);

  select count(*) into v_responses
    from responses r join sessions s on s.id = r.session_id join campaigns c on c.id = s.campaign_id
   where c.org_id = v_org.id
     and (v_link is null or s.distribution_link_id = v_link)
     and (p_from is null or s.created_at >= p_from)
     and (p_to   is null or s.created_at <  p_to);

  if p_confirm is null or p_confirm <> v_sessions then
    return jsonb_build_object('preview', true, 'sessions', v_sessions, 'answers', v_responses,
                              'first', v_first, 'last', v_last,
                              'changed', p_confirm is not null and p_confirm <> v_sessions);
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'say why these responses are being deleted — it goes in the action log'; end if;

  delete from sessions s using campaigns c
   where s.campaign_id = c.id and c.org_id = v_org.id
     and (v_link is null or s.distribution_link_id = v_link)
     and (p_from is null or s.created_at >= p_from)
     and (p_to   is null or s.created_at <  p_to);
  get diagnostics v_deleted = row_count;

  insert into campaign_action_log (actor, org_id, authority, action, detail)
  values (auth.uid(), v_org.id, 'admin', 'delete_responses', jsonb_build_object(
    'link', p_link_slug, 'from', p_from, 'to', p_to,
    'sessions', v_deleted, 'answers', v_responses, 'reason', btrim(p_reason)));

  return jsonb_build_object('preview', false, 'deleted_sessions', v_deleted, 'deleted_answers', v_responses);
end;
$$;

grant execute on function public.admin_response_deletion(text, text, timestamptz, timestamptz, int, text) to authenticated;


-- Administrator: delete an organisation's test answers now (logged).
create or replace function public.admin_purge_test_data(p_short_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_n int;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can delete test answers'; end if;
  select id into v_org from organisations where short_name = lower(btrim(p_short_name));
  if v_org is null then raise exception 'no organisation with short name %', p_short_name; end if;
  delete from test_sessions where org_id = v_org;
  get diagnostics v_n = row_count;
  insert into campaign_action_log (actor, org_id, authority, action, detail)
  values (auth.uid(), v_org, 'admin', 'purge_test_data', jsonb_build_object('test_sessions', v_n));
  return jsonb_build_object('deleted_test_sessions', v_n);
end;
$$;

grant execute on function public.admin_purge_test_data(text) to authenticated;



-- Administrator: an organisation's links with their real and test counts,
-- for the deletion tool's link picker.
create or replace function public.admin_org_links(p_short_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can list an organisation''s links here'; end if;
  select id into v_org from organisations where short_name = lower(btrim(p_short_name));
  if v_org is null then raise exception 'no organisation with short name %', p_short_name; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', dl.slug, 'name', dl.name, 'is_test', dl.is_test,
      'real', (select count(*) from sessions s where s.distribution_link_id = dl.id),
      'test', (select count(*) from test_sessions t where t.link_id = dl.id)
    ) order by dl.created_at desc)
    from distribution_links dl where dl.org_id = v_org
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_org_links(text) to authenticated;

-- ── the five write functions, each with its test-link branch ─────────────
-- start_session: unchanged except for the test-link branch at the top of its body.
CREATE OR REPLACE FUNCTION public.start_session(p_campaign_id uuid, p_age_band text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_locale text DEFAULT 'en'::text, p_consent jsonb DEFAULT '{}'::jsonb, p_distribution_link_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
  v_org_status text;
  v_org_id uuid;
  v_link_id uuid;
  v_now timestamptz := now();
begin
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
                jsonb_strip_nulls(jsonb_build_object('age_band', p_age_band, 'country', p_country)))
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

  insert into sessions (campaign_id, age_band, country, locale, consent, distribution_link_id)
  values (p_campaign_id, p_age_band, p_country,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb), v_link_id)
  returning id into new_id;
  return new_id;
end;
$function$;


-- save_response: unchanged except for the test-link branch at the top of its body.
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


-- set_session_context: unchanged except for the test-link branch at the top of its body.
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


-- finish_session: unchanged except for the test-link branch at the top of its body.
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
  update sessions set completed = true where id = p_session_id;
end;
$function$;


-- delete_response: unchanged except for the test-link branch at the top of its body.
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
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;
  delete from responses where session_id = p_session_id and item_key = p_item_key;
end;
$function$;
