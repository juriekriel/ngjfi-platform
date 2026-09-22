"use client";

/**
 * The Join page's coverage map — "add more visuals, especially maps" (initial
 * testing feedback, production-readiness round). Reuses the same real-world
 * geometry WorldHeatMap draws from (src/data/worldGeo.ts), but colours by
 * commitment count from coverage_counts() (migration 0008) rather than a
 * score: this is pre-launch waitlist signal, not a respondent result, so it
 * carries none of the critical-mass gating a score does — coverage_counts()
 * says so explicitly in its own comment ("commitments, never results").
 *
 * Deliberately a SEPARATE, simpler component rather than a mode on
 * WorldHeatMap: that component's whole contract is score + tier; folding a
 * count-based, ungated concept into it would blur what each one promises.
 */
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { COUNTRY_CODE_BY_NAME, WORLD_FEATURES, WORLD_VIEWBOX } from "@/data/worldGeo";

type Coverage = { country: string; orgs: number };

export default function CoverageMap() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [rows, setRows] = useState<Coverage[] | null>(null);

  useEffect(() => {
    if (!sb) return;
    sb.rpc("coverage_counts").then(({ data, error }) => {
      if (!error) setRows(data as Coverage[]);
    });
  }, [sb]);

  const byCode = new Map<string, number>();
  let max = 1;
  for (const r of rows ?? []) {
    const code = COUNTRY_CODE_BY_NAME[r.country];
    if (code) byCode.set(code, r.orgs);
    if (r.orgs > max) max = r.orgs;
  }

  const total = (rows ?? []).reduce((a, r) => a + r.orgs, 0);

  return (
    <div className="border-t-2 border-ink pt-4">
      <p className="figcap">Who&apos;s already on the list</p>
      <svg
        viewBox={`0 0 ${WORLD_VIEWBOX.w} ${WORLD_VIEWBOX.h}`}
        className="mt-3 w-full"
        role="img"
        aria-label="World map, countries shaded by how many organisations there have already joined the waitlist"
      >
        {WORLD_FEATURES.map((f, i) => {
          const n = f.c ? byCode.get(f.c) : undefined;
          const active = typeof n === "number";
          return (
            <path
              key={i}
              d={f.d}
              fill={active ? `rgb(var(--c-emerald) / ${Math.max(0.18, Math.min(0.9, n! / max))})` : "#e2e5ea"}
              stroke="#ffffff"
              strokeWidth={f.c ? 0.9 : 0.6}
            />
          );
        })}
      </svg>
      <p className="margin-note mt-3 leading-relaxed">
        {total > 0
          ? `${total.toLocaleString()} organisation${total === 1 ? "" : "s"} across ${(rows ?? []).length} countr${(rows ?? []).length === 1 ? "y" : "ies"} so far — darker means more have signed up from there. Commitments, not results: nothing here is a score.`
          : "Nobody yet — be the first to put your country on this map."}
      </p>
    </div>
  );
}
