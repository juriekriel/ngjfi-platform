// Concatenates every migration, in order, into supabase/bootstrap.sql.
//
// Why this exists: the schema is versioned as migrations, which is right for an
// evolving database and useless when you need to stand a NEW one up in a hurry —
// a paused or wedged project, a fresh environment, a local copy for a researcher.
// This produces a single file you paste into a new project's SQL editor and run
// once. Ten minutes, no CLI, no database password.
//
// Regenerate after adding a migration:  node scripts/build-bootstrap.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../supabase/migrations/", import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const header = `-- ============================================================================
-- The Jesus Index — full schema bootstrap
--
-- GENERATED FILE. Do not edit: change a migration and re-run
--   node scripts/build-bootstrap.mjs
--
-- Stands up a complete, empty database in one paste. Run it in a new Supabase
-- project's SQL editor, top to bottom, then:
--
--   1.  npm run db:seed            loads instrument v1 + the demo organisation
--   2.  select public.data_space_report();
--                                  verify the live space is empty before you
--                                  point anything real at it
--
-- Demo data is OPTIONAL and is deliberately NOT included here. The synthetic
-- seed files under supabase/ are run separately, and only against a database
-- that is meant to serve the sandbox. A database intended solely for live data
-- should never have them run against it — that is the cleanest separation
-- available, and it costs nothing.
--
-- Migrations included, in order:
${files.map((f) => `--   ${f}`).join("\n")}
-- ============================================================================

`;

const body = files
  .map((f) => {
    const sql = readFileSync(join(dir, f), "utf8").trimEnd();
    return `\n-- ─── ${f} ${"─".repeat(Math.max(0, 66 - f.length))}\n\n${sql}\n`;
  })
  .join("\n");

writeFileSync(new URL("../supabase/bootstrap.sql", import.meta.url), header + body + "\n");
console.log(`✓ supabase/bootstrap.sql — ${files.length} migrations, ${(header + body).length.toLocaleString()} chars`);
