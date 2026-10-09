import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test("Field Notes is gone from the site and its emails", () => {
  for (const f of walk("src")) assert.ok(!/field notes/i.test(read(f)), `${f} still mentions Field Notes`);
  assert.match(read("src/app/join/JoinForm.tsx"), /const consent = false;/, "nobody is opted into updates");
});

test("the join page: new banner, bold Before you ask with hover answers, gradient CTAs", () => {
  const page = read("src/app/join/page.tsx");
  assert.match(page, /edition="See Jesus-Following in your nextgen, today"/);
  assert.ok(!page.includes("§"), "no section sign in the banner");
  assert.match(page, /font-bold[^"]*">\s*Before you ask/);
  assert.equal((page.match(/bg-gradient-to-r from-emerald via-emerald-deep to-violet/g) ?? []).length, 3, "a gradient line atop each of the three CTAs");
  const faq = read("src/app/join/BeforeYouAsk.tsx");
  assert.match(faq, /group-hover:grid-rows-\[1fr\]/, "answers appear on hover");
  assert.match(faq, /aria-expanded/, "and on tap / keyboard");
});

test("the share documents are built from the real mark and current facts", () => {
  const py = read("scripts/build-share-docs.py");
  assert.match(py, /icon-mark\.svg/);
  assert.match(py, /linearGradient/);
  assert.ok(!/About 7 minutes|3-minute/.test(py), "no retired survey lengths");
  assert.match(py, /About 6 minutes/);
  assert.match(py, /Start a new survey/);
  assert.match(py, /resources\/consent/);
});
