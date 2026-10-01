-- ============================================================================
-- The Jesus Index — locking an instrument version (migration 0045)
--
-- v5 is confirmed as the fielded instrument and LOCKED (instrument.v5.json
-- "lock", 2026-10-01). Until now nothing stopped a version being edited
-- after answers were captured under it: the seed scripts deleted and
-- re-inserted every item on each run. A lock makes "a change is a new
-- version" a rule the database holds, not a habit.
--
-- Frozen once locked (same projection as src/lib/instrumentLock.ts):
--   every item (keys, order, sections, tags, branch rules, scales, options,
--   ENGLISH wording), the scoring version, field_draft_items, and which items
--   each survey version (item_sets) contains.
-- Still editable: translations, notes, survey-version labels, welcome minutes.
--
--   1. instrument_versions.locked_at / lock_note.
--   2. instrument_lock_projection(definition) — the frozen part.
--   3. Triggers: a locked version's definition can only change outside the
--      projection; its items rows can't be added, removed or re-scored; a
--      lock can't be lifted or the version deleted.
--   4. lock_instrument_version(version, note) — service tooling or an
--      administrator; idempotent.
--   5. instrument_status() — public: which version is live and whether it
--      is locked, so anyone can confirm it.
-- ============================================================================

alter table public.instrument_versions
  add column if not exists locked_at timestamptz,
  add column if not exists lock_note text;

comment on column public.instrument_versions.locked_at is
  'When this version was locked (0045). A locked version never changes what it asks or how it scores; a change is a new version.';


-- Localized text ({en, es, …}) reduced to its English master, recursively.
create or replace function public._en_only(j jsonb)
returns jsonb language plpgsql immutable as $$
declare out jsonb; k text; v jsonb;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'array' then
    select coalesce(jsonb_agg(public._en_only(e) order by ord), '[]'::jsonb) into out
      from jsonb_array_elements(j) with ordinality as t(e, ord);
    return out;
  elsif jsonb_typeof(j) = 'object' then
    if jsonb_typeof(j->'en') = 'string' then return jsonb_build_object('en', j->'en'); end if;
    out := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      out := out || jsonb_build_object(k, public._en_only(v));
    end loop;
    return out;
  end if;
  return j;
end;
$$;

create or replace function public.instrument_lock_projection(p_def jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'version',           p_def->'version',
    'scoringVersion',    p_def->'scoringVersion',
    'field_draft_items', coalesce((p_def->>'field_draft_items')::boolean, false),
    'item_sets', coalesce((
      select jsonb_object_agg(s.key, jsonb_build_object(
               'sections',     coalesce(s.value->'sections', 'null'::jsonb),
               'exclude_keys', coalesce(s.value->'exclude_keys', 'null'::jsonb)))
        from jsonb_each(coalesce(p_def->'item_sets', '{}'::jsonb)) s), '{}'::jsonb),
    'items', coalesce((
      select jsonb_agg(public._en_only(e) order by e->>'key')
        from jsonb_array_elements(coalesce(p_def->'items', '[]'::jsonb)) e), '[]'::jsonb)
  );
$$;


create or replace function public.guard_locked_instrument()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.locked_at is not null then
      raise exception 'instrument % is locked and can''t be deleted', old.version;
    end if;
    return old;
  end if;
  if old.locked_at is not null then
    if new.locked_at is null then
      raise exception 'instrument % is locked; a lock can''t be lifted — make a new version instead', old.version;
    end if;
    if new.version is distinct from old.version or new.scoring_version is distinct from old.scoring_version then
      raise exception 'instrument % is locked; its version and scoring version can''t change', old.version;
    end if;
    if instrument_lock_projection(new.definition) is distinct from instrument_lock_projection(old.definition) then
      raise exception 'instrument % is locked: what it asks or how it scores can''t change (translations and notes can). Make a new version instead.', old.version;
    end if;
    new.locked_at := old.locked_at;
  end if;
  return new;
end;
$$;

drop trigger if exists instrument_versions_lock_guard on public.instrument_versions;
create trigger instrument_versions_lock_guard
  before update or delete on public.instrument_versions
  for each row execute function public.guard_locked_instrument();


