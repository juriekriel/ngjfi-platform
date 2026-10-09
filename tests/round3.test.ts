import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MATRIX_PHRASE } from "../src/lib/model.ts";

const read = (p: string) => readFileSync(p, "utf8");

test("Follow × Response reads 'believes in Jesus' everywhere it is drawn", () => {
  assert.equal(MATRIX_PHRASE.follow.response, "believes in Jesus");
  assert.match(read("scripts/build-share-docs.py"), /"believes in Jesus"/);
});

test("the join form asks four optional questions and keeps the setup-call answer", () => {
  const f = read("src/app/join/JoinForm.tsx");
  for (const gone of ["How do you measure discipleship today?", "If you had this score tomorrow", "Are you part of the Next Gen Global Collab?"])
    assert.ok(!f.includes(gone), `${gone} is removed`);
  assert.match(f, /setup_call: wantsCall \|\| null/, "yes / maybe / no is sent as said");
  assert.match(f, /kind: "setup_call"/, "a yes or maybe tells the team");
  assert.match(f, /font-bold[^"]*">You&apos;re in/, "the welcome heading is bold");
  const route = read("src/app/api/waitlist-notify/route.ts");
  assert.match(route, /payload\.kind === "setup_call"/);
  assert.match(route, /notifyTo,\s*`Setup call/, "the setup-call email goes to the team only");
  const admin = read("src/components/console/Onboarding.tsx");
  assert.match(admin, /admin_setup_calls/);
  assert.match(admin, /admin_mark_setup_call/);
  assert.match(admin, /mailto:/);
});

test("join steps, learn page and footer share the gradient-and-bold style", () => {
  const join = read("src/app/join/page.tsx");
  assert.match(join, /What happens when you join/);
  assert.match(join, /from-emerald via-emerald-deep to-violet/);
  const learn = read("src/app/learn/page.tsx");
  assert.ok(!/one claim/i.test(learn), "The one claim section is gone");
  assert.match(learn, />Three guarantees</);
  for (const href of ["/organisation", "/#global", "/join"]) assert.ok(learn.includes(`href: "${href}"`), `still links to ${href}`);
  // Footer: back to a thin rule (Oct 2026: the gradient there was too much).
  assert.match(read("src/components/site/Chrome.tsx"), /<footer className="border-t border-rule">/);
});

test("lane questions appear on hover, and the landing phone has real proportions", () => {
  const j = read("src/components/index/J12Journey.tsx");
  assert.match(j, /opacity: focus\.lane === d \? 1 : 0/);
  assert.match(j, /\{DOMAIN_LABEL\[d\]\}/);
  assert.match(read("src/components/survey/SurveyDemo.tsx"), /aspect-\[9\/19\.5\]/);
});

test("round 4: logo, World × Response, guarantees on hover, no black line on learn", () => {
  assert.match(read("src/components/site/Chrome.tsx"), />J\.FIND\.x</);
  assert.equal(MATRIX_PHRASE.world.response, "believes faith matters");
  const learn = read("src/app/learn/page.tsx");
  assert.ok(!learn.includes("border-b border-ink"), "no black line above the first gradient");
  assert.match(learn, /<Guarantees/);
  assert.match(read("src/app/learn/Guarantees.tsx"), /group-hover:grid-rows-\[1fr\]/);
});
