import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Nov 2026: the name is "The Jesus Following Index". "The Jesus Index" and the
// bare short form "the Index" are retired everywhere a person reads them.
// Locked instrument files are the record and are never edited, so they are
// skipped; "Exploration Index" (Route B) is a different index and is fine.

const root = new URL("..", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(root, f), "utf8");
const walk = (d: string): string[] =>
  readdirSync(join(root, d)).flatMap((n) => {
    const p = join(d, n);
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });
const OLD = /\bJesus Index\b|\b[Tt]he Index\b(?!es)/;

test("no surface still says 'the Jesus Index' or 'the Index'", () => {
  const files = [
    ...walk("src").filter((f) => /\.(tsx?|json|css)$/.test(f) && !/instrument\.(v\d+|locks)\.json$/.test(f)),
    ...walk("scripts").filter((f) => /\.(mjs|py|html)$/.test(f)),
    "public/pitch/index.html",
    "ops/pitch-redirect/index.html",
  ];
  for (const f of files) {
    const hit = read(f).match(OLD);
    assert.equal(hit, null, `${f} still says "${hit?.[0]}"`);
  }
});

test("the masthead line is the goal, and the front page has no duplicate goal banner", () => {
  const chrome = read("src/components/site/Chrome.tsx");
  assert.match(chrome, /The <span className="italic">Jesus<\/span> Following Index/);
  assert.match(chrome, /LOGO_TAGLINE = "to see every young person have a real opportunity to follow Jesus by 2033\."/);
  const home = read("src/app/page.tsx");
  assert.ok(!/edition=\{GOAL_LINE\}/.test(home));
  assert.match(read("src/app/manifest.ts"), /name: "The Jesus Following Index"/);
});

test("0066 renames the stored email templates, and only the name", () => {
  const sql = read("supabase/migrations/0066_rename_jesus_following_index.sql");
  assert.match(sql, /update public\.comms_templates/);
  assert.ok(!/update public\.comms_sends/.test(sql), "the send log is the record — never rewritten");
  assert.match(sql, /'Jesus Index', 'Jesus Following Index'/);
  assert.match(sql, /\\m\(\[Tt\]\)he Index\\M/, "word-bounded, so 'Exploration Index' and 'Indexes' are untouched");
});
