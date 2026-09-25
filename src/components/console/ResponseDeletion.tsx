"use client";

/**
 * Delete responses — administrators only (migration 0038).
 *
 * For clearing test runs and mistakes. Choose a link, a time window, or both
 * (never the whole organisation at once); preview the exact count; give a
 * reason; confirm. The database re-counts at the moment of deletion and
 * refuses if anything changed since the preview, and writes every deletion,
 * with its reason and your name, to the action log.
 *
 * There is no undo. Organisations can't do this themselves — if a ministry
 * could remove answers it didn't like, the Index would lose its credibility.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type LinkRow = { slug: string; name: string; is_test: boolean; real: number; test: number };
type Preview = { sessions: number; answers: number; first: string | null; last: string | null; changed: boolean };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function ResponseDeletion({ shortName, onChanged }: { shortName: string; onChanged?: () => void }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [link, setLink] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("admin_org_links", { p_short_name: shortName });
    if (error) setErr(/admin_org_links/.test(error.message) ? "Deleting responses needs migration 0038, which isn't applied to this database yet." : error.message);
    else setLinks(data as LinkRow[]);
  }, [sb, shortName]);
  useEffect(() => {
    load();
  }, [load]);

  const args = () => ({
    p_short_name: shortName,
    p_link_slug: link || null,
    p_from: from ? new Date(from).toISOString() : null,
    p_to: to ? new Date(to).toISOString() : null,
  });

  async function runPreview() {
    if (!sb) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    const { data, error } = await sb.rpc("admin_response_deletion", { ...args(), p_confirm: null, p_reason: null });
    setBusy(false);
    if (error) return setErr(error.message);
    setPreview(data as Preview);
  }

  async function runDelete() {
    if (!sb || !preview) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await sb.rpc("admin_response_deletion", { ...args(), p_confirm: preview.sessions, p_reason: reason });
    setBusy(false);
    if (error) return setErr(error.message);
    const r = data as { preview: boolean; deleted_sessions?: number; deleted_answers?: number } & Preview;
    if (r.preview) {
      // Someone answered between preview and delete: show the new count, delete nothing.
      setPreview(r);
      setErr("The count changed since your preview, so nothing was deleted. Check the new count and confirm again.");
      return;
    }
    setMsg(`Deleted ${r.deleted_sessions} response${r.deleted_sessions === 1 ? "" : "s"} (${r.deleted_answers} answers). Recorded in the action log.`);
    setPreview(null);
    setReason("");
    load();
    onChanged?.();
  }

  async function purgeTests() {
    if (!sb) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await sb.rpc("admin_purge_test_data", { p_short_name: shortName });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg(`Deleted ${(data as { deleted_test_sessions: number }).deleted_test_sessions} test responses now (they would have gone after 7 days anyway).`);
    load();
  }

  const testTotal = (links ?? []).reduce((a, l) => a + l.test, 0);
  const scopeOk = Boolean(link) || (Boolean(from) && Boolean(to));

  return (
    <div className="mt-4 rounded-xl border-2 border-vermillion/40 bg-plate p-4">
      <p className="figcap text-vermillion">Delete responses · administrators only · no undo</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        For clearing test runs and mistakes. Choose a link, a time window, or both — never the whole organisation at once.
        Every deletion is written to the action log with your reason.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">Link</span>
          <select value={link} onChange={(e) => { setLink(e.target.value); setPreview(null); }} className="rounded-lg border border-rule-2 bg-plate px-2.5 py-2 text-[14px]">
            <option value="">Any link (use a time window)</option>
            {(links ?? []).map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name} · {l.real} real{l.is_test ? ` · TEST (${l.test})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">From</span>
          <input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} className="rounded-lg border border-rule-2 px-2.5 py-2 text-[14px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">To</span>
          <input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }} className="rounded-lg border border-rule-2 px-2.5 py-2 text-[14px]" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={runPreview} disabled={busy || !scopeOk} className="rounded-lg border border-ink px-4 py-2 text-[14px] font-semibold disabled:opacity-40">
          Preview what would be deleted
        </button>
        {testTotal > 0 && (
          <button type="button" onClick={purgeTests} disabled={busy} className="rounded-lg border border-rule-2 px-4 py-2 text-[14px] font-semibold hover:border-ink">
            Delete {testTotal} test response{testTotal === 1 ? "" : "s"} now
          </button>
        )}
      </div>

      {preview && (
        <div className="mt-3 rounded-lg bg-vermillion/5 p-3">
          {preview.sessions === 0 ? (
            <p className="text-[14px]">Nothing matches — no responses would be deleted.</p>
          ) : (
            <>
              <p className="text-[15px]">
                <b>{preview.sessions.toLocaleString()} response{preview.sessions === 1 ? "" : "s"}</b> ({preview.answers.toLocaleString()} answers),
                from {when(preview.first)} to {when(preview.last)}.
              </p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">Why · recorded in the action log</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Leaders' test run on 25 Sept" className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
              </label>
              <button
                type="button"
                onClick={runDelete}
                disabled={busy || !reason.trim()}
                className="mt-2 rounded-lg bg-vermillion px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
              >
                Delete {preview.sessions.toLocaleString()} response{preview.sessions === 1 ? "" : "s"} permanently
              </button>
            </>
          )}
        </div>
      )}
      {msg && <p className="mt-3 text-[13.5px] text-ink">{msg}</p>}
      {err && <p className="mt-3 text-[13.5px] text-vermillion">{err}</p>}
    </div>
  );
}
