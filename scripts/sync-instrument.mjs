// Seeds the database from the canonical instrument file (src/data/instrument.v0.json):
//   - upserts the instrument version + its expanded items
//   - upserts the demo Sunrise org + a default campaign
//
// Single source of truth = the JSON. Re-run any time the instrument changes.
// Usage:  npm run db:seed     (reads .env.local via node --env-file)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const inst = JSON.parse(
  readFileSync(new URL("../src/data/instrument.v0.json", import.meta.url), "utf8"),
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

// 3) demo org + campaign (Sunrise — Buenos Aires pilot persona)
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

console.log(`✓ Seeded instrument ${inst.version} (${items.length} items) + org "${org.slug}".`);
