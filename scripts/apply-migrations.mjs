// Applies migrations to the linked Supabase project via the Management API.
//
// Why this exists: the schema is versioned as migrations, and the Supabase SQL
// editor is the only other way to run them — which is fine for a human and
// impossible to automate reliably. This reads the token from .env.local, never
// prints it, and runs each pending migration in order, stopping at the first
// failure so a half-applied schema is obvious rather than silent.
//
//   node scripts/apply-migrations.mjs 0006 0007 0008 0009
//
// With no arguments it applies every migration it finds, in filename order.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// The repo path contains a space ("Claude Co Work"). URL.pathname keeps it
// percent-encoded, which readdir then cannot find — fileURLToPath decodes it.
import { fileURLToPath } from "node:url";

const REF = "whtbfhbhkhwfmeekvmxq";

function tokenFromEnvFile() {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    throw new Error(".env.local not found — put SUPABASE_ACCESS_TOKEN in it first.");
  }
  const line = raw.split("\n").find((l) => l.trim().startsWith("SUPABASE_ACCESS_TOKEN"));
  if (!line) throw new Error("SUPABASE_ACCESS_TOKEN is not set in .env.local");
  const value = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!value || value.includes("paste_here")) throw new Error("SUPABASE_ACCESS_TOKEN looks like a placeholder");
  return value;
}

async function runSql(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 400)}`);
  return text;
}

const token = tokenFromEnvFile();
const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const wanted = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => (wanted.length ? wanted.some((w) => f.startsWith(w)) : true))
  .sort();

if (!files.length) {
  console.error("✗ no migrations matched");
  process.exit(1);
}

for (const f of files) {
  process.stdout.write(`→ ${f} … `);
  try {
    await runSql(token, readFileSync(join(dir, f), "utf8"));
    console.log("ok");
  } catch (e) {
    console.log("FAILED");
    console.error(`\n${e.message}\n`);
    console.error(`Stopped at ${f}. Nothing after it was applied.`);
    process.exit(1);
  }
}

// Verify with a live query rather than trusting that the SQL "looked right".
const report = await runSql(token, "select public.data_space_report();");
console.log("\n✓ all applied");
console.log(report);
