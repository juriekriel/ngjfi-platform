import { MODULES, MODULE_GROUP_LABEL } from "@/lib/modules";

type Agg = { n: number; options: Record<string, number> | null };

/**
 * Insight modules (e.g. Belong–Trust), reported beside the Index as aggregate
 * option shares only — never tied to a respondent, never folded into a score
 * (CLAUDE.md #6, #9). Each item's own n is shown; below the privacy floor the
 * database returns n and nothing else, and this says so.
 */
export default function ModuleInsights({
  insights,
  compact = false,
}: {
  insights: Record<string, Agg> | undefined;
  /** Org dashboard (compact) vs Collab Intelligence (roomier). */
  compact?: boolean;
}) {
  if (!insights) return null;
  return (
    <>
      {MODULES.map((m) => {
        const items = m.items.filter((i) => insights[i.key]);
        if (items.length === 0) return null;
        const groups = [...new Set(items.map((i) => i.group))];
        return (
          <section
            key={m.id}
            className={compact ? "mt-4 rounded-lg border border-rule bg-paper p-4" : "mt-6 rounded-xl border border-ink bg-card p-6"}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className={compact ? "font-mono text-[9px] uppercase tracking-wider text-muted" : "font-sans text-xl font-semibold"}>
                {m.label}
                {compact ? " — not part of the Index score" : ""}
              </h3>
              {m.draft && (
                <span className="rounded border border-rule-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted">
                  Draft items · in co-design
                </span>
              )}
            </div>
            {!compact && (
              <p className="mt-1 text-sm text-slate">
                Not part of the Index score — reported on its own, of those who completed the Index and chose the extra questions.
              </p>
            )}
            <div className={compact ? "mt-3 space-y-5" : "mt-4 space-y-6"}>
              {groups.map((g) => (
                <div key={g}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2">{MODULE_GROUP_LABEL[g] ?? g}</div>
                  <div className={compact ? "mt-2 space-y-4" : "mt-3 grid gap-6 md:grid-cols-2"}>
                    {items.filter((i) => i.group === g).map((item) => {
                      const agg = insights[item.key];
                      return (
                        <div key={item.key}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium">{item.label}</span>
                            <span className="shrink-0 font-mono text-[10px] text-muted">n {agg.n.toLocaleString()}</span>
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
                                      <div className="h-full rounded bg-violet" style={{ width: `${pct}%` }} />
                                    </div>
                                    <b className="w-9 shrink-0 text-right font-mono text-[10px]">{pct}%</b>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-1 font-mono text-[10px] text-muted">Not enough answers yet to show.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[9px] uppercase tracking-wider text-muted">
              One answer each — shares sum to 100% per question. Some questions only follow a monthly “yes” to a faith community, so n differs.
            </p>
          </section>
        );
      })}
    </>
  );
}
