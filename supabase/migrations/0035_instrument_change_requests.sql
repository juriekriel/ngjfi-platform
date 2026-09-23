-- ============================================================================
-- The Jesus Index — instrument change proposals (migration 0035)
--
-- The instrument admin UI (/build/instrument) lets the Collab and
-- administrators browse the live item bank and PROPOSE changes to it. It
-- deliberately does not edit items in place:
--
--   - src/data/instrument.v4.json is the single source of truth (CLAUDE.md),
--     bundled into the survey so it runs offline;
--   - a scoring change must land in src/lib/scoring.ts AND the SQL
--     normaliser together, with a test;
--   - wording and scoring are researcher-owned.
--
-- So a proposal is recorded here, reviewed by researchers, and — if
-- accepted — implemented as an ordinary reviewed PR that bumps the version.
-- Responses stay bound to the version they were captured under.
-- ============================================================================

create table if not exists public.instrument_change_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  version      text not null,                 -- the version the proposal was made against
  item_key     text,                          -- null for "add a new item"
  kind         text not null check (kind in ('wording', 'translation', 'tagging', 'scoring', 'options', 'new_item', 'remove_item', 'other')),
  locale       text,
  proposal     text not null check (length(proposal) between 1 and 4000),
  reason       text check (reason is null or length(reason) <= 4000),
  status       text not null default 'open' check (status in ('open', 'accepted', 'declined', 'implemented')),
  decision_note text,
  proposed_by  uuid references auth.users(id) on delete set null,
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz
);

alter table public.instrument_change_requests enable row level security;
-- No policies: functions only.

create or replace function public.propose_instrument_change(
  p_version text, p_item_key text, p_kind text, p_proposal text, p_reason text default null, p_locale text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'instrument proposals are for administrators and the Collab';
  end if;
  insert into instrument_change_requests (version, item_key, kind, locale, proposal, reason, proposed_by)
  values (btrim(p_version), nullif(btrim(p_item_key), ''), p_kind, nullif(btrim(p_locale), ''), btrim(p_proposal), nullif(btrim(p_reason), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.propose_instrument_change(text, text, text, text, text, text) to authenticated;


create or replace function public.list_instrument_changes()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'instrument proposals are for administrators and the Collab';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'version', r.version, 'item_key', r.item_key,
      'kind', r.kind, 'locale', r.locale, 'proposal', r.proposal, 'reason', r.reason,
      'status', r.status, 'decision_note', r.decision_note,
      'proposed_by', (select u.email from app_users u where u.id = r.proposed_by),
      'decided_at', r.decided_at
    ) order by (r.status = 'open') desc, r.created_at desc)
    from instrument_change_requests r
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_instrument_changes() to authenticated;


-- Deciding is an administrator's act — the record of a researcher decision,
-- not the change itself.
create or replace function public.decide_instrument_change(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator records a decision on an instrument proposal';
  end if;
  if p_status not in ('open', 'accepted', 'declined', 'implemented') then
    raise exception 'status must be open, accepted, declined or implemented';
  end if;
  update instrument_change_requests
     set status = p_status, decision_note = nullif(btrim(p_note), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id;
  if not found then raise exception 'proposal not found'; end if;
end;
$$;

grant execute on function public.decide_instrument_change(uuid, text, text) to authenticated;
