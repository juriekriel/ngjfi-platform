"use client";

/**
 * Org dashboard PDF export — "PDF views of Global Heat map + Matrix; PDF
 * views of same with Collab overlay added" (CLAUDE.md build brief,
 * production-readiness round).
 *
 * Built as a print-optimised page rather than a PDF-generation dependency:
 * the browser's own "Print → Save as PDF" already produces a real PDF, needs
 * no new library, and matches the "no heavy chart libraries" instinct this
 * codebase applies to the respondent path. The overlay toggle reuses
 * ScoreMatrix's existing `compare` prop (already built for "compare to
 * Collab" on the main dashboard) rather than a second bespoke table.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import ScoreMatrix from "@/components/index/ScoreMatrix";
import WorldHeatMap, { type MapCountry } from "@/components/index/WorldHeatMap";
import { TIERS, TIER_LABEL } from "@/lib/model";

type Dash = {
  org: { slug: string; name: string };
  n: number;
  matrix: Record<string, Record<string, number | null>>;
  season?: { start: string | null; end: string | null };
};
type Intel = {
  matrix: Record<string, Record<string, number | null>>;
  countries: MapCountry[] | null;
};

export default function ExportPage() {
  const params = useParams<{ org: string }>();
  const search = useSearchParams();
  const slug = params.org;
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [dash, setDash] = useState<Dash | null>(null);
  const [intel, setIntel] = useState<Intel | null>(null);
  const [tier, setTier] = useState(search.get("tier") || "formation");
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const [d, i] = await Promise.all([
        sb.rpc("org_dashboard_season", { p_org_slug: slug, p_season_start: null, p_season_end: null }),
        sb.rpc("collab_intelligence"),
      ]);
      if (!d.error) setDash(d.data as Dash);
      if (!i.error) setIntel(i.data as Intel);
    })();
  }, [sb, slug]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 print:px-0 print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-lg font-bold">Export · {dash?.org.name ?? slug}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
            With Collab overlay
          </label>
          <div className="flex gap-1">
            {TIERS.map((tk) => (
              <button
                key={tk}
                onClick={() => setTier(tk)}
                className={`rounded-md border px-2.5 py-1 text-[13px] font-semibold ${
                  tier === tk ? "border-ink bg-ink text-paper" : "border-rule text-slate"
                }`}
              >
                {TIER_LABEL[tk]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {!dash && <p className="text-sm text-slate print:hidden">Loading…</p>}

      {dash && (
        <div className="space-y-10">
          <header className="border-b-2 border-ink pb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">The Jesus Index</p>
            <h2 className="mt-1 text-2xl font-bold">{dash.org.name}</h2>
            <p className="mt-1 text-sm text-slate">
              n = {dash.n.toLocaleString()} · among those who completed the Index
              {overlay && " · small figure in each cell is the Collab-wide average"}
            </p>
          </header>

          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted">Questions × tiers</h3>
            <div className="mt-3">
              <ScoreMatrix
                matrix={dash.matrix}
                compare={overlay ? intel?.matrix : null}
                compareLabel={overlay ? "Collab" : undefined}
              />
            </div>
          </section>

          <section className="break-inside-avoid">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Global heat map · {TIER_LABEL[tier]}
            </h3>
            <p className="mt-1 text-xs text-slate">
              A country only appears in colour once enough people there have completed the Index.
            </p>
            <div className="mt-3">
              <WorldHeatMap countries={intel?.countries ?? []} tier={tier} />
            </div>
          </section>

          <p className="border-t border-rule pt-3 font-mono text-[9px] uppercase tracking-wider text-muted">
            Aggregates only — never individual responses. Of those who completed the Index.
          </p>
        </div>
      )}

      <style jsx global>{`
        @media print {
          nav, header.border-b { break-after: avoid; }
          @page { margin: 16mm; }
        }
      `}</style>
    </main>
  );
}
