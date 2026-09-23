import { strict as assert } from "node:assert";
import { test } from "node:test";
import { drain, isPermanent, memoryStore, type Rpc } from "../src/lib/outboxCore.ts";

/**
 * The offline outbox: survey writes recorded on the phone first, sent in
 * order, never lost to a dropped signal, and never allowed to jam the queue.
 */
const NET = { message: "TypeError: Failed to fetch" }; // no code → temporary
const REFUSED = { message: "link is not open right now", code: "P0001" }; // permanent

function fakeServer() {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let online = true;
  let n = 0;
  const refuse = new Set<string>();
  const rpc: Rpc = async (fn, args) => {
    if (!online) return { data: null, error: NET };
    calls.push({ fn, args });
    if (refuse.has(fn)) return { data: null, error: REFUSED };
    if (fn === "start_session") return { data: `srv-${++n}`, error: null };
    return { data: null, error: null };
  };
  return { rpc, calls, setOnline: (v: boolean) => (online = v), refuse };
}

const op = (session: string, kind: "start" | "save" | "context" | "delete" | "finish", args: Record<string, unknown> = {}) => ({
  session, kind, args, createdAt: Date.now(),
});

test("online: writes go out in order, with the server's session id", async () => {
  const s = memoryStore();
  const srv = fakeServer();
  await s.add(op("L1", "start", { p_campaign_id: "c" }));
  await s.add(op("L1", "save", { p_session_id: "L1", p_item_key: "q1", p_raw: 3 }));
  await s.add(op("L1", "finish", { p_session_id: "L1" }));
  const r = await drain(s, srv.rpc);
  assert.deepEqual([r.sent, r.remaining, r.stoppedOffline], [3, 0, false]);
  assert.deepEqual(srv.calls.map((c) => c.fn), ["start_session", "save_response", "finish_session"]);
  assert.equal(srv.calls[1].args.p_session_id, "srv-1");
  assert.equal(srv.calls[2].args.p_session_id, "srv-1");
});

test("offline: nothing is lost, nothing is reordered, and it all sends later", async () => {
  const s = memoryStore();
  const srv = fakeServer();
  srv.setOnline(false);
  await s.add(op("L1", "start"));
  await s.add(op("L1", "save", { p_item_key: "q1", p_raw: 1 }));
  await s.add(op("L1", "save", { p_item_key: "q2", p_raw: 2 }));
  let r = await drain(s, srv.rpc);
  assert.deepEqual([r.sent, r.remaining, r.stoppedOffline], [0, 3, true]);
  srv.setOnline(true);
  r = await drain(s, srv.rpc);
  assert.deepEqual([r.sent, r.remaining], [3, 0]);
  assert.deepEqual(srv.calls.map((c) => c.args.p_item_key ?? c.fn), ["start_session", "q1", "q2"]);
});

test("signal drops mid-session: the rest waits, then resumes against the same server session", async () => {
  const s = memoryStore();
  const srv = fakeServer();
  await s.add(op("L1", "start"));
  await s.add(op("L1", "save", { p_item_key: "q1" }));
  await drain(s, srv.rpc);
  srv.setOnline(false);
  await s.add(op("L1", "save", { p_item_key: "q2" }));
  await s.add(op("L1", "finish"));
  await drain(s, srv.rpc);
  srv.setOnline(true);
  const r = await drain(s, srv.rpc);
  assert.equal(r.remaining, 0);
  assert.equal(srv.calls.filter((c) => c.fn === "start_session").length, 1, "never starts a second session");
  assert.ok(srv.calls.slice(1).every((c) => c.args.p_session_id === "srv-1"));
});

test("a refused session (e.g. link closed) is dropped with its answers, and does not jam the next person's", async () => {
  const s = memoryStore();
  const srv = fakeServer();
  srv.refuse.add("start_session");
  await s.add(op("L1", "start"));
  await s.add(op("L1", "save", { p_item_key: "q1" }));
  let r = await drain(s, srv.rpc);
  assert.deepEqual([r.sent, r.dropped, r.remaining], [0, 2, 0]);
  srv.refuse.clear();
  await s.add(op("L2", "start"));
  await s.add(op("L2", "save", { p_item_key: "q1" }));
  r = await drain(s, srv.rpc);
  assert.deepEqual([r.sent, r.remaining], [2, 0]);
});

test("a refused single answer is dropped; the session carries on", async () => {
  const s = memoryStore();
  const srv = fakeServer();
  await s.add(op("L1", "start"));
  await s.add(op("L1", "context", { p_field: "bad" }));
  await s.add(op("L1", "save", { p_item_key: "q1" }));
  srv.refuse.add("set_session_context");
  const r = await drain(s, srv.rpc);
  assert.deepEqual([r.sent, r.dropped, r.remaining], [2, 1, 0]);
});

test("two people on one phone, both offline: both sessions send, each to its own server session", async () => {
  const s = memoryStore();
  const srv = fakeServer();
  srv.setOnline(false);
  for (const L of ["A", "B"]) {
    await s.add(op(L, "start"));
    await s.add(op(L, "save", { p_item_key: "q1" }));
    await s.add(op(L, "finish"));
  }
  await drain(s, srv.rpc);
  srv.setOnline(true);
  await drain(s, srv.rpc);
  const saves = srv.calls.filter((c) => c.fn === "save_response").map((c) => c.args.p_session_id);
  assert.deepEqual(saves, ["srv-1", "srv-2"]);
});

test("isPermanent: codes are refusals, no code is a network problem", () => {
  assert.equal(isPermanent(REFUSED), true);
  assert.equal(isPermanent(NET), false);
  assert.equal(isPermanent({ message: "conn", code: "08006" }), false);
  assert.equal(isPermanent(null), false);
});
