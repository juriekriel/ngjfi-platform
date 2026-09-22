-- ============================================================================
-- The Jesus Index — reinstate gender, add city/area (migration 0025)
--
-- Instrument v4 (Youth-Collab-Survey-Augmented_F.docx) asks both branches a
-- "What best describes your gender?" question and, separately, "In which
-- city or area do you live?" — reopening two decisions migration 0019 made
-- during the approved-metadata privacy review:
--
--   * gender was DROPPED there ("never approved"). v4 REINSTATES it: an
--     explicit, deliberate decision for this version, made by the person who
--     owns the instrument content, not a silent reversal of 0019. It is
--     still a single_select from a fixed, non-identifying option list
--     (male/female/other/prefer_not_say), still asked with no name/email/
--     precise location, and still reported only in aggregate — same posture
--     as every other demographic field.
--
--   * city was ALSO dropped there, and is ADDED BACK here — but this time
--     with the current project's non-negotiable #1 explicitly in mind: a
--     free-text city/area is a real re-identification risk for a small town,
--     independent of the existing country-level critical-mass gate (migration
--     0020). This migration only adds the column and lets it be written; the
--     CITY-LEVEL critical-mass gate that non-negotiable #1 requires before any
--     city-scoped figure is ever shown is NOT implemented here — no query in
--     this codebase groups by city yet, so there is nothing to gate. Flagged
--     explicitly so it isn't forgotten: build the city-tier gate (mirroring
--     0020's country-tier pattern) before any surface reports by city.
--
-- Both columns are exactly what they were before 0019 dropped them: coarse,
-- optional, respondent-supplied text/category, no PII, written the same way
-- age_band/country already are — through set_session_context(), never
-- start_session(), so nothing new is exposed to anon beyond an allow-listed
-- column write on a session the caller already owns implicitly (RLS on
-- sessions has no anon policies at all; this RPC is SECURITY DEFINER and
-- validates the session exists, same as today).
-- ============================================================================

alter table public.sessions add column if not exists gender text;
alter table public.sessions add column if not exists city   text; -- optional, coarse (city/area free text)

create or replace function public.set_session_context(
  p_session_id uuid, p_field text, p_value text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session_id) then
    raise exception 'session not found';
  end if;

  if p_field not in ('age_band', 'country', 'gender', 'city') then
    raise exception 'field % is not settable from the survey', p_field;
  end if;

  if p_value is not null and length(p_value) > 64 then
    raise exception 'value too long for %', p_field;
  end if;

  if    p_field = 'age_band' then update sessions set age_band = p_value where id = p_session_id;
  elsif p_field = 'country'  then update sessions set country  = p_value where id = p_session_id;
  elsif p_field = 'gender'   then update sessions set gender   = p_value where id = p_session_id;
  elsif p_field = 'city'     then update sessions set city     = p_value where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.set_session_context(uuid, text, text) to anon, authenticated;
