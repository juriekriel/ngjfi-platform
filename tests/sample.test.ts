import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * The contract these tests protect: the landing page and the guided tour are
 * DERIVED from the live instrument, never hand-written. If someone reintroduces
 * a hard-coded fixture, or the sample generator stops covering the model, these
 * fail rather than letting the demo quietly drift from the product.
 */

type Item = {
  key: string;
  question_domain: string;
  tier: string;
  scored: boolean;
  core?: boolean;
};

const instrument = JSON.parse(
  readFileSync(new URL("../src/data/instrument.v1.json", import.meta.url), "utf8"),
) as { items: Item[] };

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const DOMAINS = ["follow", "mission", "world"];
const TIERS = ["exposure", "response", "formation", "multiplication"];

test("the sample dataset is generated from the instrument, not hard-coded", () => {
  const sample = src("../src/lib/sample.ts");
  assert.match(
    sample,
    /from "@\/lib\/instrument"/,
    "sample.ts must read the live instrument — a standalone fixture would drift",
  );
  // A hand-written fixture would need the item keys spelled out. None should appear.
  for (const key of ["god_exists", "pray_frequency", "mentoring_someone"]) {
    assert.ok(
      !sample.includes(`"${key}"`),
      `sample.ts hard-codes the item "${key}" — it must derive every figure instead`,
    );
  }
});

test("the sample generator covers every scored cell of the model", () => {
  const scored = instrument.items.filter(
    (i) => i.scored && DOMAINS.includes(i.question_domain),
  );
  for (const d of DOMAINS) {
    for (const t of TIERS) {
      assert.ok(
        scored.some((i) => i.question_domain === d && i.tier === t),
        `${d} × ${t} has no scored item, so the sample dashboard would render a hole`,
      );
    }
  }
});

test("the guided tour mounts the live survey component, not a copy", () => {
  const tour = src("../src/app/tour/Walkthrough.tsx");
  assert.match(
    tour,
    /from "@\/components\/survey\/QuestionCard"/,
    "the tour must render the real Question component",
  );
  assert.match(
    tour,
    /from "@\/components\/index\/Figures"/,
    "the tour must render the real dashboard figures",
  );
  assert.match(tour, /from "@\/lib\/sample"/, "the tour must use the derived sample payload");
});

test("the live survey and the tour share one question renderer", () => {
  const survey = src("../src/app/[org]/page.tsx");
  assert.match(
    survey,
    /from "@\/components\/survey\/QuestionCard"/,
    "the live survey must import the shared renderer — two copies would diverge",
  );
});

test("the landing page renders live components rather than static markup", () => {
  const home = src("../src/app/page.tsx");
  assert.match(home, /from "@\/components\/index\/Figures"/);
  assert.match(home, /from "@\/lib\/sample"/);
});

test("every public surface carries the never-overclaim label", () => {
  const banner = src("../src/components/PrototypeBanner.tsx");
  assert.match(banner, /sample data/i);
  const layout = src("../src/app/layout.tsx");
  assert.match(layout, /PrototypeBanner/, "the banner must be mounted in the root layout");
  assert.match(layout, /index: false/, "the prototype must stay out of search results");
});

test("waitlist contact data is kept separate from respondent data", () => {
  const sql = src("../supabase/migrations/0008_waitlist_and_access.sql");
  assert.match(sql, /enable row level security/);
  assert.ok(
    !/references\s+public\.sessions/i.test(sql) && !/references\s+public\.responses/i.test(sql),
    "the waitlist must never hold a foreign key into respondent data",
  );
  assert.match(sql, /security definer/, "writes must go through definer RPCs, as elsewhere");
});
