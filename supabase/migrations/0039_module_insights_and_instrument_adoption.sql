-- ============================================================================
-- The Jesus Index — insight modules (Belong–Trust) + safe instrument adoption
-- (migration 0039)
--
-- Instrument v5 = v4 unchanged + the Belong–Trust module: twelve unscored,
-- DRAFT single-select items (section "module", module "belong_trust";
-- question_domain belong / trust / context). This migration is the database
-- half of reporting them honestly, and of letting v5 go live at all.
--
-- 1. items.section. The instrument has carried a section tag on every item
--    since v3 (CLAUDE.md #3) but the items table never stored it, so SQL could
--    only find insight layers by hard-coded question_domain names. Stored now,
--    written by both seed scripts, backfilled here from each version's own
--    definition. A future module needs no migration: tag it section "module".
--
-- 2. insight_aggregates() reports every insight layer — Drivers, Journey and
--    any module — and now counts single-select answers (a JSON scalar) as
--    well as multi-select (a JSON array). Same privacy floor as before
--    (non-negotiable #6): n always, option counts only once the item's own n
--    clears min_group_n. Still never read by any score (non-negotiable #9):
--    tiers / domains / matrix / index are untouched — module answers have
--    normalized = null (scored = false), so they can't reach a score even
--    by accident.
--
-- 3. adopt_instrument_version(). Campaigns and waves bind to an instrument
--    version, save_response() only accepts keys from that version, and the
--    survey ships the newest JSON. So after v5 is seeded, every existing v4
--    campaign would reject the new keys. This repoints a campaign/wave ONLY
--    when the target version asks everything its current version asks (a
--    strict key superset, with identical scoring tags on every shared key), so
--    no campaign ever loses a question or has a question re-scored under it.
--    Responses keep their own item_id, so every past answer still binds to
--    the version it was captured under (non-negotiable #3). Not granted to
--    anon/authenticated — run by the seed scripts (Management API / service
--    role) only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. items.section
-- ----------------------------------------------------------------------------
alter table public.items add column if not exists section text;

update public.items i
   set section = e->>'section'
  from public.instrument_versions iv,
       lateral jsonb_array_elements(iv.definition->'items') e
 where i.instrument_version_id = iv.id
   and e->>'key' = i.key
   and i.section is null;

-- ----------------------------------------------------------------------------
-- 2. insight_aggregates(): every insight layer, single- or multi-select.
-- ----------------------------------------------------------------------------
create or replace function public.insight_aggregates(
  p_org_id uuid, p_is_demo boolean, p_min_group_n int
)
returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (
    select rsp.item_key, rsp.raw_value, s.id as sid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    left join items i    on i.id = rsp.item_id
    where (rsp.question_domain in ('drivers', 'journey')
           or i.section in ('driver', 'journey', 'module'))
      and o.is_demo = p_is_demo
      and (p_org_id is null or o.id = p_org_id)
  ),
  item_n as (
    select item_key, count(distinct sid) as n from r group by item_key
  ),
  -- One row per (item, chosen option, respondent). An array is a
  -- multi-select; a string or number is a single-select; anything else
  -- (object, null, open text arrives as a string but open-text items are
  -- never tagged into these sections) degrades to zero option rows.
  opt_counts as (
    select r.item_key, opt.value as option_value, count(distinct r.sid) as n
    from r,
      jsonb_array_elements_text(
        case jsonb_typeof(r.raw_value)
          when 'array'  then r.raw_value
          when 'string' then jsonb_build_array(r.raw_value)
          when 'number' then jsonb_build_array(r.raw_value)
          else '[]'::jsonb
        end
      ) as opt(value)
    group by r.item_key, opt.value
  )
  select coalesce(jsonb_object_agg(
    item_n.item_key,
    jsonb_build_object(
      'n', item_n.n,
      'options', case when item_n.n >= p_min_group_n
        then coalesce(
          (select jsonb_object_agg(oc.option_value, oc.n) from opt_counts oc where oc.item_key = item_n.item_key),
          '{}'::jsonb
        )
        else null end
    )
  ), '{}'::jsonb)
  from item_n;
$$;

revoke all on function public.insight_aggregates(uuid, boolean, int) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. adopt_instrument_version(): superset-only repointing.
-- ----------------------------------------------------------------------------
create or replace function public.adopt_instrument_version(p_version text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_ok uuid[];
  v_campaigns int := 0;
  v_waves int := 0;
begin
  select id into v_target from instrument_versions where version = p_version;
  if v_target is null then raise exception 'instrument version % not found', p_version; end if;
  if not exists (select 1 from items where instrument_version_id = v_target) then
    raise exception 'instrument version % has no items — seed it first', p_version;
  end if;

  -- Versions the target is a safe successor to: every key they ask, the
  -- target asks too, with the same domain, tier, type, scored and reverse flags.
  select coalesce(array_agg(iv.id), '{}') into v_ok
  from instrument_versions iv
  where iv.id <> v_target
    and exists (select 1 from items where instrument_version_id = iv.id)
    and not exists (
      select 1 from items old
      where old.instrument_version_id = iv.id
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
    'campaigns', v_campaigns,
    'waves', v_waves,
    'left_behind', (select count(*) from campaigns where instrument_version_id <> v_target)
  );
end;
$$;

revoke all on function public.adopt_instrument_version(text) from public, anon, authenticated;
