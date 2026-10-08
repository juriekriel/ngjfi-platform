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
