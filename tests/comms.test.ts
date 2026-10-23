import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  FACT_KEYS,
  PLACEHOLDERS,
  STAGES,
  bodyToHtml,
  factVars,
  listNames,
  usesFacts,
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

const facts = { org_count: 14, countries: ["United States", "Argentina", "United States"], completion_count: 1203 };

test("every placeholder is filled per recipient, with their own links", () => {
  const v = varsFor(person, "https://jfindx.org/", "Ulrich", facts);
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

// ---------------------------------------------------------------------------
// Stages (migration 0063)
// ---------------------------------------------------------------------------

test("the four stages, in order", () => {
  assert.deepEqual(STAGES.map((s) => s.label), ["Launch", "Support and Encouragement", "Reading your Data", "Global Perspective"]);
});

test("each stage is its own sequence; a template with no stage is Launch", () => {
  const t = (key: string, position: number, stage?: CommsTemplate["stage"]): CommsTemplate => ({ key, title: key, subject: key, body: key, kind: "sequence", position, stage });
  const all = [t("l2", 2), t("s1", 1, "support"), t("l1", 1, "launch"), t("g1", 1, "global")];
  assert.deepEqual(sequenceOf(all, "launch").map((x) => x.key), ["l1", "l2"]);
  assert.deepEqual(sequenceOf(all, "support").map((x) => x.key), ["s1"]);
  assert.equal(nextStep(all, { sent: { l1: "x" } }, "launch")?.key, "l2");
  assert.equal(nextStep(all, { sent: {} }, "global")?.key, "g1");
});

test("live figures: coarse, deduplicated, and never blank", () => {
  assert.equal(listNames(["Kenya", "Argentina", "Brazil"]), "Argentina, Brazil and Kenya");
  assert.equal(listNames(["Kenya"]), "Kenya");
  assert.equal(listNames([]), "no countries yet");
  const v = factVars(facts);
  assert.equal(v.country_count, "2", "a country listed twice counts once");
  assert.equal(v.country_list, "Argentina and United States");
  assert.equal(v.completion_count, "1,203");
  // Without the figures, a fact placeholder is reported missing — never sent blank.
  const e = renderEmail({ subject: "x", body: "{{org_count}} organisations" }, person, "https://jfindx.org", "U");
  assert.deepEqual(e.missing, ["org_count"]);
  assert.ok(usesFacts("Hi {{ country_list }}"));
  assert.ok(!usesFacts("Hi {{org_name}}"));
  for (const k of FACT_KEYS) assert.ok(PLACEHOLDERS.some((p) => p.key === k), `${k} is offered in the composer`);
});

test("0063 seeds every stage, with placeholders the app can fill", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0063_comms_stages.sql", import.meta.url), "utf8");
  const seeded = sql.slice(sql.indexOf("insert into public.comms_templates"));
  assert.deepEqual(unknownPlaceholders(seeded), []);
  for (const st of ["launch", "support", "reading", "global"]) assert.match(seeded, new RegExp(`'sequence', \\d+, '${st}'\\)`), `${st} has a step`);
  assert.match(seeded, /\{\{pitch_docs_url\}\}/, "Launch points to the pitch documents");
  assert.match(seeded, /\{\{intelligence_url\}\}/, "Reading your Data points to Collab Intelligence");
  assert.match(seeded, /\{\{consult_url\}\}/, "and to consulting");
  assert.match(seeded, /\{\{country_list\}\}/, "Global Perspective names the countries");
  assert.match(seeded, /those who have completed the Index/, "and never overclaims");
  // The live figures are organisations, their countries and one global total —
  // no per-country count of young people.
  assert.ok(!/sessions s[\s\S]{0,200}group by[\s\S]{0,40}country/i.test(sql));
});
