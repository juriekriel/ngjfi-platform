// Seeds the database from the canonical instrument file (src/data/instrument.v1.json):
//   - upserts the instrument version + its expanded items
//   - with --with-demo-org, ALSO upserts the Sunrise persona into the SANDBOX
//
// Single source of truth = the JSON. Re-run any time the instrument changes.
// Usage:  npm run db:seed                    instrument only — safe on a live database
//         npm run db:seed -- --with-demo-org adds the Sunrise sandbox org too
//
// WHY THE SPLIT
// This script used to create Sunrise Youth Collective unconditionally and without
// is_demo, which meant every run dropped a synthetic organisation into the LIVE
// data space — the exact contamination migration 0009 exists to prevent. Worse,
// lock_data_space() freezes an organisation's space the moment it holds a single
// response, so the mistake would have become permanent rather than correctable.
// Seeding the instrument is a routine, safe operation; creating an organisation
// is not. They are now different commands.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WITH_DEMO_ORG = process.argv.includes("--with-demo-org");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const inst = JSON.parse(
  readFileSync(new URL("../src/data/instrument.v1.json", import.meta.url), "utf8"),
);

// 1) instrument version (stores the full definition for reference)
const { data: iv, error: e1 } = await sb
  .from("instrument_versions")
  .upsert(
    { version: inst.version, scoring_version: inst.scoringVersion, status: "active", definition: inst },
    { onConflict: "version" },
  )
  .select()
  .single();
if (e1) throw e1;

// Only one version is ever active: archive every other version so campaigns
// can't silently straddle two instruments.
const { error: e1b } = await sb
  .from("instrument_versions")
  .update({ status: "archived" })
  .neq("version", inst.version);
if (e1b) throw e1b;

// 2) items (replace the set for this version)
await sb.from("items").delete().eq("instrument_version_id", iv.id);
const items = inst.items.map((it) => ({
  instrument_version_id: iv.id,
  key: it.key,
  question_domain: it.question_domain,
  tier: it.tier,
  type: it.type,
  scored: it.scored ?? true,
  reverse_scored: it.reverse_scored ?? false,
  scale: it.scale ?? null,
  ord: it.order ?? null,
}));
const { error: e2 } = await sb.from("items").insert(items);
if (e2) throw e2;

// 3) Sunrise — a Buenos Aires pilot persona. SANDBOX ONLY, and opt-in.
if (!WITH_DEMO_ORG) {
  console.log(
    `✓ Seeded instrument ${inst.version} (${items.length} items). ` +
      `No organisation touched — pass --with-demo-org for the Sunrise sandbox persona.`,
  );
  process.exit(0);
}

// Refuse to resurrect Sunrise into the live space. If a previous run of this
// script (before the split) already put it there, say so loudly rather than
// upserting over it — the fix is a decision about data, not a silent overwrite.
const { data: existing } = await sb
  .from("organisations")
  .select("id, slug, is_demo")
  .eq("slug", "sunrise")
  .maybeSingle();

if (existing && existing.is_demo === false) {
  console.error(
    `✗ Organisation "sunrise" already exists in the LIVE data space.\n` +
      `  This script will not touch it. Decide deliberately: either delete it (if it\n` +
      `  holds no responses) or leave it and rename the persona. Once an organisation\n` +
      `  holds responses, lock_data_space() makes its space permanent.`,
  );
  process.exit(1);
}

const { data: org, error: e3 } = await sb
  .from("organisations")
  .upsert(
    {
      slug: "sunrise",
      name: "Sunrise Youth Collective",
      brand_color: "#e0742f",
      region: "Latin America",
      country: "Argentina",
      website_domain: "sunriseyouth.org",
      membership_tier: "collab_member",
      verified: true,
      is_demo: true, // the whole point of the guard above
    },
    { onConflict: "slug" },
  )
  .select()
  .single();
if (e3) throw e3;

const { error: e4 } = await sb.from("campaigns").upsert(
  {
    org_id: org.id,
    slug: "default",
    instrument_version_id: iv.id,
    scoring_version: inst.scoringVersion,
    locale: "en",
    active: true,
    source_label: "seed",
  },
  { onConflict: "org_id,slug" },
);
if (e4) throw e4;

console.log(
  `✓ Seeded instrument ${inst.version} (${items.length} items) + sandbox org "${org.slug}".`,
);
