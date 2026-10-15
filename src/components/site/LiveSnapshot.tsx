"use client";

/**
 * The global view — a counter and the world heat map. Lives on /see-a-demo
 * (moved off the home page, Oct 2026 round 4b); the page's own call to action
 * follows it, so it carries none of its own.
 *
 * Oct 2026 round: "it looks empty before data — activate the map with demo
 * data, with a disclaimer." So there are now two views, and the page always
 * says which one you are looking at:
 *
 *  - LIVE (is_demo = false). platform_totals() (0030) is a bare, ungated
 *    headcount — no score, so not a benchmark (non-negotiable #1 protects
 *    benchmarks). collab_intelligence() is the same enforced, gated
 *    aggregate the Collab console reads; a country stays grey until it
 *    passes the country gate. This component adds no gating of its own.
 *  - DEMO (is_demo = true). collab_intelligence_demo() — the sandbox's 26
 *    invented organisations, the same RPC the signed-in demo space reads.
 *    It is never blended with live figures: one view or the other, never
 *    both on one map, and the demo view is always inside a <DemoFrame> with
 *    the <DataLabel kind="demo"> wording.
 *
 * Until a live country clears its gate the page opens on the demo view, so
 * the map isn't empty; the moment one does, it opens on live data. The
 * visitor can switch either way.
 *
 * Demo figures come from the sandbox in the database first, exactly as a
 * signed-in visitor sees them. Once the sandbox is deleted before launch the
 * demo map falls back to sampleWorld() (lib/sample), derived from the
 * instrument — so the demo never goes empty. Live figures never touch either.
 */
import { GradientRule } from "@/components/site/Chrome";
import { DataLabel, DemoFrame } from "@/components/site/DataLabel";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import WorldHeatMap from "@/components/index/WorldHeatMap";
import MapTierToggle from "@/components/index/MapTierToggle";
// Only the world-map fallback — never a figure outside the demo view's DemoFrame.
import { sampleWorld } from "@/lib/sample";

type Totals = { orgs: number; responses: number };
type Country = { country: string; n: number; tiers: Record<string, number | null> };
type Intel = {
  published?: boolean;
  country_gate?: number;
  totals?: { responses: number; orgs: number; countries: number };
  countries: Country[] | null;
};
type View = "live" | "demo";

const hasMap = (i: Intel | null) =>
  !!i && i.published !== false && (i.countries ?? []).some((c) => Object.values(c.tiers ?? {}).some((v) => v !== null));

export default function LiveSnapshot() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [live, setLive] = useState<Intel | null>(null);
  const [demo, setDemo] = useState<Intel | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [tier, setTier] = useState<string>("formation");

  useEffect(() => {
    // The demo preview never waits on the network: it starts from the derived
    // world map and is replaced by the sandbox's figures if they arrive.
    setDemo(sampleWorld() as Intel);
    if (!sb) { setView("demo"); return; }
    (async () => {
      try {
        const [t, i, d] = await Promise.all([
          sb.rpc("platform_totals"),
          sb.rpc("collab_intelligence"),
          sb.rpc("collab_intelligence_demo"),
        ]);
        if (!t.error) setTotals(t.data as Totals);
        const li = i.error ? null : (i.data as Intel);
        setLive(li);
        const di = d.error ? null : (d.data as Intel);
        if (hasMap(di)) setDemo(di);
        setView((v) => v ?? (hasMap(li) ? "live" : "demo"));
      } catch {
        setView((v) => v ?? "demo");
      }
    })();
  }, [sb]);

  const gate = (live?.country_gate ?? 2000).toLocaleString("en");
  // Until the network answers, show the demo (framed as such) rather than nothing.
  const shown: View = view ?? "demo";
  const isDemo = shown === "demo";
  const orgs = isDemo ? demo?.totals?.orgs : totals?.orgs;
  const responses = isDemo ? demo?.totals?.responses : totals?.responses;

  const counters = (
    <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
      <div className="border-t-2 border-emerald pt-3">
        <p className="tabular text-[40px] leading-none">{typeof orgs === "number" ? orgs.toLocaleString("en") : "—"}</p>
        <p className="mt-2 text-[14.5px] leading-snug text-ink-2">
          {isDemo ? "invented organisations in the demo" : "ministries have run the Index"}
        </p>
      </div>
      <div className="border-t-2 border-emerald pt-3">
        <p className="tabular text-[40px] leading-none">{typeof responses === "number" ? responses.toLocaleString("en") : "—"}</p>
        <p className="mt-2 text-[14.5px] leading-snug text-ink-2">
          {isDemo ? "invented responses in the demo" : "surveys completed so far"}
        </p>
      </div>
    </div>
  );

  const map = (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2">
        <p className="figcap">{isDemo ? "What the global view will look like" : "By country, of those who completed the Index"}</p>
        <MapTierToggle tier={tier} onChange={setTier} className="rounded-md px-2.5 py-1 text-[12.5px]" />
      </div>
      <div className="mt-5">
        <WorldHeatMap countries={(isDemo ? demo?.countries : live?.countries) ?? []} tier={tier} />
      </div>
      <p className="margin-note mt-3 border-l-2 border-rule pl-3">
        {isDemo
          ? `Every figure here is invented. It shows how the view works and says nothing about any real country. With live data, a country appears only once ${gate} people there have completed the Index.`
          : live && live.published === false
            ? `No country is shown yet. A country lights up once ${gate} people there have completed the Index, so no result can point to a small group. Switch to the demo preview to see how the map fills.`
            : `A country is coloured once ${gate} people there have completed the Index. Colours describe those who took part, not the whole country.`}
      </p>
    </div>
  );

  return (
    <section id="global" className="scroll-mt-6 py-12">
      <GradientRule className="mb-10" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="figcap">The global view</p>
          <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-tight">See a global picture of Jesus-following.</h2>
        </div>
        <div role="group" aria-label="Which data to show" className="inline-flex rounded-lg border border-rule bg-paper-deep p-1">
          {(["live", "demo"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={shown === v}
              onClick={() => setView(v)}
              className={`rounded-md px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
                shown === v ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"
              }`}
            >
              {v === "live" ? "Live data" : "Demo preview"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <DataLabel kind={shown} n={shown === "live" ? totals?.responses ?? null : undefined} />
      </div>

      {isDemo ? (
        <DemoFrame className="mt-7">
          {counters}
          <div className="mt-9">{map}</div>
        </DemoFrame>
      ) : (
        <div className="mt-7">
          {counters}
          <div className="mt-9">{map}</div>
        </div>
      )}

      <div className="mt-10">
        <h3 className="text-[22px] font-bold leading-tight">Want to see how your city compares?</h3>
        <p className="mt-2 max-w-measure text-[16px] leading-relaxed text-ink-2">
          Your own results arrive as soon as your young people answer. Country comparisons open once enough ministries take part nationally. Invite the ones you already work with.
        </p>
      </div>
    </section>
  );
}
