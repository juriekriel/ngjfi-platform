import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Migration 0048: the survey runs, nothing is collected. These checks keep the
// lock from being quietly weakened by a later edit to the migration.
const sql = readFileSync("supabase/migrations/0048_collection_lock.sql", "utf8");

function body(name: string): string {
  const i = sql.search(new RegExp(`function public\\.${name}\\(`, "i"));
  assert.ok(i >= 0, `${name} is redefined in 0048`);
  const end = sql.indexOf("$", sql.indexOf("end;", i));
  return sql.slice(i, end);
}

test("the lock is seeded ON and fails closed when the setting is missing", () => {
  assert.match(sql, /\('collection_locked', 'true'::jsonb/);
  assert.match(sql, /setting_bool\('collection_locked', true\)/);
});

test("every live write RPC checks the lock, after its test-link branch", () => {
  for (const fn of ["start_session", "save_response", "set_session_context", "finish_session", "delete_response"]) {
    const b = body(fn);
    const guard = b.indexOf("collection_locked()");
    assert.ok(guard > 0, `${fn} checks the lock`);
    assert.ok(b.indexOf("test_sessions") < guard, `${fn}: test links still record`);
    for (const write of ["insert into sessions", "insert into responses", "update sessions", "delete from responses"]) {
      const w = b.indexOf(write);
      if (w >= 0) assert.ok(guard < w, `${fn}: lock comes before "${write}"`);
    }
  }
});

test("discard_session is never locked — an under-13 session must always be deletable", () => {
  assert.doesNotMatch(sql, /function public\.discard_session\(/i);
});

test("triggers refuse live sessions and responses while locked", () => {
  assert.match(sql, /before insert on public\.sessions/);
  assert.match(sql, /before insert on public\.responses/);
});
