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
  readFileSync(new URL("../src/data/instrument.v3.json", import.meta.url), "utf8"),
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
  // The survey body moved to components/survey/Survey.tsx when the public
  // audience got its own route, so that BOTH audiences mount one implementation
  // rather than two pages that drift. The invariant this test protects is
  // unchanged: exactly one question renderer, imported, never copied.
  const survey = src("../src/components/survey/Survey.tsx");
  assert.match(
    survey,
    /from "@\/components\/survey\/QuestionCard"/,
    "the live survey must import the shared renderer — two copies would diverge",
  );

  for (const route of ["../src/app/[org]/page.tsx", "../src/app/[org]/open/page.tsx"]) {
    assert.match(
      src(route),
      /from "@\/components\/survey\/Survey"/,
      `${route} must mount the shared survey rather than reimplement it`,
    );
  }
});

test("the landing page renders live components and carries no fabricated scores", () => {
  const home = src("../src/app/page.tsx");
  assert.match(home, /from "@\/components\/index\/Figures"/);

  // Deliberate: the front page shows the MODEL, never sample results. A
  // fabricated number is a poor thing to lead with even when it is labelled —
  // it invites a visitor to read the demo as the product. Scores live behind
  // door 03, where the context travels with them.
  assert.ok(
    !/from "@\/lib\/sample"/.test(home),
    "the landing page must not pull sample results — send people to /demo for numbers",
  );
  assert.match(home, /<Matrix phrases \/>/, "the model grid must be the plain-language variant");
});

