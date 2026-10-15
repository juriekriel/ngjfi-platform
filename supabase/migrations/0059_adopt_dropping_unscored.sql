-- ============================================================================
-- The Jesus Index — adopting an instrument that DROPS named unscored items
-- (migration 0059, instrument v6)
--
-- WHY
-- adopt_instrument_version() (0039) moves a campaign/wave onto a new version
-- only when the new version asks EVERYTHING the old one asks, with identical
-- scoring tags. v6 is the pilot instrument agreed by the Collab on 14 Oct 2026,
-- and it deliberately asks LESS than v5: who_is_jesus, continue_to_extras and
-- city are gone. Under the 0039 rule every v5 campaign would stay on v5 while
-- the survey ships v6 — so save_response() would reject v6's new key
-- (attention_check_unengaged) with 'unknown item', and a phone's outbox would
-- keep retrying it.
--
-- WHAT
-- adopt_instrument_version(p_version, p_drop_unscored text[] default '{}').
-- A version is a safe predecessor when every key it asks is EITHER asked by
-- the target with identical domain / tier / type / scored / reverse flags (the
-- 0039 rule, unchanged), OR is named in p_drop_unscored AND is unscored in the
-- predecessor. So:
--   * no scored item can ever be dropped this way — a version that would lose
--     one is simply left where it is;
--   * nothing is dropped unless a reviewed instrument file names it
--     (instrument.v6.json "adopts_from" → the seed scripts pass the list);
--   * called with one argument it behaves exactly as 0039 did.
-- Responses keep their own item_id, so every past answer still binds to the
-- version it was captured under (non-negotiable #3). Nothing about any
-- respondent is read, stored or exposed.
--
-- The single-argument function is dropped first: keeping it beside a
-- two-argument one with a default would make every one-argument call
-- ambiguous (the 0027 overload lesson).
-- ============================================================================

drop function if exists public.adopt_instrument_version(text);

create or replace function public.adopt_instrument_version(p_version text, p_drop_unscored text[] default '{}')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_ok uuid[];
  v_campaigns int := 0;
  v_waves int := 0;
  v_drop text[] := coalesce(p_drop_unscored, '{}');
begin
  select id into v_target from instrument_versions where version = p_version;
  if v_target is null then raise exception 'instrument version % not found', p_version; end if;
  if not exists (select 1 from items where instrument_version_id = v_target) then
    raise exception 'instrument version % has no items — seed it first', p_version;
  end if;
  -- A key the target still asks can't also be "dropped": that would be a typo
  -- in the instrument file, and silently ignoring it would hide the mistake.
  if exists (select 1 from items where instrument_version_id = v_target and key = any(v_drop)) then
    raise exception 'p_drop_unscored names a key that % still asks', p_version;
  end if;

  select coalesce(array_agg(iv.id), '{}') into v_ok
  from instrument_versions iv
  where iv.id <> v_target
    and exists (select 1 from items where instrument_version_id = iv.id)
    and not exists (
      select 1 from items old
      where old.instrument_version_id = iv.id
        -- an unscored item the target explicitly drops is allowed to go …
        and not (old.key = any(v_drop) and old.scored = false)
        -- … everything else must be asked identically.
        and not exists (
          select 1 from items nw
          where nw.instrument_version_id = v_target
            and nw.key = old.key
            and nw.question_domain = old.question_domain
            and nw.tier = old.tier
            and nw.type = old.type
            and nw.scored = old.scored
            and nw.reverse_scored = old.reverse_scored
        )
    );

  update campaigns set instrument_version_id = v_target where instrument_version_id = any(v_ok);
  get diagnostics v_campaigns = row_count;
  update waves set instrument_version_id = v_target where instrument_version_id = any(v_ok);
  get diagnostics v_waves = row_count;

  return jsonb_build_object(
    'adopted_into', p_version,
    'from_versions', (select coalesce(jsonb_agg(version), '[]') from instrument_versions where id = any(v_ok)),
    'dropped_unscored', to_jsonb(v_drop),
    'campaigns', v_campaigns,
    'waves', v_waves,
    'left_behind', (select count(*) from campaigns where instrument_version_id <> v_target)
  );
end;
$$;

revoke all on function public.adopt_instrument_version(text, text[]) from public, anon, authenticated;

comment on function public.adopt_instrument_version(text, text[]) is
  'Moves campaigns/waves onto p_version when it asks everything their version asks with identical scoring tags, except unscored keys the instrument file explicitly drops (p_drop_unscored). Never drops a scored item. Run by the seed scripts only (0039, 0059).';
