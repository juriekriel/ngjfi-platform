/**
 * "More detail" — the panels under an organisation's headline results: the
 * movement over time, the per-question table, Drivers & Journey, insight
 * modules. (The Exploration Index moved up to the frame's Unengaged
 * matrix view in migration 0047 — see UnengagedMatrix.)
 *
 * One component for the signed-in dashboard and the view-only share page
 * (/view/[token], migration 0046), so the two can never drift apart — the
 * same rule CLAUDE.md applies to the demo. It draws only what the server
 * returned: every floor (min_group_n, the insight gate, trend years) is held
 * in the database, and a field the server left out simply doesn't render.
 *
 * Insight layers are reported beside the Index, never blended into it
 * (CLAUDE.md #6, #9).
 */
import ModuleInsights from "@/components/index/ModuleInsights";
import { optionsFor } from "@/lib/modules";
import { instrument, t } from "@/lib/instrument";

type Matrix = Record<string, Record<string, number | null>>;
export type DetailItem = { key: string; domain: string; tier: string; mean: number | null; n: number };
/** Drivers/Journey are unscored (option-selection rates, not means). Below
 * min_group_n, `options` is null but `n` is still shown. */
type InsightAgg = { n: number; options: Record<string, number> | null };
export type DetailDash = {
  n: number;
  suppressed?: boolean;
  min_group_n?: number;
  items?: DetailItem[];
  trend?: { year: number; index: number }[] | null;
  insights?: Record<string, InsightAgg>;
  /** The Exploration Index (0026) — a SEPARATE figure, never blended with the Index. */
  exploration_n?: number;
  exploration_suppressed?: boolean;
  exploration_index?: number | null;
  exploration_tiers?: Record<string, number | null>;
  exploration_domains?: Record<string, number | null>;
  exploration_matrix?: Matrix;
};

const TIER_LABEL: Record<string, string> = {
  exposure: "Exposure", response: "Response", formation: "Formation", multiplication: "Multiplication",
};
const ITEM_LABEL: Record<string, string> = Object.fromEntries(
  instrument.items.map((i) => [i.key, t(i.text, "en")]),
);
// Drivers/Journey, in instrument order — derived from the instrument, never hard-coded.
const INSIGHT_ITEMS = instrument.items
  .filter((i) => i.question_domain === "drivers" || i.question_domain === "journey")
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((i) => ({
    key: i.key,
    domain: i.question_domain,
    label: t(i.text, "en"),
    multi: i.type === "multi_select",
    options: optionsFor(i),
  }));
const labelFor = (key: string) => ITEM_LABEL[key] ?? key;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n));

export default function ResultsDetail({ dash }: { dash: DetailDash }) {
  return (
    <>
              {!dash.suppressed && (
                <>
          {/* trend over waves */}
          {dash.trend && dash.trend.length > 1 && (
            <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Movement over time</div>
              <div className="mt-3 flex items-end gap-5">
                {dash.trend.map((p) => (
                  <div key={p.year} className="flex flex-col items-center gap-1">
                    <div className="text-xs font-bold">{p.index}</div>
                    <div className="w-10 rounded-t bg-moss" style={{ height: `${Math.max(6, (p.index / 5) * 90)}px` }} />
                    <div className="font-mono text-[10px] text-muted">{p.year}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* per-item table */}
          <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Per-question detail</div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-wider text-muted">
                  <th className="pb-2">Item</th><th className="pb-2">Tier</th><th className="pb-2 text-right">Mean</th><th className="pb-2 text-right">n</th>
                </tr>
              </thead>
              <tbody>
                {(dash.items || []).map((it) => (
                  <tr key={it.key} className="border-t border-rule">
                    <td className="py-1.5 pr-2">{labelFor(it.key) || it.key}</td>
                    <td className="py-1.5 font-mono text-[10px] uppercase text-muted">{TIER_LABEL[it.tier] || it.tier}</td>
                    <td className="py-1.5 text-right font-semibold">{fmt(it.mean)}</td>
                    <td className="py-1.5 text-right font-mono text-[11px] text-muted">{it.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Drivers & Journey — unscored insight layers, reported separately from
              the Index above, never blended into it (CLAUDE.md #6, #9). */}
          {dash.insights && Object.keys(dash.insights).length > 0 && (
            <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">
                Drivers &amp; journey — not part of the Index score
              </div>
              <div className="mt-3 space-y-4">
                {INSIGHT_ITEMS.map((item) => {
                  const agg = dash.insights?.[item.key];
                  if (!agg) return null;
                  return (
                    <div key={item.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{item.label}{item.multi ? <span className="ml-1.5 font-mono text-[10px] text-muted">check all</span> : null}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">n {agg.n}</span>
                      </div>
                      {agg.options ? (
                        <div className="mt-1.5 space-y-1">
                          {item.options.map((o) => {
                            const count = agg.options?.[o.value] ?? 0;
                            const pct = agg.n > 0 ? Math.round((count / agg.n) * 100) : 0;
                            return (
                              <div key={o.value} className="flex items-center gap-2 text-xs">
                                <span className="w-44 shrink-0 truncate text-slate" title={o.label}>{o.label}</span>
                                <div className="h-2 flex-1 rounded bg-paper-deep">
                                  <div className="h-full rounded bg-bench" style={{ width: `${pct}%` }} />
                                </div>
                                <b className="w-9 shrink-0 text-right font-mono text-[10px]">{pct}%</b>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-1 font-mono text-[10px] text-muted">Not enough data yet.</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 font-mono text-[9px] uppercase tracking-wider text-muted">
                Check-all questions can have several answers, so their shares don&apos;t sum to 100%; one-answer questions do.
              </p>
            </div>
          )}

          {/* Insight modules (Belong–Trust) — unscored, beside the Index (CLAUDE.md #6, #9). */}
          <ModuleInsights insights={dash.insights} compact />

                </>
              )}

    </>
  );
}
