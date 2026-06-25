-- ============================================================================
-- TEARDOWN — remove ALL demo/synthetic data before official testing.
-- Deleting demo organisations cascades to their campaigns -> sessions ->
-- responses, and to org_members, via ON DELETE CASCADE foreign keys.
-- The instrument, scoring config, and any real (non-demo) orgs are untouched.
-- ============================================================================

delete from public.organisations where is_demo = true;

-- Sanity check after running:
--   select count(*) as orgs from public.organisations;
--   select count(*) as responses from public.responses;
