/**
 * The survey outbox — the logic, with no browser or network dependencies, so
 * it is unit-tested directly (tests/outbox.test.ts). src/lib/outbox.ts binds
 * it to IndexedDB and Supabase.
 *
 * Why an outbox: the survey is taken on cheap phones, in camps, on bad
 * signal (CLAUDE.md §4). Every write the survey makes is recorded on the
 * phone FIRST, then sent in order. Online, that is indistinguishable from
 * sending directly (answers still stream one at a time, so a respondent who
 * stops halfway is still counted as started). Offline, writes wait on the
 * phone and are sent when the signal comes back — from any page of the site,
 * whenever it is next opened.
 *
 * A session is created with a LOCAL key. The server's session id only exists
 * once start_session() succeeds, so every later write names the local key and
 * is re-pointed at the server id when it is sent.
 *
 * Every survey write after start_session is idempotent (save_response is an
 * upsert, set_session_context an update, delete_response a delete,
 * finish_session sets a flag), so a write that reached the server but whose
 * reply was lost is simply sent again.
 *
 * What is stored on the phone: the anonymous answers of sessions not yet
 * sent, and nothing else. Each write is deleted the moment the server has
 * it. No name, email or other identifier is ever part of a survey write.
 */

export type OpKind = "start" | "save" | "context" | "delete" | "finish";

export type Op = {
  /** Assigned by the store; defines send order. */
  id?: number;
  session: string; // local session key
  kind: OpKind;
  args: Record<string, unknown>;
  tries?: number;
  createdAt: number;
};

export type SessionRow = { local: string; server: string | null; dead?: boolean; reason?: string };

export interface OutboxStore {
  allOps(): Promise<Op[]>; // in send order
  deleteOp(id: number): Promise<void>;
  bumpTries(id: number): Promise<void>;
  getSession(local: string): Promise<SessionRow | undefined>;
  putSession(row: SessionRow): Promise<void>;
  deleteSession(local: string): Promise<void>;
}

export type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

export const RPC_FOR: Record<OpKind, string> = {
  start: "start_session",
  save: "save_response",
  context: "set_session_context",
  delete: "delete_response",
  finish: "finish_session",
};

/**
 * A failure is PERMANENT when the server answered and refused (it carries a
 * Postgres / PostgREST error code — "link is not open right now", "this
 * organisation is still being set up"). Retrying those forever would jam the
 * queue. Anything without a code — no signal, timeout, DNS, a 5xx gateway —
 * is treated as temporary and retried.
 */
export function isPermanent(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  if (!error.code) return false;
  // 5xx-ish / connection classes from PostgREST are worth retrying.
  if (/^(08|53|57P|58)/.test(error.code) || error.code === "PGRST000" || error.code === "PGRST001" || error.code === "PGRST002")
    return false;
  return true;
}

export type DrainResult = { sent: number; dropped: number; remaining: number; stoppedOffline: boolean };

/**
 * Send queued writes in order until the queue is empty or the network fails.
 * Stops at the FIRST temporary failure, so order is always preserved.
 */
export async function drain(store: OutboxStore, rpc: Rpc): Promise<DrainResult> {
  let sent = 0;
  let dropped = 0;
  let stoppedOffline = false;
  const ops = await store.allOps();

  for (const op of ops) {
    const id = op.id as number;
    const session = await store.getSession(op.session);

    if (op.kind === "start") {
      if (session?.server) {
        // Already started (a previous attempt succeeded) — the op is stale.
        await store.deleteOp(id);
        continue;
      }
      const res = await rpc(RPC_FOR.start, op.args);
      if (res.error) {
        if (isPermanent(res.error)) {
          await store.putSession({ local: op.session, server: null, dead: true, reason: res.error.message });
          await store.deleteOp(id);
          dropped++;
          continue;
        }
        await store.bumpTries(id);
        stoppedOffline = true;
        break;
      }
      await store.putSession({ local: op.session, server: String(res.data) });
      await store.deleteOp(id);
      sent++;
      continue;
    }

    // Later writes need the server id. A session the server refused takes its
    // answers with it — there is nothing to attach them to.
    if (!session || session.dead || !session.server) {
      if (session?.dead) {
        await store.deleteOp(id);
        dropped++;
        continue;
      }
      // Its start op hasn't been sent yet (it failed temporarily above).
      stoppedOffline = true;
      break;
    }

    const res = await rpc(RPC_FOR[op.kind], { ...op.args, p_session_id: session.server });
    if (res.error) {
      if (isPermanent(res.error)) {
        await store.deleteOp(id);
        dropped++;
        continue;
      }
      await store.bumpTries(id);
      stoppedOffline = true;
      break;
    }
    await store.deleteOp(id);
    sent++;
    if (op.kind === "finish") {
      // Nothing else will reference this session; forget the id mapping.
      const rest = (await store.allOps()).some((o) => o.session === op.session);
      if (!rest) await store.deleteSession(op.session);
    }
  }

  const remainingOps = await store.allOps();
  return { sent, dropped, remaining: remainingOps.length, stoppedOffline };
}

/** An in-memory store — for tests, and a fallback where IndexedDB is unavailable. */
export function memoryStore(): OutboxStore & { add(op: Op): Promise<number> } {
  let next = 1;
  const ops = new Map<number, Op>();
  const sessions = new Map<string, SessionRow>();
  return {
    async add(op) {
      const id = next++;
      ops.set(id, { ...op, id });
      return id;
    },
    async allOps() {
      return [...ops.values()].sort((a, b) => (a.id as number) - (b.id as number));
    },
    async deleteOp(id) {
      ops.delete(id);
    },
    async bumpTries(id) {
      const o = ops.get(id);
      if (o) o.tries = (o.tries ?? 0) + 1;
    },
    async getSession(local) {
      return sessions.get(local);
    },
    async putSession(row) {
      sessions.set(row.local, row);
    },
    async deleteSession(local) {
      sessions.delete(local);
    },
  };
}
