-- ============================================================================
-- collab_overview() — the figures behind the Collab console's four tiles
-- (migration 0032)
--
-- The Collab console moved from five stacked bands to the same tile layout
-- the Administrator console uses: Organisations · Surveys sent out · Collab
-- Intelligence · Development. collab_worklist() (0022) only returns the gate,
-- the waves and the coverage worklist, so two tiles had nothing to read:
--
--   organisations  every LIVE organisation taking part — name, country,
--                  activation status, whether it is fielding right now.
--                  A roster, not a reading: no score, no response count per
--                  organisation, so nothing here is a per-member figure that
--                  network/member consent (0013) would need to govern.
--   surveys        started sessions, completed sessions, and the same two
--                  counts per survey language (sessions.locale). Counts only.
--                  A session is one anonymous respondent's pass through the
--                  survey — "unique respondents" in the UI means exactly
--                  this, never a person-level identity (none is held).
--   development    the active instrument version and the three platform
--                  settings that change the meaning of every number: the
--                  org/region gate, the country gate, and the global-view
--                  publish switch. Read-only here; editing stays with the
--                  administrator and the researchers.
--
-- Live space only (o.is_demo = false), enforced inside the SECURITY DEFINER
-- body, never left to the caller — same pattern as platform_totals() (0030).
-- Gates are read from platform_settings via setting_int()/setting_bool(), so
-- they stay versioned config (CLAUDE.md non-negotiable #3).
--
-- Additive: no table changes, no existing function redefined.
-- ----------------------------------------------------------------------------
create or replace function public.collab_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  with live_sessions as (
    select s.id, coalesce(s.locale, 'en') as locale, s.completed
      from sessions s
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
     where o.is_demo = false
  )
  select jsonb_build_object(
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', o.short_name,
               'name',       o.name,
               'country',    o.country,
               'status',     o.status,
               'fielding',   exists (select 1 from campaigns c where c.org_id = o.id and c.active))
             order by o.name)
        from organisations o
       where o.is_demo = false), '[]'::jsonb),

    'surveys', jsonb_build_object(
      'started',   (select count(*) from live_sessions),
      'completed', (select count(*) from live_sessions where completed),
      'languages', coalesce((
        select jsonb_agg(jsonb_build_object('locale', l.locale, 'started', l.started, 'completed', l.completed)
                         order by l.started desc, l.locale)
          from (
            select locale, count(*) as started, count(*) filter (where completed) as completed
              from live_sessions
             group by locale
          ) l), '[]'::jsonb)
    ),

    'development', jsonb_build_object(
      'instrument', (
        select jsonb_build_object(
                 'version', iv.version,
                 'status',  iv.status,
                 'items',   (select count(*) from items i where i.instrument_version_id = iv.id))
          from instrument_versions iv
         where iv.status = 'active'
         limit 1),
      'gate',                  setting_int('critical_mass_gate', 400),
      'country_gate',          setting_int('country_critical_mass_gate', 2000),
      'global_view_published', setting_bool('publish_global_view', false)
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.collab_overview() is
  'Collab/admin console tiles: live organisation roster, session start/completion counts (total and per locale), and the read-only instrument + gate settings. Counts and config only — no scores, no per-organisation readings.';

revoke all on function public.collab_overview() from public, anon;
grant execute on function public.collab_overview() to authenticated;
