-- ============================================================================
-- The Jesus Index — fix start_session() overload ambiguity (migration 0027)
--
-- PRE-EXISTING BUG, unrelated to v4: migration 0019 changed start_session()'s
-- signature from 7 params (p_campaign_id, p_age_band, p_gender, p_country,
-- p_city, p_locale, p_consent) to 5 (p_campaign_id, p_age_band, p_country,
-- p_locale, p_consent), dropping p_gender/p_city. `create or replace
-- function` only replaces a function with the identical argument signature,
-- so this did not replace the old 7-arg function -- it created a second,
-- overloaded start_session() alongside it. Nothing ever dropped the old one.
--
-- Result: PostgREST cannot resolve which overload a call to
-- rpc('start_session', { p_campaign_id, p_locale }) means (both accept those
-- two), and returns PGRST203 "Could not choose the best candidate function."
-- Every call to start_session() -- i.e. every attempt to begin the survey,
-- for every organisation -- has been failing since 0019 was applied.
--
-- Fix: drop the orphaned 7-arg overload. The 5-arg version from 0019 (and
-- carried forward unchanged by 0025's set_session_context() work) is the one
-- application code actually calls; it's the only one that should exist.
-- ============================================================================

drop function if exists public.start_session(uuid, text, text, text, text, text, jsonb);

-- Confirm exactly one start_session() remains, with the expected signature.
do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'start_session';

  if v_count <> 1 then
    raise exception 'expected exactly 1 start_session() after this migration, found %', v_count;
  end if;
end $$;
