-- ============================================================================
-- The Jesus Index — UNLOCK COLLECTION (migration 0065)
-- ============================================================================
-- Migration 0048 locked collection: real links ran end to end but stored
-- nothing until pilot readiness was signed off. Readiness has been signed off
-- (who signed off and when is recorded in the pull request that adds this
-- file, as docs/PILOT_LAUNCH_CHECKLIST.md §6 requires).
--
-- From the moment this runs, a REAL link stores answers — for an organisation
-- whose organisation consent AND survey consent are both confirmed (0042,
-- 0053), within the age groups that survey was consented for. Every other
-- guard stays exactly as it was: no consent, no participation; under-13s and
-- over-30s leave at the first question with nothing kept; small groups stay
-- suppressed; the sandbox never mixes with the live space.
--
-- To lock again: a new migration setting it back to true. Never a toggle in
-- the Supabase dashboard. collection_locked() still FAILS CLOSED if this
-- setting is ever missing.
-- ============================================================================

update public.platform_settings
   set value = 'false'::jsonb, updated_at = now(),
       note = 'Unlocked for launch by migration 0065 after pilot readiness sign-off. Set back to true only by a new migration.'
 where key = 'collection_locked';
