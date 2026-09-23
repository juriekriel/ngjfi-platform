"use client";

/**
 * /intelligence — who sees what.
 *
 * Signed in as a member of an organisation → the second of the two signed-in
 * tabs: Collab Intelligence drawn through <SignedInFrame>, identical in shape
 * to the organisation's own dashboard, with "Overlay {their org}".
 *
 * Anyone else (signed out, or Collab/admin staff with no organisation) → the
 * existing public Collab Intelligence page, unchanged. The public page is
 * linked from the landing page and is a separate decision from the
 * signed-in view.
 */
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import IntelligenceView from "@/components/index/IntelligenceView";
import SignedInFrame from "@/components/index/SignedInFrame";
import type { MapCountry } from "@/components/index/WorldHeatMap";

type Matrix = Record<string, Record<string, number | null>>;
type Ctx = { signed_in: boolean; email?: string; orgs?: { slug: string; name: string; is_demo: boolean }[] };
type Collab = {
  published: boolean;
  reason?: "awaiting_release" | "below_critical_mass";
  gate?: number;
  country_gate?: number;
  completions?: number;
  totals?: { responses: number; orgs: number; countries: number };
  funnel?: Record<string, number | null>;
  matrix?: Matrix;
  countries?: MapCountry[];
};
type OrgDash = { n: number; suppressed?: boolean; matrix: Matrix };

const TIER_KEYS = ["exposure", "response", "formation", "multiplication"];

export default function IntelligenceEntry() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [ctx, setCtx] = useState<Ctx | null>(null);

  useEffect(() => {
    if (!sb) { setCtx({ signed_in: false }); return; }
    sb.rpc("my_context").then(({ data }) => setCtx((data as Ctx) ?? { signed_in: false }));
  }, [sb]);

  if (!ctx) return <div className="min-h-screen bg-paper" aria-busy="true" />;
  const org = ctx.orgs?.find((o) => !o.is_demo) ?? null;
  if (!sb || !ctx.signed_in || !org) return <IntelligenceView space="live" />;
  return <CollabTab sb={sb} org={org} email={ctx.email ?? null} />;
}

function CollabTab({
  sb,
  org,
  email,
}: {
  sb: NonNullable<ReturnType<typeof getSupabaseBrowser>>;
  org: { slug: string; name: string };
  email: string | null;
}) {
  const [collab, setCollab] = useState<Collab | null>(null);
  const [mine, setMine] = useState<OrgDash | null>(null);

  useEffect(() => {
    sb.rpc("collab_intelligence").then(({ data }) => setCollab((data as Collab) ?? { published: false }));
    sb.rpc("org_dashboard_season", { p_org_slug: org.slug, p_season_start: null, p_season_end: null })
      .then(({ data }) => data && setMine(data as OrgDash));
  }, [sb, org.slug]);

  const published = Boolean(collab?.published);
  const gate = collab?.country_gate ?? 2000;
  const tiers = collab?.funnel ?? {};
  const tierVals = TIER_KEYS.map((k) => tiers[k]).filter((v): v is number => typeof v === "number");
  const index = published && tierVals.length ? Math.round((tierVals.reduce((a, b) => a + b, 0) / tierVals.length) * 10) / 10 : null;
  const n = published ? collab?.totals?.responses ?? null : collab?.completions ?? null;
  const orgs = collab?.totals?.orgs ?? null;

  const empty = !collab
    ? { title: "Loading the Collab…", body: "" }
    : published
      ? null
      : {
          title: "The Collab's pooled view isn't published yet",
          body:
            collab.reason === "below_critical_mass"
              ? `It opens once ${(collab.gate ?? 400).toLocaleString()} people across the Collab have completed the Index — ${(collab.completions ?? 0).toLocaleString()} so far. Until then there is nothing honest to show.`
              : "The numbers exist, but the Collab publishes the pooled picture deliberately, once it has been checked. Until then this stays empty rather than showing an early, unreviewed figure.",
        };

  return (
    <SignedInFrame
      sb={sb}
      org={org}
      active="collab"
      email={email}
      title="Collab Intelligence"
      titleRight={<span className="font-mono text-[12px] text-ink-2">pooled from every organisation · no organisation named</span>}
      scope={
        <div className="grid gap-2.5 lg:grid-cols-5">
          <div className="flex min-h-[150px] flex-col gap-1.5 rounded-2xl border border-ink bg-ink px-3.5 pb-3.5 pt-3 text-paper">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-paper/75">The whole Collab</span>
            <span className="pt-1.5 text-[16px] font-bold">Every organisation</span>
            <span className="text-[12.5px] leading-snug text-paper/75">
              {published && orgs != null ? `${orgs.toLocaleString()} organisations · ${(collab?.totals?.countries ?? 0).toLocaleString()} countries reached` : "Pooled once published"}
            </span>
            <span className="mt-auto text-[13px] font-semibold">n {n == null ? "—" : n.toLocaleString()}</span>
          </div>
          <div className="flex flex-col justify-center gap-1.5 rounded-2xl border border-dashed border-rule-2 bg-plate px-4 py-4 lg:col-span-4">
            <span className="text-[15px] font-semibold">The same screen as your dashboard, read across everyone.</span>
            <span className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
              No organisation is named or broken out here. Overlay puts {org.name}&apos;s whole-house result on top of
              the pool, so you can see where you sit.
            </span>
          </div>
        </div>
      }
      figures={{
        index,
        indexNote: published ? `n ${(n ?? 0).toLocaleString()} · every organisation` : "not published yet",
        n,
        nNote: published ? `across ${(orgs ?? 0).toLocaleString()} organisations` : "completions so far",
        activeCountries: collab ? (published ? collab.countries?.length ?? 0 : 0) : null,
        countryGate: gate,
      }}
      matrix={published ? collab?.matrix ?? null : null}
      empty={empty}
      overlay={{
        label: org.name,
        button: `Overlay ${org.name}`,
        matrix: mine && !mine.suppressed ? mine.matrix : null,
        allowed: true,
        reason: `${org.name} doesn't have enough responses to overlay yet`,
      }}
      countries={published ? collab?.countries ?? [] : []}
      scopeLine={`Of those who completed the Index through any Collab organisation · n ${(n ?? 0).toLocaleString()}`}
    />
  );
}
