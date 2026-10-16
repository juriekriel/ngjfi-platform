-- ============================================================================
-- The Jesus Index — admin platform controls + reserve /survey (migration 0060, Oct 2026)
--
-- 1. /survey is a new public page (the entire survey, read-only, generated
--    from the instrument). A static route shadows the [org] route, so no
--    organisation may claim the short name "survey" — its link would open
--    this page instead. Same pattern as 0057 (/see-a-demo).
--
-- 2. The Administrator console's "Console" tab gains the three controls the
--    console spec always drew but nothing could change without SQL:
--      critical_mass_gate          (org / region / city gate)
--      country_critical_mass_gate  (country gate)
--      publish_global_view         (the single switch that can overclaim)
--    They stay versioned config in platform_settings (CLAUDE.md #1, #3);
--    this only gives an administrator a logged way to move them.
--
--    Guard rails, all in the database:
--      · administrators only (my_role()), like set_org_status()
--      · an allow-list of keys — this is not a general settings editor
--      · gates are whole numbers ≥ 1
--      · publishing the global view is refused while the LIVE space has
--        fewer completed responses than critical_mass_gate. Sandbox (demo)
--        data never counts. Un-publishing is always allowed.
--      · every change is written to platform_settings_log with who, what,
--        old and new value — nothing about any respondent.
-- ============================================================================

insert into public.reserved_short_names (name, reason) values
  ('survey', 'site: /survey (the entire survey, read-only)')
on conflict (name) do nothing;

create table if not exists public.platform_settings_log (
  id          uuid primary key default gen_random_uuid(),
  actor       uuid references public.app_users(id),
  key         text not null,
  old_value   jsonb,
  new_value   jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.platform_settings_log enable row level security;
-- No policies: read only through admin_platform_controls() below.

-- ----------------------------------------------------------------------------
-- Read: the three settings, the live completed count beside them (the sample
-- size always sits next to the publish switch), and the last few changes.
-- ----------------------------------------------------------------------------
create or replace function public.admin_platform_controls()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'platform controls are for administrators';
  end if;
  return jsonb_build_object(
    'gate', setting_int('critical_mass_gate', 400),
    'country_gate', setting_int('country_critical_mass_gate', 2000),
    'global_view_published', setting_bool('publish_global_view', false),
    'live_completed', (
      select count(*)
        from sessions s
        join campaigns c on c.id = s.campaign_id
        join organisations o on o.id = c.org_id
       where s.completed and o.is_demo = false
    ),
    'log', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select l.key, l.old_value, l.new_value, l.created_at, u.email
          from platform_settings_log l
          left join auth.users u on u.id = l.actor
         order by l.created_at desc
         limit 5
      ) x
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.admin_platform_controls() to authenticated;

-- ----------------------------------------------------------------------------
-- Write: one allow-listed setting at a time, validated and logged.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_platform_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old  jsonb;
  v_live bigint;
  v_gate int;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can change platform settings';
  end if;
  if p_key not in ('critical_mass_gate', 'country_critical_mass_gate', 'publish_global_view') then
    raise exception '% is not a setting this control can change', p_key;
  end if;

  if p_key in ('critical_mass_gate', 'country_critical_mass_gate') then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> floor((p_value #>> '{}')::numeric)
       or (p_value #>> '{}')::numeric < 1 then
      raise exception 'a gate must be a whole number of at least 1';
    end if;
  else
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'publish_global_view must be true or false';
    end if;
    if (p_value #>> '{}')::boolean then
      v_gate := setting_int('critical_mass_gate', 400);
      select count(*) into v_live
        from sessions s
        join campaigns c on c.id = s.campaign_id
        join organisations o on o.id = c.org_id
       where s.completed and o.is_demo = false;
      if v_live < v_gate then
        raise exception 'the live space has % completed responses; the global view stays unpublished until it reaches the gate of %', v_live, v_gate;
      end if;
    end if;
  end if;

  select value into v_old from platform_settings where key = p_key;
  if v_old is not distinct from p_value then
    return admin_platform_controls();
  end if;

  insert into platform_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  insert into platform_settings_log (actor, key, old_value, new_value)
  values ((select id from app_users where id = auth.uid()), p_key, v_old, p_value);

  return admin_platform_controls();
end;
$$;
grant execute on function public.admin_set_platform_setting(text, jsonb) to authenticated;
