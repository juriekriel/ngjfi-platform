"use client";

/**
 * The homepage's live snapshot — a real counter, and the real global heat map,
 * both fed by the actual platform rather than sample data.
 *
 * Two different data sources on purpose:
 *  - platform_totals() (migration 0030) is a bare headcount — live orgs and
 *    live responses, nothing else — and is deliberately NOT gated behind
 *    critical mass, because a headcount carries no score and is not a
 *    benchmark (CLAUDE.md non-negotiable #1 only protects benchmarks).
 *  - collab_intelligence() is the same enforced, gated aggregate the Collab
 *    Intelligence page itself reads. Its map stays honestly grey wherever a
 *    country hasn't passed the critical-mass gate yet — this component adds
 *    no gating logic of its own, same as WorldHeatMap and IntelligenceView.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import WorldHeatMap from "@/components/index/WorldHeatMap";
import { TIERS, TIER_LABEL } from "@/lib/model";

type Totals = { orgs: number; responses: number };
type Intel = {
  published?: boolean;
  countries: { country: string; n: number; tiers: Record<string, number | null> }[] | null;
};

export default function LiveSnapshot() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [intel, setIntel] = useState<Intel | null>(null);
  const [tier, setTier] = useState<string>("formation");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const [t, i] = await Promise.all([
        sb.rpc("platform_totals"),
        sb.rpc("collab_intelligence"),
      ]);
      if (!t.error) setTotals(t.data as Totals);
      if (!i.error) setIntel(i.data as Intel);
    })();
  }, [sb]);

  return (
    <section className="border-t-2 border-ink py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="figcap">Live on the platform</p>
          <h2 className="mt-2 text-[28px] leading-tight">See who&apos;s part of it.</h2>
        </div>
        <Link href="/intelligence" className="text-[14px] font-semibold text-emerald no-underline hover:underline">
          See the full global picture →
        </Link>
      </div>

      <div className="mt-7 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        <div className="border-t-2 border-emerald pt-3">
          <p className="tabular text-[40px] leading-none">
            {totals ? totals.orgs.toLocaleString() : "—"}
          </p>
          <p className="mt-2 text-[14.5px] leading-snug text-ink-2">organisations have run the Index</p>
        </div>
        <div className="border-t-2 border-emerald pt-3">
          <p className="tabular text-[40px] leading-none">
            {totals ? totals.responses.toLocaleString() : "—"}
          </p>
          <p className="mt-2 text-[14.5px] leading-snug text-ink-2">responses completed, and counting</p>
        </div>
      </div>

      <div className="mt-9">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2">
          <p className="figcap">A global view of Jesus-Following</p>
          <div className="flex flex-wrap gap-1">
            {TIERS.map((tk) => (
              <button
                key={tk}
                type="button"
                onClick={() => setTier(tk)}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${
                  tier === tk ? "border-ink bg-ink text-paper" : "border-rule text-ink-2 hover:border-ink"
                }`}
              >
                {TIER_LABEL[tk]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <WorldHeatMap countries={intel?.countries ?? []} tier={tier} />
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          {intel && intel.published === false
            ? "No country has passed the critical-mass gate yet — every country reads grey until enough people there have completed the Index."
            : "A country only appears in colour once enough people there have completed the Index. Of those who have completed it — never a whole population."}
        </p>
      </div>
    </section>
  );
}
