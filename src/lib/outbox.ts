"use client";

/**
 * The survey outbox, bound to the phone (IndexedDB) and the server (Supabase).
 * Logic lives in outboxCore.ts; this file only stores, schedules and reports.
 *
 * Drains: immediately after every write, when the browser comes back online,
 * when the page becomes visible again, and every 20s while anything is
 * waiting. One tab drains at a time (Web Locks where available).
 */
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { drain, memoryStore, type Op, type OpKind, type OutboxStore, type SessionRow } from "@/lib/outboxCore";

const DB = "jfindx-outbox";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("ops")) db.createObjectStore("ops", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "local" });
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

const idbStore: OutboxStore & { add(op: Op): Promise<number> } = {
  add: (op) => tx<IDBValidKey>("ops", "readwrite", (s) => s.add(op)).then((k) => Number(k)),
  allOps: () => tx<Op[]>("ops", "readonly", (s) => s.getAll() as IDBRequest<Op[]>),
  deleteOp: (id) => tx("ops", "readwrite", (s) => s.delete(id)).then(() => undefined),
  bumpTries: async (id) => {
    const o = await tx<Op | undefined>("ops", "readonly", (s) => s.get(id) as IDBRequest<Op | undefined>);
    if (o) await tx("ops", "readwrite", (s) => s.put({ ...o, tries: (o.tries ?? 0) + 1 }));
  },
  getSession: (local) => tx<SessionRow | undefined>("sessions", "readonly", (s) => s.get(local) as IDBRequest<SessionRow | undefined>),
  putSession: (row) => tx("sessions", "readwrite", (s) => s.put(row)).then(() => undefined),
  deleteSession: (local) => tx("sessions", "readwrite", (s) => s.delete(local)).then(() => undefined),
};

const hasIdb = () => typeof indexedDB !== "undefined";
let fallback: ReturnType<typeof memoryStore> | null = null;
const store = () => (hasIdb() ? idbStore : (fallback ??= memoryStore()));

/* ── reporting ─────────────────────────────────────────────────────────── */

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
let lastPending = 0;
function report(n: number) {
  lastPending = n;
  listeners.forEach((l) => l(n));
}
export function onPending(l: Listener) {
  listeners.add(l);
  l(lastPending);
  return () => listeners.delete(l);
}
export async function pendingCount(): Promise<number> {
  try {
    return (await store().allOps()).length;
  } catch {
    return 0;
  }
}

/* ── writing ───────────────────────────────────────────────────────────── */

export async function enqueue(session: string, kind: OpKind, args: Record<string, unknown>) {
  await store().add({ session, kind, args, createdAt: Date.now() });
  report(await pendingCount());
  void kick();
}

/* ── sending ───────────────────────────────────────────────────────────── */

let running = false;
export async function kick(): Promise<void> {
  if (running) return;
  const sb = getSupabaseBrowser();
  if (!sb) return;
  running = true;
  const run = async () => {
    try {
      await drain(store(), async (fn, args) => {
        try {
          const { data, error } = await sb.rpc(fn, args);
          return { data, error: error ? { message: error.message, code: error.code || undefined } : null };
        } catch (e) {
          return { data: null, error: { message: e instanceof Error ? e.message : "network error" } };
        }
      });
    } finally {
      report(await pendingCount());
    }
  };
  try {
    const locks = (navigator as Navigator & { locks?: { request: (n: string, o: object, f: () => Promise<void>) => Promise<void> } }).locks;
    if (locks) await locks.request("jfindx-outbox", { ifAvailable: true }, async (lock?: unknown) => { if (lock !== null) await run(); });
    else await run();
  } finally {
    running = false;
  }
}

let scheduled = false;
/** Start background draining for this page. Safe to call more than once. */
export function startDraining() {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  const go = () => void kick();
  window.addEventListener("online", go);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && go());
  setInterval(async () => {
    if ((await pendingCount()) > 0) go();
  }, 20_000);
  pendingCount().then((n) => {
    report(n);
    if (n > 0) go();
  });
}

/* ── small cache for what the survey needs to open with no signal ──────── */

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (!hasIdb()) return undefined;
  try {
    return await tx<T | undefined>("cache", "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
  } catch {
    return undefined;
  }
}
export async function cacheSet(key: string, value: unknown): Promise<void> {
  if (!hasIdb()) return;
  try {
    await tx("cache", "readwrite", (s) => s.put(value, key));
  } catch {
    /* storage full or blocked — the survey still works online */
  }
}

/** A fresh local session key. */
export const newLocalSession = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `L-${Date.now()}-${Math.random().toString(36).slice(2)}`;