test("the mark never sits beside the typed wordmark", () => {
  // The Rising J reads as a letter J. Next to the words it produces
  // "J The Jesus Index". It stands alone, or the rising rule carries the gesture.
  for (const f of ["../src/app/page.tsx", "../src/components/site/Chrome.tsx"]) {
    const s = src(f);
    const wordmark = /<span className="italic">Jesus<\/span>/;
    if (!wordmark.test(s)) continue;
    const idx = s.search(wordmark);
    const window = s.slice(Math.max(0, idx - 400), idx);
    assert.ok(
      !/<RisingJ/.test(window),
      `${f} places <RisingJ> immediately before the typed wordmark`,
    );
  }
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

/* ── data spaces ───────────────────────────────────────────────────────── */

test("the published view can never see the sandbox", () => {
  const sql = src("../supabase/migrations/0009_data_spaces.sql");

  // The filter must live INSIDE the definer body, not be a caller's job.
  const live = sql.slice(
    sql.indexOf("function public.collab_intelligence()"),
    sql.indexOf("function public.collab_intelligence_demo()"),
  );
  assert.ok(live.length > 0, "collab_intelligence() must be redefined here");
  assert.match(live, /o\.is_demo\s*=\s*false/, "the live view must exclude demo organisations");

  const demo = sql.slice(sql.indexOf("function public.collab_intelligence_demo()"));
  assert.match(demo, /o\.is_demo\s*=\s*true/, "the demo view must aggregate only the fiction");
});

test("an organisation cannot change data space once it holds responses", () => {
  const sql = src("../supabase/migrations/0009_data_spaces.sql");
  assert.match(sql, /organisations_lock_data_space/);
  assert.match(sql, /cannot be changed/i, "the guard must refuse, not silently allow");
});

test("the critical-mass gate is data, never a constant in code", () => {
  const sql = src("../supabase/migrations/0009_data_spaces.sql");
  assert.match(sql, /platform_settings/);
  assert.match(sql, /critical_mass_gate/);
  // A hard-coded 400 in the application would defeat the point of the setting.
  for (const f of ["../src/lib/model.ts", "../src/components/index/IntelligenceView.tsx"]) {
    assert.ok(!/\b400\b/.test(src(f)), `${f} hard-codes the gate — it must read platform_settings`);
  }
});

test("the country-level critical-mass gate is its own versioned setting, separate from and higher than the org/region gate", () => {
  const sql = src("../supabase/migrations/0020_country_critical_mass_tier.sql");
  assert.match(sql, /platform_settings/);
  assert.match(sql, /country_critical_mass_gate/);
  assert.match(sql, /'2000'::jsonb/, "the seeded default must be a config value, not just a comment");
  // Same hard-coding guard as the org/region gate — 2000 must never leak into
  // application code as a literal either.
  for (const f of ["../src/lib/model.ts", "../src/components/index/IntelligenceView.tsx"]) {
    assert.ok(!/\b2000\b/.test(src(f)), `${f} hard-codes the country gate — it must read platform_settings`);
  }
  // The country array in collab_intelligence() must be gated on the country
  // threshold, not silently reusing the org/region one.
  const intel = sql.slice(
    sql.indexOf("function public.collab_intelligence()"),
    sql.indexOf("function public.org_benchmark("),
  );
  assert.match(
    intel,
    /cn\.n\s*>=\s*v_country_gate/,
    "collab_intelligence()'s countries[] must use v_country_gate, not the shared v_gate",
  );
  assert.match(
    intel,
    /rn\.n\s*>=\s*v_gate/,
    "regions[] stays on the org/region gate — coarser than a country, unchanged",
  );
});

test("Drivers/Journey are reported as aggregate option rates, gated, and structurally kept out of the score", () => {
  const sql = src("../supabase/migrations/0021_insight_layer_reporting.sql");
  assert.match(sql, /function public\.insight_aggregates\(/);

  const helper = sql.slice(
    sql.indexOf("function public.insight_aggregates("),
    sql.indexOf("function public.org_dashboard("),
  );
  // Scoped to the insight domains only — never pulls in Index items.
  assert.match(helper, /question_domain in \('drivers', 'journey'\)/);
  // No mean/score math anywhere in this function — option COUNTS only, and it
  // never even reads the `normalized` column (which is null for these items
  // anyway, since they're unscored) or writes to tiers/domains/matrix/index.
  assert.ok(!/normalized/.test(helper), "insight_aggregates() must not touch the scored column at all");
  for (const key of ["'tiers'", "'domains'", "'matrix'", "'index'"]) {
    assert.ok(!helper.includes(key),
      `insight_aggregates() must never write a ${key} key — it is reported alongside the Index, not folded into it`);
  }
  // The min_group_n floor: n is always returned, options only once that
  // item's own n clears the floor — same suppression style as everywhere else.
  assert.match(helper, /'n',\s*item_n\.n/);
  assert.match(helper, /case when item_n\.n >= p_min_group_n/);

  // All three callers must actually wire it in, with the org/space they're
  // each scoped to — not a shared/leaked scope.
  assert.match(sql, /insight_aggregates\(v_org\.id, v_org\.is_demo, v_min_group_n\)/, "org_dashboard() must scope insights to its own org");
  assert.match(sql, /insight_aggregates\(null, false, v_min_group_n\)/, "collab_intelligence() must scope insights to the live space, not one org");
  assert.match(sql, /insight_aggregates\(null, true, v_min_group_n\)/, "collab_intelligence_demo() must scope insights to the demo space");

  // Never granted directly — same posture as blended_trend(), reached only
  // through the three functions above which already enforce who sees what.
  assert.ok(!/grant execute on function public\.insight_aggregates/.test(sql),
    "insight_aggregates() must not be independently callable — it has no authorisation check of its own");
});

test("collab_worklist() ranks countries the same way collab_intelligence() names them", () => {
  const sql = src("../supabase/migrations/0022_worklist_country_source.sql");
  const fn = sql.slice(
    sql.indexOf("create or replace function public.collab_worklist()"),
  );
  // Must read the organisation's own country, matching collab_intelligence()
  // and org_benchmark() — not the respondent's self-reported one, which is a
  // different column (sessions.country) tracking a different thing.
  assert.match(fn, /select o\.country, count\(\*\) as completions/);
  assert.match(fn, /group by o\.country/);
  // Check the query's own FROM/GROUP BY, not the prose explaining the fix
  // (which legitimately mentions "sessions.country" as the thing NOT used).
  assert.ok(!/select s\.country,/.test(fn), "collab_worklist() must not select sessions.country for its ranking");
  assert.ok(!/group by s\.country/.test(fn), "collab_worklist() must not group by sessions.country");
});

test("the separation is verifiable with a live query, not by reading SQL", () => {
  const sql = src("../supabase/migrations/0009_data_spaces.sql");
  assert.match(sql, /function public\.data_space_report\(\)/);
  assert.match(sql, /grant execute on function public\.data_space_report/);
});

test("a fresh database can be stood up from the repo in one paste", () => {
  const boot = src("../supabase/bootstrap.sql");
  for (const n of ["0001_schema", "0006_demo_dashboard", "0009_data_spaces"]) {
    assert.ok(boot.includes(n), `bootstrap.sql is missing ${n} — re-run npm run db:bootstrap`);
  }
  assert.ok(
    !boot.includes("seed_demo_data"),
    "bootstrap must NOT include demo data — a live database should never have it run against it",
  );
});
