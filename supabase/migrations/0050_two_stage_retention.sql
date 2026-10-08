-- ============================================================================
-- The Jesus Index — two-stage retention (migration 0050)
--
-- Researcher guidance (Dr. Matthew Niermann, 7 Oct 2026): rows that still
-- carry pseudo-markers — exact timestamps, free text, fine location — should
-- be kept only as long as quality checks need them (~60 days). Rows stripped
-- of them can be kept on a 5-year cycle for validation, re-scoring and the
-- first research findings. Then only grouped totals remain (0019/0041 purge).
--
-- Stage 1 — DE-IDENTIFY at N days (respondent_deidentify_after_days = 60):
--   * sessions.created_at → truncated to the grain (deidentify_time_grain,
--     'month' default, 'quarter' allowed); every response of that session
--     gets the same value, so no per-answer time survives.
--   * sessions.city → deleted. (Country is kept: it is coarse, it is what the
--     2,000 country gate reports on, and region is derived from the org.)
--   * free text — every response to an item whose type is 'open_text'
--     (driven by the item's type, never a key list):
--       'delete'           → raw_value nulled
--       'code_then_delete' → copied to free_text_holding (item key + month,
--                            NO session id, NO org) for researcher coding,
--                            then nulled; holding rows are purged after
--                            free_text_holding_days.
--   * sessions.distribution_link_id → nulled when deidentify_fold_room_links
--     is true (default): the room becomes the organisation's campaign. Room
--     dashboards then show the last N days; older answers still count in the
--     organisation's dashboard. Set false to keep room history (a decision
--     for researchers + counsel; it keeps a finer grouping on the raw rows).
--   * sessions.consent → nulled (nothing writes it today; belt and braces).
--   * sessions.deidentified_at = now().
--   Demo organisations are exempt (synthetic sandbox data).
--
-- Stage 2 — PURGE at respondent_retention_months (now set: 60). The 0042
--   public purge refuses to run while anything older than its cutoff is
--   still identifiable: it de-identifies first, then folds and deletes.
--
-- Scheduling: pg_cron, daily 02:00 UTC, when the extension is available
-- (Supabase: Database → Extensions → pg_cron). pilot_readiness() turns red
-- if anything is more than a day past the window — a stalled job shows up.
--
-- Trade-offs recorded: season filters compare session dates; after stage 1 a
-- session is dated to the first of its month, so a season that starts
-- mid-month will no longer include that month's older sessions. And the
-- 60-month purge measures from that truncated date, so a row can be purged
-- up to one grain (a month or a quarter) before its exact fifth anniversary.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Settings (data, not code)
-- ----------------------------------------------------------------------------
insert into public.platform_settings (key, value, note) values
  ('respondent_deidentify_after_days', '60'::jsonb,
   'Days a session keeps its pseudo-markers (exact time, city, free text, room link) before deidentify_stale_sessions() removes them. Researcher guidance 7 Oct 2026. Migration 0050.'),
  ('deidentify_time_grain', '"month"'::jsonb,
   'What a de-identified timestamp is truncated to: "month" or "quarter". Migration 0050.'),
  ('deidentify_free_text', '"delete"'::jsonb,
   'At de-identification, free-text answers are "delete"d, or "code_then_delete" (copied to free_text_holding without any session or org link, then deleted from the response). Migration 0050.'),
  ('deidentify_fold_room_links', 'true'::jsonb,
   'At de-identification, fold a session''s room link into its campaign (true) or keep it (false). Migration 0050.'),
  ('free_text_holding_days', '90'::jsonb,
   'Days free text copied for coding stays in free_text_holding before it is purged. Migration 0050.')
on conflict (key) do nothing;

-- The 5-year cycle. Only fills the 0042 placeholder; never overrides a decision.
update public.platform_settings
   set value = '60'::jsonb,
       note  = 'Months a de-identified session is kept before purge_stale_respondent_data() folds it into aggregates and deletes it. 60 = the 5-year cycle (researcher guidance 7 Oct 2026). Migration 0050.'
 where key = 'respondent_retention_months'
   and (value is null or jsonb_typeof(value) <> 'number');

