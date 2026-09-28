import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildTables, rateBand, toCsv, toRecords, yearsOf, type Insights } from "../src/lib/collabInsights.ts";

/**
 * Collab Insights export: the tables are cut from gated aggregates only, a
 * suppressed cell never turns into a number, and the band cut-offs come from
 * the payload's config rather than from code.
 */
const D: Insights = {
  space: "live", published: true, gate: 30, min_group_n: 5,
  locality: { unit: "registered_country", measure: "retention", bands: { exceptional: 0.9, healthy: 0.7, average: 0.5, low: 0.3 } },
  years: [2024, 2025],
  timeline: [{ year: 2024, started: 53, completed: 48 }, { year: 2025, started: 42, completed: 32 }],
  countries_by_year: [{ year: 2024, countries: 2 }, { year: 2025, countries: 2 }],
  countries_total: 2,
  languages_by_year: [
    { year: 2024, languages: 2, locales: [{ code: "en", n: 50 }, { code: "pt", n: 3 }] },
    { year: 2025, languages: 3, locales: [{ code: "en", n: 20 }, { code: "pt", n: 12 }, { code: "zu", n: 10 }] },
  ],
  languages_total: 3,
  locality_rates: [
    { locality: "South Africa", region: "Southern Africa", cells: { "2024": { n: 45, baseline: true, answered: 45, match: 0.8 }, "2025": { n: 20, prev_n: 45, rate: 0.44 } } },
    { locality: "Brazil", region: "Latin America", cells: { "2024": { suppressed: true }, "2025": { n: 12, prev_suppressed: true } } },
  ],
  index_by_year: [
    { year: 2024, n: 48, funnel: { formation: 4 }, domains: { follow: 4 }, matrix: { follow: { formation: 4 } } },
    { year: 2025, n: 32, suppressed: true },
  ],
};
const CTX = {
  tiers: ["exposure", "response", "formation", "multiplication"], domains: ["follow", "mission", "world"],
  languages: [{ code: "en", name: "English", status: "live", dir: "ltr" }, { code: "zu", name: "Zulu", status: "draft", dir: "ltr" }],
  generatedAt: new Date("2026-09-28T00:00:00Z"),
};

test("bands follow config, not code", () => {
  assert.equal(rateBand(0.95), "exceptional");
  assert.equal(rateBand(0.7), "healthy");
  assert.equal(rateBand(0.5), "average");
  assert.equal(rateBand(0.3), "low");
  assert.equal(rateBand(0.29), "not_yet");
  assert.equal(rateBand(0.7, { exceptional: 0.95, healthy: 0.8, average: 0.6, low: 0.4 }), "average");
});

test("years come from the data, oldest first", () => {
  assert.deepEqual(yearsOf(D), [2024, 2025]);
});

test("every export starts with an About table carrying the scope line", () => {
  const t = buildTables(D, ["timeline"], [], CTX);
  assert.equal(t[0].key, "about");
  assert.match(String(t[0].rows[1][1]), /Of those who have completed the Index/);
});

test("year filter applies to every yearly dataset", () => {
  const t = buildTables(D, ["timeline", "countries", "languages", "locality"], [2025], CTX);
  const tl = t.find((x) => x.key === "timeline")!;
  assert.deepEqual(tl.rows.slice(1), [[2025, 42, 32, 76.2]]);
  assert.ok(t.find((x) => x.key === "locality")!.rows.slice(1).every((r) => r[2] === 2025));
  const lang = t.find((x) => x.key === "languages")!;
  assert.equal(lang.rows.length, 4);
  assert.equal(lang.rows[3][3], "Zulu");
});

test("a suppressed locality-year stays suppressed — no n, no rate", () => {
  const loc = buildTables(D, ["locality"], [], CTX).find((x) => x.key === "locality")!;
  const br = loc.rows.filter((r) => r[0] === "Brazil");
  assert.deepEqual(br[0], ["Brazil", "Latin America", 2024, null, null, null, null, "suppressed", null, null]);
  // the year after a suppressed year withholds its rate too (it would reveal last year's n)
  assert.deepEqual(br[1], ["Brazil", "Latin America", 2025, 12, null, null, null, "previous year suppressed", null, null]);
});

test("retention and triangulation come through with their band", () => {
  const loc = buildTables(D, ["locality"], [], CTX).find((x) => x.key === "locality")!;
  const za = loc.rows.filter((r) => r[0] === "South Africa");
  assert.deepEqual(za[0], ["South Africa", "Southern Africa", 2024, 45, null, null, null, "baseline (first year)", 45, 0.8]);
  assert.deepEqual(za[1], ["South Africa", "Southern Africa", 2025, 20, 45, 0.44, "Low", null, null, null]);
});

test("a year below the score gate exports n and nothing else", () => {
  const m = buildTables(D, ["matrix", "funnel"], [], CTX);
  const matrix = m.find((x) => x.key === "matrix")!;
  assert.deepEqual(matrix.rows.filter((r) => r[0] === 2025), [[2025, 32, null, null, "suppressed"]]);
  assert.equal(matrix.rows.filter((r) => r[0] === 2024).length, 12); // 3 × 4
  const funnel = m.find((x) => x.key === "funnel")!;
  assert.deepEqual(funnel.rows.find((r) => r[0] === 2024 && r[2] === "formation"), [2024, 48, "formation", 4]);
});

test("datasets come out in canonical order whatever order they were ticked", () => {
  const t = buildTables(D, ["matrix", "timeline", "translations"], [], CTX);
  assert.deepEqual(t.map((x) => x.key), ["about", "timeline", "translations", "matrix"]);
});

test("CSV quoting and JSON records", () => {
  assert.equal(toCsv([["a", "b"], ['x,"y"', null]]), 'a,b\r\n"x,""y""",\r\n');
  assert.deepEqual(toRecords([["year", "n"], [2024, 3]]), [{ year: 2024, n: 3 }]);
});
