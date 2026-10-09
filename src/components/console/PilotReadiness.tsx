"use client";

/**
 * "May we go?" — the administrator's pilot pre-flight (migration 0042's
 * pilot_readiness(), reshaped in 0049). The checks the database can answer
 * come from the database; the ones it can't are listed as a checklist to
 * confirm by hand (docs/PILOT_LAUNCH_CHECKLIST.md), so nobody mistakes a
 * green panel for a complete sign-off.
 *
 * Since 0049 a check may be NON-blocking (`blocking: false`): it is reported
 * in amber for information and never turns the headline red. Organisations
 * confirming consent is one — each org's own links stay closed until it does.
 * A database that predates 0049 sends no `blocking`, so it defaults to true.
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkState, confirmedLine, headline, type HandCheck, type ReadinessCheck } from "@/lib/readiness";

type Readiness = {
  ready: boolean;
  checks: ReadinessCheck[];
  collection_locked?: boolean;
  not_checkable_here: string[];
  hand_checks?: HandCheck[];
  all_signed_off?: boolean;
  data_spaces: { live: { orgs: number; sessions: number }; demo: { orgs: number; sessions: number } };
  checked_at: string;
};

const STATE_COLOUR = {
  pass: "rgb(var(--c-green))",
  info: "rgb(var(--c-amber))",
  fail: "rgb(var(--c-vermillion))",
} as const;
const STATE_GLYPH = { pass: "✓", info: "•", fail: "✕" } as const;
const STATE_SR = { pass: "Passed: ", info: "For information: ", fail: "Needs attention: " } as const;

export default function PilotReadiness({ sb }: { sb: SupabaseClient | null }) {
  const [r, setR] = useState<Readiness | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("pilot_readiness");
    if (error) setErr(/pilot_readiness/.test(error.message) ? "The readiness check needs migration 0042, which isn't applied to this database yet." : error.message);
    else setR(data as Readiness);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-[14px] text-vermillion">{err}</p>;
  if (!r) return <p className="text-[14px] text-ink-2">Running the checks…</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-[16px] font-semibold">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: r.ready ? "rgb(var(--c-green))" : "rgb(var(--c-vermillion))" }} />
        {headline(r)}
      </p>
      <ul className="divide-y divide-rule rounded-xl border border-rule bg-plate shadow-sm">
        {r.checks.map((c) => {
          const s = checkState(c);
          return (
          <li key={c.check} className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden className="mt-0.5 w-3 text-center font-bold" style={{ color: STATE_COLOUR[s] }}>
              {STATE_GLYPH[s]}
            </span>
            <span>
              <span className="sr-only">{STATE_SR[s]}</span>
              <span className="text-[14.5px] font-semibold text-ink">{c.check}</span>
              <span className="block text-[13px] leading-relaxed text-ink-2">{c.detail}</span>
            </span>
          </li>
          );
        })}
      </ul>
      <div>
        <p className="figcap">
          Confirm by hand — the database can&apos;t see these
          {r.hand_checks && (r.all_signed_off ? " · all signed off" : ` · ${r.hand_checks.filter((h) => h.confirmed).length} of ${r.hand_checks.length} signed off`)}
        </p>
        {r.hand_checks ? (
          <ul className="mt-2 divide-y divide-rule rounded-xl border border-rule bg-plate">
            {r.hand_checks.map((h) => (
              <HandCheckRow key={h.item} h={h} sb={sb} onChange={setR} />
            ))}
          </ul>
        ) : (
          <ul className="mt-2 list-disc pl-5 text-[14px] leading-relaxed text-ink-2">
            {r.not_checkable_here.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[12.5px] text-muted">
        Live space: {r.data_spaces.live.orgs} organisations, {r.data_spaces.live.sessions} sessions · Sandbox:{" "}
        {r.data_spaces.demo.orgs} organisations · checked {new Date(r.checked_at).toLocaleString()} ·{" "}
        <button type="button" onClick={load} className="font-semibold text-ink underline underline-offset-2">
          run again
        </button>
      </p>
    </div>
  );
}

/** One hand-confirmed item: confirm (with a note where required) or withdraw. */
function HandCheckRow({
  h,
  sb,
  onChange,
}: {
  h: HandCheck;
  sb: SupabaseClient | null;
  onChange: (r: Readiness) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const line = confirmedLine(h);

  async function act(kind: "confirm" | "revoke") {
    if (!sb) return;
    let reason: string | null = null;
    if (kind === "revoke") {
      reason = window.prompt("Why is this sign-off being withdrawn?");
      if (!reason) return;
    }
    setBusy(true);
    setErr(null);
    const { data, error } =
      kind === "confirm"
        ? await sb.rpc("confirm_pilot_item", { p_item: h.item, p_note: note || null })
        : await sb.rpc("revoke_pilot_item", { p_item: h.item, p_reason: reason });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setNote("");
      onChange(data as Readiness);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <span className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 w-3 text-center font-bold" style={{ color: h.confirmed ? "rgb(var(--c-green))" : "rgb(var(--c-muted))" }}>
          {h.confirmed ? "✓" : "○"}
        </span>
        <span>
          <span className="sr-only">{h.confirmed ? "Signed off: " : "Not yet signed off: "}</span>
          <span className="text-[14px] text-ink">{h.label}</span>
          {line && <span className="block text-[12.5px] text-ink-2">{line}{h.note ? ` — ${h.note}` : ""}</span>}
          {err && <span className="block text-[12.5px] text-vermillion">{err}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 sm:pl-4">
        {!h.confirmed && h.requires_note && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note or link (required)"
            aria-label={`Note for: ${h.label}`}
            className="w-48 rounded-md border border-rule-2 px-2 py-1 text-[13px]"
          />
        )}
        {h.confirmed ? (
          <button type="button" disabled={busy} onClick={() => act("revoke")} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 hover:border-ink">
            Withdraw
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || (h.requires_note && !note.trim())}
            onClick={() => act("confirm")}
            className="rounded-md bg-ink px-2.5 py-1 text-[12.5px] font-semibold text-paper disabled:opacity-40"
          >
            Confirm
          </button>
        )}
      </span>
    </li>
  );
}