create or replace function public.guard_locked_items()
returns trigger language plpgsql as $$
declare v_iv uuid := coalesce(new.instrument_version_id, old.instrument_version_id); v_ver text;
begin
  select version into v_ver from instrument_versions where id = v_iv and locked_at is not null;
  if v_ver is null then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    -- An upsert of an UNCHANGED item fires this before Postgres sees the
    -- conflict; let it through (the conflict turns it into a no-op update).
    if exists (select 1 from items o
                where o.instrument_version_id = new.instrument_version_id and o.key = new.key
                  and (o.question_domain, o.tier, o.type, o.scored, o.reverse_scored, o.scale, o.ord, o.branch, o.section)
                      is not distinct from
                      (new.question_domain, new.tier, new.type, new.scored, new.reverse_scored, new.scale, new.ord, new.branch, new.section)) then
      return new;
    end if;
    raise exception 'instrument % is locked; it can''t gain or re-tag an item (%)', v_ver, new.key;
  end if;
  if tg_op = 'DELETE' then raise exception 'instrument % is locked; it can''t lose an item', v_ver; end if;
  if (new.key, new.question_domain, new.tier, new.type, new.scored, new.reverse_scored, new.scale, new.ord, new.branch, new.section, new.instrument_version_id)
     is distinct from
     (old.key, old.question_domain, old.tier, old.type, old.scored, old.reverse_scored, old.scale, old.ord, old.branch, old.section, old.instrument_version_id) then
    raise exception 'instrument % is locked; item % can''t be re-tagged or re-scored', v_ver, old.key;
  end if;
  return new;
end;
$$;

drop trigger if exists items_lock_guard on public.items;
create trigger items_lock_guard
  before insert or update or delete on public.items
  for each row execute function public.guard_locked_items();


-- Lock a version. Idempotent. Refuses a version with no items, or whose
-- items table disagrees with its own definition (keys or scoring tags) —
-- locking something inconsistent would freeze the inconsistency.
create or replace function public.lock_instrument_version(p_version text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.instrument_versions%rowtype; v_mismatch int;
begin
  -- Service tooling (Management API / service role: no auth.uid()) or an administrator.
  if auth.uid() is not null and my_role() <> 'admin' then
    raise exception 'only an administrator can lock an instrument version';
  end if;
  select * into v from instrument_versions where version = p_version;
  if not found then raise exception 'instrument version % not found', p_version; end if;
  if v.locked_at is not null then
    return jsonb_build_object('version', v.version, 'locked_at', v.locked_at, 'already', true);
  end if;
  if not exists (select 1 from items where instrument_version_id = v.id) then
    raise exception 'instrument % has no items — seed it before locking', p_version;
  end if;

  select count(*) into v_mismatch
  from (
    select e->>'key' k, e->>'question_domain' d, e->>'tier' t, e->>'type' ty,
           coalesce((e->>'scored')::boolean, true) s, coalesce((e->>'reverse_scored')::boolean, false) r
      from jsonb_array_elements(v.definition->'items') e
    except
    select key, question_domain, tier, type, scored, reverse_scored from items where instrument_version_id = v.id
  ) x;
  if v_mismatch > 0 or (select count(*) from items where instrument_version_id = v.id)
                       <> jsonb_array_length(v.definition->'items') then
    raise exception 'instrument % items table disagrees with its definition — re-seed before locking', p_version;
  end if;

  update instrument_versions set locked_at = now(), lock_note = p_note where id = v.id;
  return jsonb_build_object('version', v.version, 'locked_at', now(), 'already', false);
end;
$$;
revoke all on function public.lock_instrument_version(text, text) from public, anon;
grant execute on function public.lock_instrument_version(text, text) to authenticated;


-- Anyone can confirm what is live.
create or replace function public.instrument_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'version', v.version, 'status', v.status, 'scoring_version', v.scoring_version,
           'locked_at', v.locked_at,
           'items', (select count(*) from items i where i.instrument_version_id = v.id),
           'item_sets', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(coalesce(v.definition->'item_sets', '{}'::jsonb)) k), '[]'::jsonb),
           'campaigns', (select count(*) from campaigns c where c.instrument_version_id = v.id)
         ) order by v.created_at desc), '[]'::jsonb)
    from instrument_versions v;
$$;
grant execute on function public.instrument_status() to anon, authenticated;
