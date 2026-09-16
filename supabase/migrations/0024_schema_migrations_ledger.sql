-- ============================================================================
-- The Jesus Index — track which migrations have been applied (migration 0024)
--
-- Until 16 September 2026 nothing recorded what this database had actually run.
-- Every migration was applied by hand, and the only record that 0021 had landed
-- was that org_dashboard() answered with an 'insights' key. That works until the
-- day someone forgets, and then the deployed application calls a function that
-- does not exist with no way to tell from the outside.
--
-- JFI Publish now applies migrations itself and writes to this table. The table
-- is created here so it is part of the tracked schema rather than a thing that
-- exists only because a service made it once.
--
-- 'baselined' marks the twenty-three migrations that were applied by hand before
-- this existed. They were recorded, not re-run — re-running 0001 against a live
-- database is not a thing you do to prove a point.
--
-- Idempotent: safe to run against a database that already has the table.
-- ============================================================================

create table if not exists public.schema_migrations (
  filename    text primary key,
  checksum    text        not null,
  applied_at  timestamptz not null default now(),
  applied_by  text,
  baselined   boolean     not null default false
);

comment on table public.schema_migrations is
  'One row per applied migration file. Written by JFI Publish. baselined = true means the row records a migration applied by hand before automated application existed, and its SQL was never executed by the publisher.';

comment on column public.schema_migrations.checksum is
  'sha256 of the migration file as applied. A mismatch means the file was edited after the fact — the publisher refuses to proceed rather than guess which side is right.';

-- Deployment history is not public data. The service reaches this table through
-- the Management API, which bypasses RLS, so no policy is needed here.
revoke all on public.schema_migrations from anon, authenticated;
