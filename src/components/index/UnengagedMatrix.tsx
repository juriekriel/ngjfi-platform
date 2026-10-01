/**
 * The Unengaged matrix — the Exploration Index (migration 0026), for those
 * who completed the Index but don't yet identify as following Jesus.
 *
 * Same 3 × 4 model and the same maths as the J12, on its own n, and NEVER
 * summed, averaged or otherwise blended with it (CLAUDE.md #9). Their
 * completions count in the organisation's total; their answers are scored
 * only here (migration 0047).
 *
 * Unlocks in any space — the whole house, a season, one room — once that
 * space has the same minimum of people not yet following that its J12 needs
 * of followers. The floor is enforced in the database; below it the server
 * returns the count and nothing else, and this says so.
 *
 * One component for the signed-in dashboard and the view-only share page.
 * Drawn in violet on purpose, so it can never be mistaken for the J12.
 */
import { DOMAINS, DOMAIN_LABEL, TIERS, TIER_LABEL, fig } from "@/lib/model";

type Matrix = Record<string, Record<string, number | null>>;

export type UnengagedData = {
  n: number;
  floor: number;
  suppressed: boolean;
  index: number | null;
  tiers?: Record<string, number | null>;
  domains?: Record<string, number | null>;
  matrix?: Matrix;
};

/** Reads the exploration_* fields any dashboard core returns (house, season or room). */
export function unengagedFrom(d: {
  exploration_n?: number;
  exploration_min_n?: number;
  min_n?: number;
  min_group_n?: number;
  exploration_suppressed?: boolean;
  exploration_index?: number | null;
  exploration_tiers?: Record<string, number | null>;
  exploration_domains?: Record<string, number | null>;
  exploration_matrix?: Matrix;
} | null | undefined): UnengagedData | null {
  if (!d || typeof d.exploration_n !== "number") return null;
  return {
    n: d.exploration_n,
    floor: d.exploration_min_n ?? d.min_n ?? d.min_group_n ?? 10,
    suppressed: d.exploration_suppressed !== false,
    index: d.exploration_index ?? null,
    tiers: d.exploration_tiers,
    domains: d.exploration_domains,
    matrix: d.exploration_matrix,
  };
}

const violet = (v: number | null | undefined) =>
  v == null ? "transparent" : `rgba(139,92,246,${Math.max(0.08, v / 5.5)})`;
const one = (v: number | null | undefined) => (v == null ? fig(v) : v.toFixed(1));

export default function UnengagedMatrix({ data, scopeLine }: { data: UnengagedData; scopeLine: string }) {
  if (data.suppressed)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-violet">Unengaged matrix · locked</p>
        <p className="text-[20px] font-semibold">
          {data.n.toLocaleString()} of {data.floor.toLocaleString()} people not yet following needed to unlock
        </p>
        <p className="max-w-lg text-[14.5px] leading-relaxed text-ink-2">
          The same floor the J12 holds. Below it an average risks pointing back to one or two real young people,
          so only the count is shown. They already count in your completions.
        </p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-2">
          For those who completed the Index but don&apos;t yet identify as following Jesus. Same 3 × 4 model and the
          same maths as the J12 — never added to it, averaged with it or compared cell for cell as one score.
        </p>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-violet">n {data.n.toLocaleString()}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
        <div className="rounded-xl border border-rule bg-paper-deep p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Exploration score</p>
          <p className="mt-2 text-[36px] font-bold tracking-tight text-violet">{one(data.index)}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-rule bg-paper-deep p-4">
          <table className="w-full min-w-[420px] border-separate border-spacing-1 text-center text-[13px]">
            <thead>
              <tr>
                <th />
                {TIERS.map((tk) => (
                  <th key={tk} scope="col" className="pb-1 font-mono text-[10.5px] font-normal uppercase tracking-[0.06em] text-ink-2">
                    {TIER_LABEL[tk]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOMAINS.map((dk) => (
                <tr key={dk}>
                  <th scope="row" className="pr-2 text-left text-[12.5px] font-semibold">{DOMAIN_LABEL[dk]}</th>
                  {TIERS.map((tk) => {
                    const v = data.matrix?.[dk]?.[tk] ?? null;
                    return (
                      <td key={tk} className="rounded-md py-2.5 font-semibold tabular-nums"
                        style={{ background: violet(v), color: v != null && v >= 3.2 ? "#fff" : "rgb(var(--c-ink))" }}>
                        {one(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[13px] text-ink-2">{scopeLine}</p>
    </div>
  );
}
