-- ============================================================================
-- NGJFI platform — functions & RPCs (migration 0002)
--  * ngjfi_normalize      : 0–100 normalisation, mirrors src/lib/scoring.ts
--  * start_session/save_response/finish_session : anonymous respondent writes
--  * join_org_by_domain   : ministry verification by website-domain email match
--  * org_dashboard        : aggregates only, membership-gated (never raw rows)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Normalisation (kept in lockstep with the TypeScript engine)
-- ----------------------------------------------------------------------------
create or replace function public.ngjfi_normalize(
  p_type text, p_scored boolean, p_reverse boolean, p_scale jsonb, p_raw jsonb
) returns numeric
language plpgsql immutable as $$
declare base numeric; v numeric; points int; s text;
begin
  if not p_scored or p_raw is null then return null; end if;

  if p_type = 'likert_5' then
    begin v := (p_raw #>> '{}')::numeric; exception when others then return null; end;
    if v is null or v < 1 or v > 5 then return null; end if;
    base := ((v - 1) / 4.0) * 100;

  elsif p_type = 'yes_no' then
    s := lower(trim(both '"' from p_raw::text));
    if s in ('true','1','yes') then base := 100;
    elsif s in ('false','0','no') then base := 0;
    else return null; end if;

  elsif p_type = 'frequency' then
    points := coalesce((p_scale ->> 'points')::int, 4);
    if points < 2 then return null; end if;
    begin v := (p_raw #>> '{}')::numeric; exception when others then return null; end;
    if v is null or v < 0 or v > points - 1 or v <> floor(v) then return null; end if;
    base := (v / (points - 1)) * 100;

  else
    return null; -- single_select / multi_select / screener are diagnostic
  end if;

  if p_reverse then base := 100 - base; end if;
  return round(base, 4);
end;
$$;

-- ----------------------------------------------------------------------------
-- Anonymous respondent writes (SECURITY DEFINER; validated; no PII)
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
declare new_id uuid;
begin
  if not exists (select 1 from campaigns c where c.id = p_campaign_id and c.active) then
    raise exception 'campaign not found or inactive';
  end if;
  insert into sessions (campaign_id, age_band, gender, country, city, locale, consent)
  values (p_campaign_id, p_age_band, p_gender, p_country, p_city,
          coalesce(p_locale,'en'), coalesce(p_consent,'{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.save_response(
  p_session_id uuid, p_item_key text, p_raw jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_item public.items%rowtype; v_iv uuid; v_norm numeric;
begin
  select c.instrument_version_id into v_iv
  from sessions s join campaigns c on c.id = s.campaign_id
  where s.id = p_session_id;
  if v_iv is null then raise exception 'session not found'; end if;

  select * into v_item from items where instrument_version_id = v_iv and key = p_item_key;
  if not found then raise exception 'unknown item %', p_item_key; end if;

  v_norm := public.ngjfi_normalize(v_item.type, v_item.scored, v_item.reverse_scored, v_item.scale, p_raw);

  insert into responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain)
  values (p_session_id, v_item.id, p_item_key, p_raw, v_norm, v_item.tier, v_item.question_domain)
  on conflict (session_id, item_id)
    do update set raw_value = excluded.raw_value, normalized = excluded.normalized;
end;
$$;

create or replace function public.finish_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update sessions set completed = true where id = p_session_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ministry verification: claim/join an org using a confirmed website-domain email
--  (the email is already confirmed by Supabase Auth; here we match its domain)
-- ----------------------------------------------------------------------------
create or replace function public.join_org_by_domain(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_email_domain text;
  v_org public.organisations%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'no email on account'; end if;
  v_email_domain := lower(split_part(v_email, '@', 2));

  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if v_org.website_domain is null then raise exception 'organisation has no website domain set'; end if;

  -- accept exact match or a subdomain of the ministry's domain
  if lower(v_org.website_domain) <> v_email_domain
     and v_email_domain not like ('%.' || lower(v_org.website_domain)) then
    return jsonb_build_object(
      'ok', false, 'reason', 'email_domain_mismatch',
      'email_domain', v_email_domain, 'expected', lower(v_org.website_domain));
  end if;

  insert into app_users (id, email) values (v_uid, v_email)
    on conflict (id) do update set email = excluded.email;

  insert into org_members (org_id, user_id, role)
  values (v_org.id, v_uid, 'org_admin')
  on conflict (org_id, user_id) do nothing;

  update organisations set verified = true where id = v_org.id;

  return jsonb_build_object('ok', true, 'org_id', v_org.id, 'role', 'org_admin');
end;
$$;

-- ----------------------------------------------------------------------------
-- Org dashboard: AGGREGATES ONLY, membership-gated. Never returns raw responses.
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_tiers jsonb; v_domains jsonb; v_index numeric; v_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m
    where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select
    (select count(*) from r),
    (select jsonb_object_agg(tier, m) from
        (select tier, round(avg(normalized),1) as m from r group by tier) t),
    (select jsonb_object_agg(question_domain, m) from
        (select question_domain, round(avg(normalized),1) as m from r group by question_domain) d)
  into v_n, v_tiers, v_domains;

  select round(avg(value::numeric),1) into v_index
  from jsonb_each_text(coalesce(v_tiers, '{}'::jsonb))
  where key in ('exposure','response','formation','multiplication');

  return jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', coalesce(v_n, 0),
    'index', v_index,
    'tiers', coalesce(v_tiers, '{}'::jsonb),
    'domains', coalesce(v_domains, '{}'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function public.start_session(uuid,text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.save_response(uuid,text,jsonb) to anon, authenticated;
grant execute on function public.finish_session(uuid) to anon, authenticated;
grant execute on function public.join_org_by_domain(text) to authenticated;
grant execute on function public.org_dashboard(text) to authenticated;
