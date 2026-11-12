import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Oct 2026 clarity pass: every country (and region) view says that a
 * country's colour describes only those who completed the Index, never the
 * country (non-negotiable #1); and the front page says who it's for, what the
 * leader does, and what the young people see, in plain words.
 */
const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

test("the country caveat lives in one place and says what a country's figure is not", () => {
  const c = read("src/components/site/CountryCaveat.tsx");
  assert.match(c, /Not a measure of any \$\{level\}/);
  assert.match(c, /completed the Index/);
  assert.match(c, /not a representative sample/);
  assert.match(c, /do not speak for the \$\{level\}/);
  // Nowhere else retypes the sentence.
  for (const f of walk("src").filter((f) => /\.tsx?$/.test(f) && !f.endsWith("CountryCaveat.tsx")))
    assert.ok(!read(f).includes("Not a measure of any"), `${f} retypes the caveat; import CountryCaveat instead`);
});

test("every country map carries the caveat, because the map itself renders it", () => {
  const map = read("src/components/index/WorldHeatMap.tsx");
  assert.match(map, /<CountryCaveat /);
  assert.match(map, /<CaveatMark \/>/);
  // Every page that draws countries does so through WorldHeatMap, so it inherits the caveat.
  // CoverageMap (/join) is the one exception: it counts ministry sign-ups, never
  // results, and says so under the map.
  assert.match(read("src/components/site/CoverageMap.tsx"), /sign-ups only, not survey results/);
  const notResults = ["WorldHeatMap.tsx", "CoverageMap.tsx"];
  for (const f of walk("src").filter((f) => f.endsWith(".tsx") && !notResults.some((n) => f.endsWith(n)))) {
    const s = read(f);
    if (/<svg[\s\S]*WORLD_FEATURES/.test(s)) assert.fail(`${f} draws its own world map; use WorldHeatMap so the caveat comes with it`);
  }
  // The regions view is the same picture at another scale, so it says the same.
  assert.match(read("src/components/index/IntelligenceView.tsx"), /<CountryCaveat level="region"/);
});

test("the front page: who it's for, what you do, what they see, and the caveat beside country comparisons", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /Set up your survey →/);
  assert.ok(!home.includes("Start your journey"), "the main button names the leader's action, not a faith journey");
  assert.match(home, /\{AGE_RANGE\}/, "the age range comes from the instrument, never typed");
  assert.ok(!/1[0-9]–[2-9][0-9]/.test(home), "no age range typed into the front page");
  assert.match(home, /Five steps for you\. One survey for them\./);
  assert.ok(home.indexOf("What your young people see") > home.indexOf("<ol"), "the phone, not the steps, is what young people see");
  assert.match(home, /<CountryCaveat /);
  assert.ok(!/In about \$\{WELCOME_MINUTES\} minutes, your dashboard/.test(home), "survey length is not the dashboard's timing");
  assert.match(read("src/components/index/J12Journey.tsx"), /\{total\} core questions\./);
});

test("AGE_RANGE reads the eligible age options from the live instrument", () => {
  const src = read("src/lib/instrument.ts");
  assert.match(src, /export const AGE_RANGE/);
  assert.match(src, /!o\.ends_survey/);
  // The same rule, applied to the file that ships, gives 13–30 today.
  const inst = JSON.parse(read("src/data/instrument.v7.json"));
  const age = inst.items.find((i: { session_field?: string }) => i.session_field === "age_band");
  const nums = age.options
    .filter((o: { ends_survey?: boolean }) => !o.ends_survey)
    .flatMap((o: { text: { en: string } }) => (o.text.en.match(/\d+/g) ?? []).map(Number));
  assert.equal(`${Math.min(...nums)}–${Math.max(...nums)}`, "13–30");
});
