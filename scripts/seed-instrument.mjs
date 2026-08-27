// Seeds the ACTIVE instrument version + its items via the Supabase Management
// API, using the same SUPABASE_ACCESS_TOKEN that scripts/apply-migrations.mjs
// reads. No service-role key required.
//
//   node scripts/seed-instrument.mjs           seeds src/data/instrument.v1.json
//   node scripts/seed-instrument.mjs v0        seeds a specific version file
//
// WHY THIS EXISTS ALONGSIDE db:seed
// `npm run db:seed` needs SUPABASE_SERVICE_ROLE_KEY. That key is the one secret
// with no RLS above it, so the fewer machines that hold a copy the better —
// and seeding an instrument does not need it. This does the same job with a
// token the repo's tooling already depends on, which means loading the
// instrument is never blocked on finding a credential.
//
// It touches instrument_versions and items ONLY. It creates no organisation and
// no campaign, so it cannot put anything into either data space.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REF = "whtbfhbhkhwfmeekvmxq";
const version = process.argv[2] ?? "v1";

function token() {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    throw new Error(".env.local not found — put SUPABASE_ACCESS_TOKEN in it first.");
  }
  const line = raw.split("\n").find((l) => l.trim().startsWith("SUPABASE_ACCESS_TOKEN"));
  if (!line) throw new Error("SUPABASE_ACCESS_TOKEN is not set in .env.local");
  const v = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!v || v.includes("paste_here")) throw new Error("SUPABASE_ACCESS_TOKEN looks like a placeholder");
  return v;
}

async function runSql(tok, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 500)}`);
  return text;
}

const path = fileURLToPath(new URL(`../src/data/instrument.${version}.json`, import.meta.url));
const json = readFileSync(path, "utf8").trim();
const inst = JSON.parse(json);

// $inst$ rather than $json$: the instrument contains apostrophes in question
// wording, and a dollar-quoted string is the only escaping that survives them
// without mangling the copy a respondent reads.
const sql = `
insert into public.instrument_versions (version, scoring_version, status, definition)
values ('${inst.version}', '${inst.scoringVersion}', 'active', $inst$
${json}
$inst$::jsonb)
on conflict (version) do update
  set definition      = excluded.definition,
      scoring_version = excluded.scoring_version,
      status          = 'active';

-- Exactly one version is ever active, so a campaign cannot straddle two
-- instruments and quietly make its responses incomparable.
update public.instrument_versions set status = 'archived'
 where version <> '${inst.version}';

-- Replace the item set for this version rather than merging: a removed item
-- must actually disappear, or the survey would keep asking a question the
-- research panel has retired.
delete from public.items
 where instrument_version_id = (select id from public.instrument_versions where version = '${inst.version}');

insert into public.items
  (instrument_version_id, key, question_domain, tier, type, scored, reverse_scored, scale, ord)
select iv.id, e->>'key', e->>'question_domain', e->>'tier', e->>'type',
       coalesce((e->>'scored')::boolean, true),
       coalesce((e->>'reverse_scored')::boolean, false),
       e->'scale', (e->>'order')::int
  from public.instrument_versions iv,
       lateral jsonb_array_elements(iv.definition->'items') e
 where iv.version = '${inst.version}';

select jsonb_build_object(
  'version', iv.version,
  'status',  iv.status,
  'items',   (select count(*) from public.items i where i.instrument_version_id = iv.id)
) as seeded
from public.instrument_versions iv where iv.version = '${inst.version}';
`;

process.stdout.write(`→ seeding instrument ${inst.version} (${inst.items.length} items) … `);
const out = await runSql(token(), sql);
console.log("ok");
console.log(out);