-- ----------------------------------------------------------------------------
-- 2. Schema
-- ----------------------------------------------------------------------------
alter table public.sessions add column if not exists deidentified_at timestamptz;
comment on column public.sessions.deidentified_at is
  'When deidentify_stale_sessions() removed this session''s pseudo-markers (exact time, city, free text, room link). Null = still within the first window. Migration 0050.';
create index if not exists sessions_pending_deidentify_idx
  on public.sessions (created_at) where deidentified_at is null;

create table if not exists public.free_text_holding (
  id             uuid primary key default gen_random_uuid(),
  item_key       text not null,
  text           text not null,
  captured_month date not null,
  created_at     timestamptz not null default now()
);
comment on table public.free_text_holding is
  'Free-text answers copied at de-identification for researcher coding, only when deidentify_free_text = code_then_delete. Deliberately carries no session, org or link id. Purged after free_text_holding_days. Migration 0050.';
alter table public.free_text_holding enable row level security;
-- No policies: read only by administrators through SQL / a future coding tool.

-- ----------------------------------------------------------------------------
-- 3. Who may run it: an administrator, the service role, or the database
--    itself (pg_cron runs as postgres). security definer changes
--    current_user, so the check uses session_user and the JWT role.
-- ----------------------------------------------------------------------------
create or replace function public._retention_caller_ok()
returns boolean language sql stable set search_path = public as $$
  select my_role() = 'admin'
      or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin');
