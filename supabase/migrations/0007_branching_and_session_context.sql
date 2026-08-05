-- ============================================================================
-- NGJFI platform — branching support + session context (migration 0007)
--
-- Two respondent-side RPCs the adaptive survey needs, plus the v1 instrument
-- switchover. Both are anonymous-callable for the same reason save_response is:
-- respondents never authenticate.
--
--   set_session_context  fixes the bug where age_band was asked as question 1
--                        but never written to sessions, leaving the Collab
--                        Intelligence "multiplication by age" breakdown empty
--                        for every real respondent (it read sessions.age_band,
--                        which only the seeded demo rows ever populated).
--
--   delete_response      lets the survey withdraw an answer when the respondent
--                        goes back and changes something that closes a branch
--                        they had already walked. Without it, a session could
--                        hold answers to questions the instrument's own rules
--                        say were never asked.
--
-- On skipped items: nothing is stored. Per the decision of 5 Aug 2026, a skipped
-- item is "not asked", NOT a structural zero — tier means are computed only over
-- respondents who reached that tier. Absence stays fully explainable because
-- `show_if` is a pure function of the instrument version plus the stored answers,
-- and responses bind to their instrument version. Note the consequence for
-- reading the dashboards: Formation and Multiplication scores now describe the
-- people who got that far, not the whole sample, so the journey funnel must be
-- read alongside the response counts at each tier rather than on its own.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Write an allow-listed demographic field onto the anonymous session.
-- The allow-list is the whole point: it keeps this from becoming a generic
-- "write any column" hole in a table that must never hold identifying data.
-- ----------------------------------------------------------------------------
create or replace function public.set_session_context(
  p_session_id uuid, p_field text, p_value text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;

  if p_field not in ('age_band', 'gender', 'country', 'city') then
    raise exception 'field % is not settable from the survey', p_field;
  end if;

  -- Bounded: these are bands and coarse place names, never free text.
  if p_value is not null and length(p_value) > 64 then
    raise exception 'value too long for %', p_field;
  end if;

  if    p_field = 'age_band' then update sessions set age_band = p_value where id = p_session_id;
  elsif p_field = 'gender'   then update sessions set gender   = p_value where id = p_session_id;
  elsif p_field = 'country'  then update sessions set country  = p_value where id = p_session_id;
  elsif p_field = 'city'     then update sessions set city     = p_value where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.set_session_context(uuid, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Withdraw a single answer from an in-progress session.
-- Scoped to one session and one item; a respondent can only ever affect the
-- session id they are holding, exactly as with save_response.
-- ----------------------------------------------------------------------------
create or replace function public.delete_response(
  p_session_id uuid, p_item_key text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;
  delete from responses where session_id = p_session_id and item_key = p_item_key;
end;
$$;

grant execute on function public.delete_response(uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Guard the free-text item. `who_is_jesus` is the only open-ended question in
-- the instrument and the only route by which identifying text could reach a
-- database designed to hold none. The UI caps length and warns the respondent;
-- this enforces the cap server-side so a crafted client cannot bypass it.
-- Moderation/redaction before any pilot is still an open operational item.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_open_text_limit()
returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.raw_value) = 'string'
     and length(new.raw_value #>> '{}') > 1000 then
    raise exception 'free-text answer exceeds the permitted length';
  end if;
  return new;
end;
$$;

drop trigger if exists responses_open_text_limit on public.responses;
create trigger responses_open_text_limit
  before insert or update on public.responses
  for each row execute function public.enforce_open_text_limit();

-- ----------------------------------------------------------------------------
-- Let a campaign field the NGC12 core on its own.
--
-- The design constraint from the working sessions is "1 question is best, 12 can
-- be done, 20 is the max". The full v1 instrument is 25 items, which is right for
-- a benchmark wave but too long for a camp queue or a conference floor. Rather
-- than cut real signal out of the instrument, a campaign chooses which set it
-- fields: 'core' runs only the twelve items flagged `core` in the JSON.
-- ----------------------------------------------------------------------------
alter table public.campaigns
  add column if not exists item_set text not null default 'full'
    check (item_set in ('full', 'core'));

comment on column public.campaigns.item_set is
  'full = every item in the instrument version; core = the NGC12 only (~2 minutes).';

-- ----------------------------------------------------------------------------
-- Instrument v1 becomes the active version; v0 is archived, not deleted, so
-- responses already bound to it stay interpretable ("never lock the instrument").
-- The v1 rows themselves are loaded by `npm run db:seed`, which reads the
-- canonical JSON — schema here, content there.
-- ----------------------------------------------------------------------------
update public.instrument_versions set status = 'archived' where version = 'v0';
