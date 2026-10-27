import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Round 5 (Oct 2026): the benefits become headings that reveal their line on
 * hover, under the hero buttons; the J12 is "12 core questions" (was "12 unique items" until the Oct 2026 clarity pass); and the
 * "house"/"room" metaphor is gone from what people read.
 */
const read = (p: string) => readFileSync(p, "utf8");
const visible = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("benefits: headings only, context on hover, under the hero buttons", () => {
  const home = read("src/app/page.tsx");
  const order = ["Try the survey yourself", "<HeroBenefits", "<SeeADemoCard"].map((m) => home.indexOf(m));
  order.forEach((i, k) => assert.ok(i > 0, `marker ${k}`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "benefits sit under the two buttons, in the left column (round 7)");
  const b = read("src/components/site/HeroBenefits.tsx");
  assert.match(b, /Why use the Jesus Index\?/);
  assert.match(b, /ways this serves you:/);
  assert.match(b, /onMouseEnter/);
  assert.match(b, /sr-only/, "the context is still read out without hovering");
  // Round 7: stacked vertically, filling the left column so it ends level
  // with the See a Demo card (which stretches to the same row height).
  assert.match(home, /<HeroBenefits items=\{BENEFITS\} className="mt-10 flex-1" \/>/);
  assert.match(home, /<div className="flex flex-col">/);
  assert.match(b, /grid flex-1 auto-rows-fr/);
  assert.ok(!/md:grid-cols-5/.test(b), "no longer a horizontal row");
  assert.match(read("src/components/site/SeeADemoCard.tsx"), /flex h-full flex-col/);
  assert.match(b, /style=\{on \? GRADIENT_EDGE : PLAIN_EDGE\}/);
  // The edge itself is shared with the console tiles (Oct 2026), so it lives in Chrome.
  assert.match(b, /import \{ GRADIENT_EDGE, PLAIN_EDGE \} from "@\/components\/site\/Chrome"/);
  assert.match(read("src/components/site/Chrome.tsx"), /linear-gradient\(135deg, rgb\(var\(--c-emerald\)\), rgb\(var\(--c-violet\)\)\) border-box/);
});

test("the J12 says 12 core questions, and counts its questions per cell from the instrument", () => {
  const j = read("src/components/index/J12Journey.tsx");
  assert.match(j, /\{total\} core questions\. One shared measure of Jesus-following\./);
  assert.match(j, /measured by \{NUM\[perCell\] \?\? perCell\} survey questions/);
});

test("no house or room metaphor in what people read", () => {
  const files = [
    "src/app/page.tsx", "src/app/see-a-demo/DemoExperience.tsx", "src/components/index/RoomCards.tsx",
    "src/components/index/DashboardTour.tsx", "src/app/[org]/dashboard/page.tsx", "src/components/index/OrgSettings.tsx",
    "src/components/index/OrgTeam.tsx", "src/lib/consult.ts", "src/content/consent/ConsentResource.tsx",
    "src/app/access/page.tsx", "src/app/access/AccessForm.tsx", "scripts/build-share-docs.py",
  ];
  // The metaphor's own phrases, wherever they appear as words a person reads
  // (code names like kind: "house" or roomName are not phrases, so they pass).
  const phrase = /\b(the house|The house|whole house|whole-house|this room|a room|each room|every room|its own room|small room|real room|the rooms|your rooms|build room|Rooms hold)\b|>\s*Rooms\s*</;
  for (const f of files) {
    visible(read(f)).split("\n").forEach((line, i) => {
      assert.ok(!phrase.test(line), `${f}:${i + 1} still says house/room: ${line.trim().slice(0, 90)}`);
    });
  }
});

test("Oct 2026 round: phone demo copy, /survey, console spec retired, Communication", () => {
  const demo = read("src/components/survey/SurveyDemo.tsx");
  assert.ok(!demo.includes("Powered by the Next Gen Jesus-Following Index"), "the phone strip is the demo line now");
  assert.match(demo, /Demo: nothing you tap is saved · the questions young people see today/);
  assert.match(demo, /Want to see the entire survey\?/);
  assert.match(demo, /href="\/survey"/);
  const survey = read("src/app/survey/page.tsx");
  assert.match(survey, /fieldedItems\(\)/, "the survey page is generated from the instrument");
  assert.match(survey, /<Footer \/>/);
  assert.match(read("supabase/migrations/0060_admin_platform_controls.sql"), /\('survey',/);
  const consolePage = read("src/app/build/Console.tsx");
  assert.ok(!consolePage.includes('href="/build/wireframes"'), "no link to the retired spec");
  assert.ok(!consolePage.includes('title="Comms"'), "Comms is called Communication");
  assert.match(consolePage, /title="Communication"/);
  assert.match(consolePage, /admin_set_platform_setting/);
  for (const f of ["src/app/learn/LearnExplorer.tsx", "src/app/our-story/page.tsx"])
    assert.ok(!read(f).includes("font-serif"), `${f} uses the site's one typeface`);
});