$$;
revoke all on function public._retention_caller_ok() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Stage 1 — de-identify
-- ----------------------------------------------------------------------------
create or replace function public.deidentify_stale_sessions()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_days  int     := setting_int('respondent_deidentify_after_days', 60);
  v_grain text    := coalesce((select value #>> '{}' from platform_settings where key = 'deidentify_time_grain'), 'month');
  v_text  text    := coalesce((select value #>> '{}' from platform_settings where key = 'deidentify_free_text'), 'delete');
  v_fold  boolean := setting_bool('deidentify_fold_room_links', true);
  v_hold  int     := setting_int('free_text_holding_days', 90);
  v_cut   timestamptz := now() - make_interval(days => v_days);
  v_sessions int := 0; v_texts int := 0; v_held int := 0; v_held_purged int := 0;
begin
  if not _retention_caller_ok() then
    raise exception 'only an administrator or the scheduled job can de-identify respondent data';
  end if;
  if v_grain not in ('month', 'quarter') then
    raise exception 'deidentify_time_grain must be "month" or "quarter", not "%"', v_grain;
  end if;
  if v_text not in ('delete', 'code_then_delete') then
    raise exception 'deidentify_free_text must be "delete" or "code_then_delete", not "%"', v_text;
  end if;

  drop table if exists _deid;
  drop table if exists _ft;
  create temporary table _deid on commit drop as
    select s.id, s.created_at
      from sessions s
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
     where s.deidentified_at is null
       and s.created_at < v_cut
       and not o.is_demo;

  select count(*) into v_sessions from _deid;

  if v_sessions > 0 then
    -- free text: by the item's type, never a key list
    create temporary table _ft on commit drop as
      select r.id, r.item_key, r.raw_value #>> '{}' as txt, d.created_at,
             -- place answers (country, city: section 'demographic') are never held for coding
             coalesce((select i.section from items i where i.id = r.item_id),
                      (select i.section from items i where i.key = r.item_key limit 1)) as section
        from responses r
        join _deid d on d.id = r.session_id
       where r.raw_value is not null
         and jsonb_typeof(r.raw_value) = 'string'
         and (exists (select 1 from items i where i.id = r.item_id and i.type = 'open_text')
              or (r.item_id is null and exists (select 1 from items i where i.key = r.item_key and i.type = 'open_text')));

    if v_text = 'code_then_delete' then
      insert into free_text_holding (item_key, text, captured_month)
      select item_key, txt, date_trunc(v_grain, created_at)::date from _ft
       where nullif(btrim(txt), '') is not null and section is distinct from 'demographic';
      get diagnostics v_held = row_count;
    end if;

    update responses r set raw_value = null from _ft f where r.id = f.id;
    get diagnostics v_texts = row_count;

    -- one coarse time for the session and every answer in it
    update responses r
       set created_at = date_trunc(v_grain, d.created_at)
      from _deid d where r.session_id = d.id;

    update sessions s
       set created_at           = date_trunc(v_grain, d.created_at),
           city                 = null,
           consent              = null,
           distribution_link_id = case when v_fold then null else s.distribution_link_id end,
           deidentified_at      = now()
      from _deid d where s.id = d.id;

    -- counts only, per organisation — never row contents
    insert into campaign_action_log (actor, org_id, authority, action, detail)
    select auth.uid(), c.org_id, 'retention', 'deidentify_sessions',
           jsonb_build_object('sessions', count(*), 'window_days', v_days, 'grain', v_grain,
                              'free_text', v_text, 'room_links_folded', v_fold)
      from _deid d join sessions s on s.id = d.id join campaigns c on c.id = s.campaign_id
     group by c.org_id;
  end if;

  delete from free_text_holding where created_at < now() - make_interval(days => v_hold);
  get diagnostics v_held_purged = row_count;

  return jsonb_build_object(
    'cutoff', v_cut, 'sessions_deidentified', v_sessions,
    'free_text_answers_removed', v_texts, 'free_text_held_for_coding', v_held,
    'holding_rows_purged', v_held_purged,
    'grain', v_grain, 'room_links_folded', v_fold);
end;
$$;
revoke all on function public.deidentify_stale_sessions() from public, anon;
grant execute on function public.deidentify_stale_sessions() to authenticated, service_role;

-- How many live sessions are more than a day past the window (for readiness).
create or replace function public.deidentify_overdue_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*)
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where s.deidentified_at is null
     and not o.is_demo
     and s.created_at < now() - make_interval(days => setting_int('respondent_deidentify_after_days', 60) + 1);
$$;
revoke all on function public.deidentify_overdue_count() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Stage 2 — the 0042 public purge de-identifies first, and refuses to
--    delete anything that is still identifiable.
-- ----------------------------------------------------------------------------
create or replace function public.purge_stale_respondent_data(p_cutoff_months int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_policy_raw jsonb := (select value from platform_settings where key = 'respondent_retention_months');
  v_policy int;
  v_months int;
  v_deid jsonb;
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can purge respondent data';
  end if;
  if v_policy_raw is null or jsonb_typeof(v_policy_raw) <> 'number' then
    raise exception 'no retention period has been decided (platform_settings.respondent_retention_months is not set) — nothing was purged';
  end if;
  v_policy := (v_policy_raw #>> '{}')::int;
  v_months := coalesce(p_cutoff_months, v_policy);
  if v_months < v_policy then
    raise exception 'the retention policy keeps % months; refusing to purge rows younger than that', v_policy;
  end if;

  v_deid := deidentify_stale_sessions();

  if exists (select 1 from sessions s
               join campaigns c on c.id = s.campaign_id
               join organisations o on o.id = c.org_id
              where not o.is_demo and s.deidentified_at is null
                and s.created_at < now() - (v_months || ' months')::interval) then
    raise exception 'refusing to purge: some sessions past the cutoff are not de-identified';
  end if;

  return _purge_stale_respondent_data_unchecked(v_months) || jsonb_build_object('deidentified_first', v_deid);
end;
$$;
grant execute on function public.purge_stale_respondent_data(int) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Readiness: 0049's body plus one blocking check — nothing overdue.
-- ----------------------------------------------------------------------------
create or replace function public.pilot_readiness()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_retention jsonb := (select value from platform_settings where key = 'respondent_retention_months');
  v_unattested jsonb;
  v_attested jsonb;
  v_versions jsonb;
  v_locked boolean := public.collection_locked();
  v_overdue bigint := public.deidentify_overdue_count();
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can run the readiness check';
  end if;

  select coalesce(jsonb_agg(o.short_name order by o.short_name), '[]'::jsonb) into v_unattested
    from organisations o
   where not o.is_demo and o.status = 'active' and o.consent_attested_at is null;

  select coalesce(jsonb_agg(o.short_name order by o.short_name), '[]'::jsonb) into v_attested
    from organisations o
   where not o.is_demo and o.status = 'active' and o.consent_attested_at is not null;

  select coalesce(jsonb_agg(v.version order by v.created_at desc), '[]'::jsonb) into v_versions
    from instrument_versions v where v.status = 'active';

  v_checks := v_checks
    || jsonb_build_object('check', 'Global view is not published yet',
         'blocking', true,
         'ok', not setting_bool('publish_global_view', false),
         'detail', 'publish_global_view stays false until the live space has crossed the gate.')
    || jsonb_build_object('check', 'Organisations collect once they confirm consent',
         'blocking', false,
         'ok', jsonb_array_length(v_unattested) = 0,
         'detail',
           case when jsonb_array_length(v_attested) = 0 then 'Collecting: none yet. '
                else 'Collecting: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_attested) x) || '. ' end
           || case when jsonb_array_length(v_unattested) = 0 then 'Every active organisation has confirmed.'
                   else 'Waiting to confirm (their real links stay closed): '
                        || (select string_agg(x, ', ') from jsonb_array_elements_text(v_unattested) x) || '.' end)
    || jsonb_build_object('check', 'A retention period has been decided',
         'blocking', true,
         'ok', v_retention is not null and jsonb_typeof(v_retention) = 'number',
         'detail', format('De-identified after %s days; kept up to %s months, then folded into totals.',
                          setting_int('respondent_deidentify_after_days', 60),
                          coalesce(v_retention #>> '{}', '—')))
    || jsonb_build_object('check', 'Nothing is past the de-identification window',
         'blocking', true,
         'ok', v_overdue = 0,
         'detail', case when v_overdue = 0 then 'The daily de-identification job is up to date.'
                        else v_overdue || ' live sessions are overdue — run deidentify_stale_sessions() and check the schedule.' end)
    || jsonb_build_object('check', 'Exactly one instrument version is active',
         'blocking', true,
         'ok', jsonb_array_length(v_versions) = 1,
         'detail', 'Active: ' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(v_versions) x), 'none') || '. Run npm run db:seed after an instrument change.')
    || jsonb_build_object('check', 'Critical-mass gates are set',
         'blocking', true,
         'ok', setting_int('critical_mass_gate', 0) > 0 and setting_int('country_critical_mass_gate', 0) >= setting_int('critical_mass_gate', 0),
         'detail', format('org/region %s · country %s · smallest group %s',
                          setting_int('critical_mass_gate', 0), setting_int('country_critical_mass_gate', 0), setting_int('min_group_n', 0)))
    || jsonb_build_object('check', 'Collection lock',
         'blocking', false,
         'ok', not v_locked,
         'detail', case when v_locked
                        then 'Locked: the survey runs end to end but nothing is stored. Unlock by migration when you go live (0048).'
                        else 'Unlocked: live answers are being stored.' end);

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c
                          where coalesce((c->>'blocking')::boolean, true) and not (c->>'ok')::boolean),
    'collection_locked', v_locked,
    'checks', v_checks,
    'data_spaces', data_space_report(),
    'not_checkable_here', jsonb_build_array(
      'Custom SMTP connected in Supabase Auth, with the email rate limit raised (docs/AUTH_EMAILS.md)',
      'Supabase plan includes restorable backups',
      'main is branch-protected (PR + CI required)',
      'Researcher sign-off on the instrument version being fielded',
      'Privacy notice and terms reviewed by counsel'),
    'checked_at', now()
  );
end;
$$;
grant execute on function public.pilot_readiness() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Schedule it, where pg_cron is available. Re-running is harmless.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $cron$select cron.schedule('jfindx-deidentify-daily', '0 2 * * *', 'select public.deidentify_stale_sessions()')$cron$;
  else
    raise notice 'pg_cron is not available: schedule public.deidentify_stale_sessions() daily another way (docs/PILOT_LAUNCH_CHECKLIST.md).';
  end if;
end $$;
