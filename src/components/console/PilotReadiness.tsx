"use client";

/**
 * "May we go?" — the administrator's pilot pre-flight (migration 0042's
 * pilot_readiness()). The checks the database can answer come from the
 * database; the ones it can't are listed as a checklist to confirm by hand
 * (docs/PILOT_LAUNCH_CHECKLIST.md), so nobody mistakes a green panel for a
 * complete sign-off.
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Readiness = {
  ready: boolean;
  checks: { check: string; ok: boolean; detail: string }[];
  not_checkable_here: string[];
  data_spaces: { live: { orgs: number; sessions: number }; demo: { orgs: number; sessions: number } };
  checked_at: string;
};

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
        {r.ready ? "The database is ready — now confirm the list below by hand." : "Not ready yet — see the red items."}
      </p>
      <ul className="divide-y divide-rule rounded-xl border border-rule bg-plate shadow-sm">
        {r.checks.map((c) => (
          <li key={c.check} className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden className="mt-0.5 font-bold" style={{ color: c.ok ? "rgb(var(--c-green))" : "rgb(var(--c-vermillion))" }}>
              {c.ok ? "✓" : "✕"}
            </span>
            <span>
              <span className="sr-only">{c.ok ? "Passed: " : "Needs attention: "}</span>
              <span className="text-[14.5px] font-semibold text-ink">{c.check}</span>
              <span className="block text-[13px] leading-relaxed text-ink-2">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <div>
        <p className="figcap">Confirm by hand — the database can&apos;t see these</p>
        <ul className="mt-2 list-disc pl-5 text-[14px] leading-relaxed text-ink-2">
          {r.not_checkable_here.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
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
