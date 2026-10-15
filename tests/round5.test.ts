import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Round 5 (Oct 2026): the benefits become headings that reveal their line on
 * hover, under the hero buttons; the J12 is "12 unique items"; and the
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
  assert.match(b, /ways this helps you:/);
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
  assert.match(b, /linear-gradient\(135deg, rgb\(var\(--c-emerald\)\), rgb\(var\(--c-violet\)\)\) border-box/);
});

test("the J12 says 12 unique items, and counts its questions per cell from the instrument", () => {
  const j = read("src/components/index/J12Journey.tsx");
  assert.match(j, /\{total\} unique items\. One shared measure of Jesus-following\./);
  assert.match(j, /captured across \{NUM\[perCell\]/);
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
