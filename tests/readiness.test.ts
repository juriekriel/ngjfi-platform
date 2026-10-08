import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkState, confirmedLine, headline } from "../src/lib/readiness.ts";

const sql = readFileSync("supabase/migrations/0049_readiness_advisory_consent.sql", "utf8");

test("a non-blocking failure is information, never red", () => {
  assert.equal(checkState({ check: "x", ok: false, detail: "", blocking: false }), "info");
  assert.equal(checkState({ check: "x", ok: false, detail: "", blocking: true }), "fail");
  assert.equal(checkState({ check: "x", ok: false, detail: "" }), "fail", "pre-0049 databases default to blocking");
  assert.equal(checkState({ check: "x", ok: true, detail: "", blocking: false }), "pass");
});

test("the headline is red only when a blocking check fails", () => {
  const info = { check: "consent", ok: false, detail: "", blocking: false };
  assert.match(headline({ ready: true, checks: [info] }), /^Ready to pilot/);
  assert.match(headline({ ready: false, checks: [info] }), /^Not ready/);
  assert.match(headline({ ready: true, checks: [] }), /^The database is ready/);
});

test("0049 makes consent non-blocking and computes ready over blocking checks only", () => {
  const consent = sql.indexOf("'Organisations collect once they confirm consent'");
  assert.ok(consent > 0);
  assert.match(sql.slice(consent, consent + 120), /'blocking', false/);
  assert.match(sql, /coalesce\(\(c->>'blocking'\)::boolean, true\) and not \(c->>'ok'\)::boolean/);
  for (const kept of ["Global view is not published yet", "A retention period has been decided",
                      "Exactly one instrument version is active", "Critical-mass gates are set"]) {
    const i = sql.indexOf(`'${kept}'`);
    assert.ok(i > 0, `${kept} is still checked`);
    assert.match(sql.slice(i, i + 120), /'blocking', true/, `${kept} stays blocking`);
  }
});

test("0049 leaves the consent safeguards themselves alone", () => {
  for (const fn of ["attest_edge_consent", "org_consent_status", "refuse_sessions_without_consent", "start_session"]) {
    assert.ok(!sql.includes(`function public.${fn}(`), `${fn} is not redefined here`);
  }
});

test("a confirmed hand check says who and when", () => {
  const h = { item: "smtp", label: "SMTP", requires_note: false, confirmed: true,
              confirmed_at: "2026-10-08T10:00:00Z", confirmed_by: "Jurie Kriel", note: null };
  assert.equal(confirmedLine(h), "Confirmed by Jurie Kriel · 8 Oct 2026");
  assert.equal(confirmedLine({ ...h, confirmed: false }), null);
});
