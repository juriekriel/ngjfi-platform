import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  PLACEHOLDERS,
  bodyToHtml,
  fill,
  firstNameFrom,
  nextStep,
  renderEmail,
  sequenceOf,
  unknownPlaceholders,
  varsFor,
  type CommsTemplate,
} from "../src/lib/comms.ts";

const person = { email: "jurie.kriel@sunriseyouth.org", name: null, org_name: "Sunrise Youth", org_slug: "sunrise" };

test("first names: saved name first, then a careful guess, never a role mailbox", () => {
  assert.equal(firstNameFrom("ulrich lombard", "x@y.org"), "Ulrich");
  assert.equal(firstNameFrom(null, "jurie.kriel@sunriseyouth.org"), "Jurie");
  assert.equal(firstNameFrom(null, "admin@church.org"), null);
  assert.equal(firstNameFrom(null, "youth@church.org"), null);
  assert.equal(firstNameFrom(null, "jk2026@church.org"), null);
  assert.equal(firstNameFrom("", "info@church.org"), null);
});

test("every placeholder is filled per recipient, with their own links", () => {
  const v = varsFor(person, "https://jfindx.org/", "Ulrich");
  for (const p of PLACEHOLDERS) assert.ok(v[p.key], `no value for {{${p.key}}}`);
  assert.equal(v.dashboard_url, "https://jfindx.org/sunrise/dashboard");
  assert.equal(v.tour_url, "https://jfindx.org/sunrise/dashboard?tour=1");
  assert.equal(v.consult_url, "https://jfindx.org/sunrise/dashboard?consult=1");
  assert.equal(varsFor({ ...person, email: "office@x.org" }, "https://jfindx.org", "").first_name, "there");
});

test("unknown placeholders are reported, not blanked", () => {
  const r = fill("Hi {{first_name}} at {{church}}", { first_name: "Ana" });
  assert.equal(r.text, "Hi Ana at {{church}}");
  assert.deepEqual(r.missing, ["church"]);
  assert.deepEqual(unknownPlaceholders("{{org_name}} {{oops}}"), ["oops"]);
});

test("the body markup escapes HTML before formatting it", () => {
  const html = bodyToHtml("Hello <script>x</script> **bold**\n\n- one\n- two\n\n1. a\n2. b\n\nSee https://jfindx.org/sunrise.");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(/<ul[^>]*><li[^>]*>one<\/li><li[^>]*>two<\/li><\/ul>/.test(html));
  assert.ok(/<ol[^>]*>/.test(html));
  assert.ok(html.includes('href="https://jfindx.org/sunrise"'), "trailing full stop stays out of the link");
});

test("a rendered email names the organisation in the footer and fills the subject", () => {
  const e = renderEmail({ subject: "Hi {{org_name}}", body: "Hi {{first_name}}, {{dashboard_url}}" }, person, "https://jfindx.org", "Ulrich");
  assert.equal(e.subject, "Hi Sunrise Youth");
  assert.ok(e.html.includes("Org Administrator for Sunrise Youth"));
  assert.ok(e.text.startsWith("Hi Jurie, https://jfindx.org/sunrise/dashboard"));
  assert.deepEqual(e.missing, []);
});

test("next step is the first sequence template not yet sent", () => {
  const t = (key: string, position: number | null, kind: CommsTemplate["kind"] = "sequence"): CommsTemplate => ({ key, title: key, subject: key, body: key, kind, position });
  const all = [t("b", 2), t("u", null, "update"), t("a", 1), t("c", 3)];
  assert.deepEqual(sequenceOf(all).map((x) => x.key), ["a", "b", "c"]);
  assert.equal(nextStep(all, { sent: {} })?.key, "a");
  assert.equal(nextStep(all, { sent: { a: "2026-10-01" } })?.key, "b");
  assert.equal(nextStep(all, { sent: { a: "x", b: "x", c: "x" } }), null);
});

test("the six seeded steps use only placeholders the app can fill", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0056_dashboard_tour_and_admin_comms.sql", import.meta.url), "utf8");
  const seeded = sql.slice(sql.indexOf("insert into public.comms_templates"));
  assert.equal((seeded.match(/'sequence', \d\)/g) ?? []).length, 6, "six sequence steps");
  assert.deepEqual(unknownPlaceholders(seeded), []);
});
