import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The privacy notice must name every piece of context the survey stores with
 * an answer. If an instrument adds a session field, this fails until /privacy
 * says so — the page's own rule ("change this page in the same PR"), enforced.
 */
const lib = readFileSync("src/lib/instrument.ts", "utf8");
const active = lib.match(/import \w+ from "@\/data\/(instrument\.v\d+\.json)"/)?.[1];
const page = readFileSync("src/app/privacy/page.tsx", "utf8").replace(/\s+/g, " ");

// How each stored field is named, in plain words, on the page.
const LABEL: Record<string, string> = {
  age_band: "age group",
  gender: "gender",
  country: "country",
  city: "city or area",
};

test("the active instrument is the one the app imports", () => {
  assert.ok(active, "src/lib/instrument.ts imports an instrument JSON");
});

test("/privacy names every session field the active instrument stores", () => {
  const inst = JSON.parse(readFileSync(`src/data/${active}`, "utf8")) as { items: { session_field?: string }[] };
  const fields = [...new Set(inst.items.map((i) => i.session_field).filter(Boolean) as string[])];
  assert.ok(fields.length > 0);
  for (const f of fields) {
    const label = LABEL[f];
    assert.ok(label, `add a plain-language label for new session field "${f}" here AND on /privacy`);
    assert.ok(page.includes(label), `/privacy does not mention "${label}" (${f})`);
  }
});

test("/privacy also names what every session records regardless of the instrument", () => {
  for (const words of ["language you used", "when you answered", "version of the survey", "organisation"]) {
    assert.ok(page.includes(words), `/privacy should mention "${words}"`);
  }
});

test("/privacy describes the two-stage retention and links the consent resource", () => {
  assert.ok(page.includes("First 60 days"));
  assert.ok(page.includes("Up to 5 years"));
  assert.ok(page.includes('href="/resources/consent"'));
});
