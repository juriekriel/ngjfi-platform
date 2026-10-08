"use client";

/**
 * Survey completion across every live organisation (0052 collab_completion()).
 * The attention-check pass rate is a data-quality line for researchers and
 * the Collab only — organisations never see it.
 */
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Completion } from "@/lib/breakdown";

type Row = Completion & {
  org: string;
  name: string;
  attention_check: { checked: number; passed: number; pass_rate: number | null } | null;
};

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default function CollabCompletion({ sb }: { sb: SupabaseClient | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!sb) return;
    sb.rpc("collab_completion").then(({ data, error }) => {
      if (error) setErr(/collab_completion/.test(error.message) ? "Needs migration 0052." : error.message);
      else setRows(data as Row[]);
    });
  }, [sb]);

  if (err) return <p className="text-[14px] text-vermillion">{err}</p>;
  if (!rows) return <p className="text-[14px] text-ink-2">Loading…</p>;
  if (rows.length === 0) return <p className="text-[14px] text-ink-2">No live organisations yet.</p>;

  const t = rows.reduce((a, r) => ({ s: a.s + r.started, c: a.c + r.completed, b: a.b + r.rate_base }), { s: 0, c: 0, b: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-[13.5px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="py-1 font-medium">Organisation</th>
            <th className="py-1 text-right font-medium">Started</th>
            <th className="py-1 text-right font-medium">Finished</th>
            <th className="py-1 text-right font-medium">Rate</th>
            <th className="py-1 text-right font-medium">Opted into extras</th>
            <th className="py-1 text-right font-medium">Attention check passed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.map((r) => (
            <tr key={r.org}>
              <td className="py-1.5 text-ink">{r.name}</td>
              <td className="tabular py-1.5 text-right">{r.started}</td>
              <td className="tabular py-1.5 text-right">{r.completed}</td>
              <td className="tabular py-1.5 text-right">{pct(r.completion_rate)}</td>
              <td className="tabular py-1.5 text-right">{pct(r.extras_opt_in_rate)}</td>
              <td className="tabular py-1.5 text-right">{pct(r.attention_check?.pass_rate)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">All live organisations</td>
            <td className="tabular py-1.5 text-right">{t.s}</td>
            <td className="tabular py-1.5 text-right">{t.c}</td>
            <td className="tabular py-1.5 text-right">{t.b > 0 ? pct(t.c / t.b) : "—"}</td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[12px] text-muted">
        Rates count only surveys started more than two days ago, and show once 10 have had time to finish. The attention
        check is for researchers — organisations never see it.
      </p>
    </div>
  );
}
