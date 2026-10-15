import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Round 4 / 4b (Oct 2026): the Jesus Index name throughout, the J12 as the
 * real mark, and everything demo on one page — /see-a-demo — with
 * "See your: Ministry · Organisation · Church" and a closing call to action.
 */
const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the name is the Jesus Index everywhere a person reads it", () => {
  for (const f of walk("src").filter((f) => /\.(tsx?|json)$/.test(f))) {
    const visible = code(read(f)).replace(/jfindx[-.]?\w*/gi, ""); // the domain and file names stay
    assert.ok(!/JFINDX|J\.FIND\.x/.test(visible), `${f} still says JFINDX`);
  }
  assert.match(read("src/components/site/Chrome.tsx"), /The <span className="italic">Jesus<\/span> Index/);
  assert.match(read("src/app/manifest.ts"), /short_name: "Jesus Index"/);
});

test("the front page: no under-18s tile, no figures, a door to the demo", () => {
  const home = read("src/app/page.tsx");
  assert.ok(!code(home).includes('t: "Safe for under-18s"'), "no under-18s benefit tile");
  assert.ok(!/from "@\/lib\/sample"/.test(home + read("src/components/site/SeeADemoCard.tsx")), "no sample figures on the front page");
  assert.match(home, /<SeeADemoCard/);
  for (const v of ["ministry", "organisation", "church"]) assert.match(read("src/components/site/SeeADemoCard.tsx"), new RegExp(`view: "${v}"`));
});

test("/see-a-demo: three tabs, the global view, and the call to action — in that order", () => {
  const demo = code(read("src/app/see-a-demo/DemoExperience.tsx"));
  for (const s of ["SAMPLE_MINISTRY", "SAMPLE_ORG", "SAMPLE_CHURCH"]) assert.ok(demo.includes(s), s);
  for (const t of ['tab: "Ministry"', 'tab: "Organisation"', 'tab: "Church"']) assert.ok(demo.includes(t), t);
  assert.match(demo, /See it as a:/);
  assert.match(demo, /role="tablist"/);
  const order = ['role="tablist"', "<Season", "<LazyLiveSnapshot", "You can see this for your", "Join free"].map((m) => demo.indexOf(m));
  order.forEach((i, k) => assert.ok(i > 0, `marker ${k}`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(demo, /href="\/join"/);
});

test("every demo figure is framed as demo", () => {
  const demo = code(read("src/app/see-a-demo/DemoExperience.tsx"));
  assert.match(demo, /<DataLabel kind="demo" \/>/);
  for (const fig of ["<IndexPlate", "<JourneyFunnel", "<Matrix", "<ItemLedger", "<TrendPlate"]) {
    const at = demo.indexOf(fig);
    const before = demo.slice(0, at);
    assert.ok(before.lastIndexOf("<DemoFrame") > before.lastIndexOf("</DemoFrame>"), `${fig} sits inside a DemoFrame`);
  }
  const snap = code(read("src/components/site/LiveSnapshot.tsx"));
  assert.match(snap, /isDemo \? \(\s*<DemoFrame/);
  assert.match(snap, /rpc\("collab_intelligence_demo"\)/);
  // Live data never comes from the sample module: sampleWorld() only feeds setDemo.
  assert.match(snap, /setDemo\(sampleWorld\(\) as Intel\)/);
  assert.match(snap, /if \(hasMap\(di\)\) setDemo\(di\)/);
  assert.equal((snap.match(/sampleWorld\(\)/g) ?? []).length, 1);
  assert.ok(!/setLive\([^)]*sample/.test(snap));
});

test("the J12 is the real mark, and reads its questions from the instrument", () => {
  const j = read("src/components/index/J12Journey.tsx");
  assert.match(j, /j12CellColour/);
  assert.match(j, /from "@\/lib\/instrument"/);
  assert.match(j, /\.core\)/);
  assert.match(j, /onMouseEnter/);
});

test("the pitch documents exist, and the demo route is reserved", () => {
  const docs = read("src/components/site/PitchDocs.tsx");
  const hrefs = [...docs.matchAll(/href: "(\/share\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 3);
  for (const h of hrefs) assert.ok(existsSync(`public${h}`), `${h} is built (python3 scripts/build-share-docs.py)`);
  assert.match(read("supabase/migrations/0057_see_a_demo_short_name.sql"), /\('see-a-demo'/);
});
