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
import MapTierToggle from "@/components/index/MapTierToggle";

type Totals = { orgs: number; responses: number };
type Intel = {
  published?: boolean;
  country_gate?: number;
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
    <section id="global" className="scroll-mt-6 border-t border-ink py-12">
      <div>
        <p className="figcap">The global view · live on the platform</p>
        <h2 className="mt-2 text-[28px] leading-tight">See a global picture of Jesus-Following.</h2>
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
          <MapTierToggle tier={tier} onChange={setTier} className="rounded-md px-2.5 py-1 text-[12.5px]" />
        </div>
        <div className="mt-5">
          <WorldHeatMap countries={intel?.countries ?? []} tier={tier} />
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          {intel && intel.published === false
            ? `No country has passed the critical-mass gate yet — a country stays grey until ${(intel.country_gate ?? 2000).toLocaleString("en")} people there have completed the Index.`
            : `A country appears in colour once ${(intel?.country_gate ?? 2000).toLocaleString("en")} people there have completed the Index. Of those who have completed it — never a whole population.`}
        </p>
      </div>

      <div className="mt-10 grid items-end gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h3 className="text-[22px] leading-tight">Comparisons appear as your area grows.</h3>
          <p className="mt-2 max-w-measure text-[16px] leading-relaxed text-ink-2">
            Your own results come in live. City and country comparisons open once enough ministries near you have
            taken part — so who should join you?
          </p>
        </div>
        <Link
          href="/join"
          className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-center text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
        >
          Join the JFINDX — free →
        </Link>
      </div>
    </section>
  );
}
