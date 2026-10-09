-- ============================================================================
-- The Jesus Index — readiness hand sign-offs (migration 0051)
--
-- The five things no database can see (SMTP, backups, branch protection,
-- researcher sign-off, counsel review) were a bullet list in people's heads.
-- Now each is CONFIRMED by an administrator, with who / when / a note, and
-- kept with its history (a revoke never deletes the row). pilot_readiness()
-- returns them as 'hand_checks' plus 'all_signed_off'. 'ready' still means
-- "the database checks pass" — the panel shows both.
--
-- Staff names and dates only. Nothing about any respondent.
-- ============================================================================

create table if not exists public.pilot_signoff_items (
  item          text primary key,
  label         text not null,
  requires_note boolean not null default false,
  ord           int not null
);
alter table public.pilot_signoff_items enable row level security;

insert into public.pilot_signoff_items (item, label, requires_note, ord) values
  ('smtp',       'Custom SMTP connected in Supabase Auth, with the email rate limit raised (docs/AUTH_EMAILS.md)', false, 1),
  ('backups',    'Supabase plan includes restorable backups (and one restore has been rehearsed)', true, 2),
  ('branch',     'main is branch-protected (PR + CI required, no bypass)', false, 3),
  ('researcher', 'Researcher sign-off on the instrument version being fielded', true, 4),
  ('counsel',    'Privacy notice, terms and consent resource reviewed by counsel', true, 5)
on conflict (item) do update set label = excluded.label, requires_note = excluded.requires_note, ord = excluded.ord;

create table if not exists public.pilot_signoffs (
  id            uuid primary key default gen_random_uuid(),
  item          text not null references public.pilot_signoff_items(item),
  confirmed_by  uuid references public.app_users(id) on delete set null,
  confirmed_at  timestamptz not null default now(),
  note          text,
  revoked_by    uuid references public.app_users(id) on delete set null,
  revoked_at    timestamptz,
  revoke_reason text
);
create unique index if not exists pilot_signoffs_one_current
  on public.pilot_signoffs (item) where revoked_at is null;
alter table public.pilot_signoffs enable row level security;
-- No policies: read and written only through the functions below.

create or replace function public.confirm_pilot_item(p_item text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req boolean;
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can sign off pilot readiness'; end if;
  select requires_note into v_req from pilot_signoff_items where item = p_item;
  if not found then raise exception 'unknown sign-off item "%"', p_item; end if;
  if v_req and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'this sign-off needs a note (for example a link to the signed document)';
  end if;
  update pilot_signoffs set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'superseded'
   where item = p_item and revoked_at is null;
  insert into pilot_signoffs (item, confirmed_by, note) values (p_item, auth.uid(), nullif(btrim(p_note), ''));
  return pilot_readiness();
end $$;

create or replace function public.revoke_pilot_item(p_item text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can change pilot sign-offs'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'say why the sign-off is withdrawn'; end if;
  update pilot_signoffs set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
   where item = p_item and revoked_at is null;
  return pilot_readiness();
end $$;

revoke all on function public.confirm_pilot_item(text, text) from public, anon;
revoke all on function public.revoke_pilot_item(text, text) from public, anon;
grant execute on function public.confirm_pilot_item(text, text) to authenticated;
grant execute on function public.revoke_pilot_item(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- pilot_readiness(): 0050's body, plus hand_checks / all_signed_off.
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
    -- kept for older clients: the same items as plain strings
    'not_checkable_here', (select jsonb_agg(label order by ord) from pilot_signoff_items),
    'hand_checks', (select jsonb_agg(jsonb_build_object(
                      'item', i.item, 'label', i.label, 'requires_note', i.requires_note,
                      'confirmed', s.confirmed_at is not null,
                      'confirmed_at', s.confirmed_at,
                      'confirmed_by', coalesce(u.full_name, u.email),
                      'note', s.note) order by i.ord)
                    from pilot_signoff_items i
                    left join pilot_signoffs s on s.item = i.item and s.revoked_at is null
                    left join app_users u on u.id = s.confirmed_by),
    'all_signed_off', not exists (select 1 from pilot_signoff_items i
                                   where not exists (select 1 from pilot_signoffs s
                                                      where s.item = i.item and s.revoked_at is null)),
    'checked_at', now()
  );
end;
$$;
grant execute on function public.pilot_readiness() to authenticated;
