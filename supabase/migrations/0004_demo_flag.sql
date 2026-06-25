-- ============================================================================
-- NGJFI platform — demo flag (migration 0004)
-- Marks synthetic/demo organisations so ALL demo data can be removed in one
-- command before official testing (see supabase/delete_demo_data.sql).
-- ============================================================================

alter table public.organisations
  add column if not exists is_demo boolean not null default false;

-- flag the earlier seed/demo orgs too, so teardown removes everything synthetic
update public.organisations set is_demo = true
where slug in ('sunrise','grace-cdmx','lighthouse-mnl','anchor-nairobi','cityreach-london','demo');
