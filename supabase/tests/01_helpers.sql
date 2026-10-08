-- Test helpers, applied after all migrations in CI (scripts/test-db.sh).
-- Each tests/db/*.sql file runs inside its own transaction and is rolled back.
create schema if not exists test;

-- Act as a signed-in user (null = anonymous visitor).
create or replace function test.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end $$;

-- A user with an app_users row and a platform role ('admin' | 'collab' | 'org').
create or replace function test.make_user(p_email text, p_role text default 'org') returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v, p_email);
  insert into public.app_users (id, email) values (v, p_email) on conflict (id) do nothing;
  update public.app_users set role = p_role where id = v;
  return v;
end $$;

-- A live (non-demo), active organisation with its default campaign.
create or replace function test.make_org(p_short text, p_attested boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.organisations (slug, name, short_name, is_demo)
  values (p_short, initcap(replace(p_short, '-', ' ')), p_short, false) returning id into v;
  update public.organisations set status = 'active' where id = v;
  if p_attested then
    update public.organisations
       set consent_attested_at = now(),
           consent_statement_version = (select value #>> '{}' from platform_settings where key = 'consent_statement_version')
     where id = v;
  end if;
  return v;
end $$;

-- Fail the test with a message unless the condition holds.
create or replace function test.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAILED: %', p_msg; end if;
end $$;

-- Expect a statement to raise; returns the error text.
create or replace function test.raises(p_sql text, p_like text default '%') returns text language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql;
  exception when others then
    v := sqlerrm;
    if v not like p_like then raise exception 'FAILED: raised "%" but expected like "%"', v, p_like; end if;
    return v;
  end;
  raise exception 'FAILED: expected an error from: %', p_sql;
end $$;

-- Let live writes through for the length of a test (0048 locks them).
create or replace function test.unlock() returns void language sql as $$
  update public.platform_settings set value = 'false'::jsonb where key = 'collection_locked';
$$;

-- A small instrument version used by data tests: one scored likert item per
-- tier in 'follow', one open_text item, one single_select item.
create or replace function test.make_instrument() returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.instrument_versions where version = 'vtest';
  if v is not null then return v; end if;
  insert into public.instrument_versions (version, scoring_version, status, definition)
  values ('vtest', 'v0.1.0', 'draft', '{}'::jsonb) returning id into v;
  insert into public.items (instrument_version_id, key, question_domain, tier, type, scored) values
    (v, 'f_exp', 'follow', 'exposure', 'likert_5', true),
    (v, 'f_res', 'follow', 'response', 'likert_5', true),
    (v, 'f_for', 'follow', 'formation', 'likert_5', true),
    (v, 'f_mul', 'follow', 'multiplication', 'likert_5', true),
    (v, 'who_is_jesus', 'screener', 'na', 'open_text', false),
    (v, 'orientation', 'screener', 'na', 'single_select', false);
  return v;
end $$;

-- The org's default campaign on the test instrument.
create or replace function test.campaign(p_org uuid) returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.campaigns where org_id = p_org and slug = 'default';
  if v is null then
    insert into public.campaigns (org_id, slug, instrument_version_id)
    values (p_org, 'default', test.make_instrument()) returning id into v;
  end if;
  return v;
end $$;

-- A completed session with answers, inserted directly (bypassing the RPCs).
create or replace function test.make_session(
  p_org uuid, p_age interval, p_city text default null, p_link uuid default null,
  p_text text default null, p_score numeric default 50, p_age_band text default '18_22',
  p_gender text default null, p_country text default 'Argentina'
) returns uuid language plpgsql as $$
declare v uuid; v_inst uuid := test.make_instrument();
begin
  insert into public.sessions (campaign_id, age_band, gender, country, city, locale, completed, created_at, distribution_link_id)
  values (test.campaign(p_org), p_age_band, p_gender, p_country, p_city, 'en', true, now() - p_age, p_link)
  returning id into v;
  insert into public.responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain, created_at)
  select v, i.id, i.key,
         case when i.type = 'open_text' then to_jsonb(p_text) else to_jsonb(3) end,
         case when i.scored then p_score end,
         i.tier, i.question_domain, now() - p_age + interval '1 minute'
    from public.items i
   where i.instrument_version_id = v_inst
     and (i.type <> 'open_text' or p_text is not null);
  return v;
end $$;

grant usage on schema test to public;
grant execute on all functions in schema test to public;

-- Run a statement the way the API would: session_user = authenticator,
-- role = authenticated, as p_user. Returns the error text, or null if it ran.
create or replace function test.via_api(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform test.login(p_user);
  execute 'set session authorization authenticator';
  execute 'set role authenticated';
  begin
    execute p_sql;
  exception when others then v := sqlerrm;
  end;
  execute 'reset role';
  execute 'reset session authorization';
  return v;
end $$;
