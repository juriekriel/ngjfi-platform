import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
// @ts-expect-error: plain .mjs build script, no types
import { build, fieldedItems, LIVE } from "../scripts/build-pitch.mjs";

/**
 * Round 8 (Oct 2026): the leadership pitch (/pitch) shows the live instrument,
 * word for word, and nothing older. "No older version of the survey should
 * exist anywhere else."
 */
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const pitch = read("public/pitch/index.html");
type Item = { key: string; text: { en: string }; archived?: boolean; draft?: boolean; order?: number };
const load = (v: string) => JSON.parse(read(`src/data/instrument.${v}.json`)) as { items: Item[]; field_draft_items?: boolean };
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = unescape(pitch);

test("the pitch is built from the live instrument and is up to date", () => {
  assert.equal(LIVE, "v6");
  assert.match(read("src/lib/instrument.ts"), new RegExp(`instrument\\.${LIVE}\\.json`), "the pitch and the survey read the same version");
  assert.equal(pitch, build(), "public/pitch/index.html is stale: run node scripts/build-pitch.mjs");
});

test("every question a respondent can be asked in v6 is on the pitch, word for word", () => {
  const items = fieldedItems(load("v6")) as Item[];
  assert.ok(items.length > 60);
  for (const i of items) assert.ok(text.includes(i.text.en), `${i.key} missing from the pitch`);
});

test("no question from an older version, or the old hand-typed pitch survey, appears on the pitch", () => {
  const live = new Set((fieldedItems(load("v6")) as Item[]).map((i) => i.text.en));
  const retired = new Set<string>();
  for (const v of ["v0", "v1", "v2", "v3", "v4", "v5"])
    for (const i of load(v).items) if (i.text.en.length > 24 && !live.has(i.text.en)) retired.add(i.text.en);
  for (const i of load("v6").items) if (i.archived && !live.has(i.text.en)) retired.add(i.text.en);
  // The 6.1 pitch's own illustrative questions, which were never an instrument version.
  for (const q of [
    "I am a follower of Jesus, whom I believe is God.",
    "Have you had the chance to hear the story of Jesus?",
    "When deciding what you believe about faith, what do you trust most?",
    "I look to my own experiences more than the Bible to understand who I am.",
    "It is more important to maintain relationships than to speak the truth about Jesus.",
  ])
    retired.add(q);
  for (const q of retired) assert.ok(!text.includes(q), `retired question still on the pitch: "${q}"`);
  assert.ok(!/Country \+ city/.test(text), "v6 asks no city");
});

test("the pitch carries the new name, tagline and goal line", () => {
  assert.match(text, /The <em>Jesus<\/em> Index/);
  assert.match(text, /a global measure of Jesus-following/);
  assert.match(text, /To see every young person have a real opportunity to follow Jesus by 2033\./);
  assert.ok(!/Next Gen Jesus-Following Index/.test(text), "the old long name is gone from the pitch");
});

test("/pitch is served before the [org] route, and 'pitch' can't be taken as a short name", () => {
  assert.match(read("next.config.mjs"), /source: "\/pitch", destination: "\/pitch\/index\.html"/);
  assert.match(read("supabase/migrations/0061_reserve_pitch_short_name.sql"), /\('pitch',/);
});

test("the front page carries the logo tagline and the goal banner", () => {
  const chrome = read("src/components/site/Chrome.tsx");
  assert.match(chrome, /LOGO_TAGLINE = "a global measure of Jesus-following"/);
  assert.match(chrome, /GOAL_LINE = "To see every young person have a real opportunity to follow Jesus by 2033\."/);
  const home = read("src/app/page.tsx");
  assert.match(home, /<Masthead edition=\{GOAL_LINE\} \/>/);
  assert.ok(!home.includes("The Next Gen Jesus-Following Index"));
});
