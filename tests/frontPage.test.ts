import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MATRIX_PHRASE } from "../src/lib/model.ts";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

test("the front page reads hero → journey → try it → global view, in one scroll", () => {
  const home = read("src/app/page.tsx");
  const order = ["Start your journey", "<J12Journey", 'id="try"', "<LazySurveyDemo", "<LazyLiveSnapshot", "<Footer"].map((m) => home.indexOf(m));
  order.forEach((i, k) => assert.ok(i > 0, `marker ${k} present`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "sections are in order");
  assert.match(home, /Free for every ministry\. Available now\./);
  assert.ok(!home.includes("And it stays free"), "no 'and it stays free' in the hero (Oct 2026 edit)");
  assert.ok(!/\{ t: "Free"/.test(home), "free is said in the text, not as a benefit tile");
  assert.ok(!home.includes("seven-minute"), "minutes come from the instrument");
});

test("no public page links to the retired global-picture page; /history redirects to /our-story", () => {
  const signedIn = ["SignedInFrame.tsx", "Console.tsx", "IntelligenceEntry.tsx"];
  for (const f of walk("src").filter((f) => /\.tsx?$/.test(f) && !signedIn.some((s) => f.endsWith(s)))) {
    assert.ok(!/href="\/intelligence"/.test(read(f)), `${f} links to /intelligence`);
    assert.ok(!/href="\/history"/.test(read(f)), `${f} links to /history`);
  }
  assert.match(read("next.config.mjs"), /source: "\/history", destination: "\/our-story", permanent: true/);
});

test("the nav says Sign in and Join — free; the footer carries Our story, Privacy, Terms, Consent", () => {
  const chrome = read("src/components/site/Chrome.tsx");
  assert.match(chrome, />\s*Sign in\s*</);
  assert.match(chrome, /Join the JFINDX — free/);
  for (const l of ["Our story", "Privacy", "Terms", "Consent"]) assert.ok(chrome.includes(`"${l}"`), l);
  for (const p of ["learn", "tour", "join", "access", "organisation", "our-story"]) {
    assert.match(read(`src/app/${p}/page.tsx`), /<Footer \/>/, `/${p} has the footer`);
  }
});

test("the J12 journey takes every word from the model", () => {
  const j = read("src/components/index/J12Journey.tsx");
  for (const lane of Object.values(MATRIX_PHRASE))
    for (const phrase of Object.values(lane)) assert.ok(!j.includes(`"${phrase}"`) && !j.includes(`>${phrase}<`), `"${phrase}" is not hard-coded`);
  assert.match(j, /MATRIX_PHRASE\[/);
  assert.match(j, /--c-map-/);
});

test("the survey demo never touches the database, and the tour QR is drawn locally", () => {
  const demo = read("src/components/survey/SurveyDemo.tsx");
  assert.ok(!/getSupabase|supabase-js|\.rpc\(/.test(demo), "no database client in the demo");
  const tour = read("src/app/tour/Walkthrough.tsx");
  assert.ok(!tour.includes("api.qrserver.com"), "no third-party QR service");
  assert.match(tour, /<QrCode /);
});

test("the join page says available now — no queues, no clusters", () => {
  const join = read("src/app/join/page.tsx") + read("src/app/join/JoinForm.tsx") + read("src/app/api/waitlist-notify/route.ts");
  assert.ok(!/country cluster|your round opens|first round/i.test(join), "no cluster/round language");
  assert.match(join, /You&apos;re in|You're in/);
});
