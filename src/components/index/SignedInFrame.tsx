"use client";

/**
 * The signed-in view — one frame, two tabs (locked design, Sept 2026).
 *
 * After sign-in an organisation sees exactly two tabs: its own dashboard and
 * Collab Intelligence. Both render through THIS component, so they cannot
 * drift apart: the same three figures, the same J12 matrix / Heat map
 * switch, the same overlay button and the same "What does this mean?" in the
 * same places. What differs between them is only the data passed in and the
 * scope row (rooms on the org tab; the whole Collab on the other).
 *
 * Rules this component holds, whatever it is given:
 *   - every score shows its n; "of those who have completed the Index";
 *   - the overlay is house-level only — callers pass allowed=false for a room;
 *   - the map colours a country only if the server returned it (the country
 *     gate, 2,000 by config, is enforced in collab_intelligence()).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import ScoreMatrix, { MatrixLegend } from "@/components/index/ScoreMatrix";
import WorldHeatMap, { type MapCountry } from "@/components/index/WorldHeatMap";
import MapTierToggle from "@/components/index/MapTierToggle";
import ConsultDrawer, { ConsultButton } from "@/components/index/ConsultDrawer";
import { TIER_LABEL, fig } from "@/lib/model";

type Matrix = Record<string, Record<string, number | null>>;

export type FrameFigures = {
  index: number | null;
  indexNote: string;
  n: number | null;
  nNote: string;
  activeCountries: number | null;
  countryGate: number;
};

export type FrameProps = {
  sb: SupabaseClient;
  org: { slug: string; name: string };
  active: "org" | "collab";
  email: string | null;
  title: string;
  titleRight?: React.ReactNode;
  scope: React.ReactNode;
  figures: FrameFigures;
  matrix: Matrix | null;
  /** Shown in place of the matrix when there is nothing honest to draw. */
  empty?: { title: string; body: string } | null;
  overlay: {
    /** Short name in each cell's chip, e.g. "Collab" or the org's name. */
    label: string;
    /** Button text, e.g. "Overlay the Collab". */
    button: string;
    matrix: Matrix | null;
    allowed: boolean;
    /** Why the overlay is unavailable (shown when allowed is false or matrix is null). */
    reason: string;
  };
  /** False for demo previews, where there is no signed-in member to ask. */
  consultEnabled?: boolean;
  countries: MapCountry[];
  reached?: string[];
  scopeLine: string;
  /** Room name when a room is selected (org tab), for the consult snapshot. */
  roomName?: string | null;
  children?: React.ReactNode;
};

export default function SignedInFrame(p: FrameProps) {
  const [view, setView] = useState<"matrix" | "heatmap">("matrix");
  const [tier, setTier] = useState("formation");
  const [overlayWanted, setOverlayWanted] = useState(true);
  const [consult, setConsult] = useState(false);

  const overlayUsable = p.overlay.allowed && p.overlay.matrix != null;
  const overlayOn = overlayUsable && overlayWanted && view === "matrix";
  const overlayHint = !p.overlay.allowed
    ? p.overlay.reason
    : p.overlay.matrix == null
      ? p.overlay.reason
      : view === "heatmap"
        ? "Overlay works on the matrix"
        : overlayOn
          ? "Showing both, cell by cell"
          : "";

  return (
    <div className="flex min-h-screen flex-col bg-paper-deep">
      <SignedInHeader sb={p.sb} org={p.org} active={p.active} email={p.email} />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-7 sm:px-8">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">{p.title}</h1>
            {p.titleRight}
          </div>
          {p.scope}
        </section>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <Figure label="J12 index" note={p.figures.indexNote} value={fig(p.figures.index)} accent={p.active === "org"} />
          <Figure label="Completed the Index" note={p.figures.nNote} value={p.figures.n == null ? "—" : p.figures.n.toLocaleString()} />
          <Figure
            label="Countries active on the map"
            note={`a country lights up at ${p.figures.countryGate.toLocaleString()} completions`}
            value={p.figures.activeCountries == null ? "—" : String(p.figures.activeCountries)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="View" className="inline-flex gap-1 rounded-xl bg-rule/70 p-1">
            <Seg on={view === "matrix"} onClick={() => setView("matrix")}>J12 matrix</Seg>
            <Seg on={view === "heatmap"} onClick={() => setView("heatmap")}>Heat map</Seg>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {overlayHint && <span className="text-[13px] text-ink-2">{overlayHint}</span>}
            {p.consultEnabled !== false && <ConsultButton onClick={() => setConsult(true)} />}
            <button
              type="button"
              aria-pressed={overlayOn}
              disabled={!overlayUsable || view === "heatmap"}
              onClick={() => setOverlayWanted((v) => !v)}
              className={`rounded-lg px-4 py-2.5 text-[14px] font-semibold ${
                !overlayUsable || view === "heatmap"
                  ? "cursor-not-allowed border border-dashed border-rule-2 bg-paper-deep text-muted"
                  : overlayOn
                    ? "border border-ink bg-ink text-paper"
                    : "border border-rule-2 bg-plate text-ink hover:border-ink"
              }`}
            >
              {p.overlay.button}
            </button>
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col rounded-2xl border border-rule bg-plate px-4 py-5 shadow-sm sm:px-7 sm:py-6">
          {p.empty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <p className="text-[20px] font-semibold">{p.empty.title}</p>
              <p className="max-w-lg text-[14.5px] leading-relaxed text-ink-2">{p.empty.body}</p>
            </div>
          ) : view === "matrix" ? (
            <div className="flex flex-col gap-3">
              {p.matrix ? (
                <ScoreMatrix
                  matrix={p.matrix}
                  compare={overlayOn ? p.overlay.matrix : null}
                  compareLabel={overlayOn ? p.overlay.label : undefined}
                  showDelta={p.active === "org"}
                />
              ) : (
                <p className="py-16 text-center text-[14.5px] text-ink-2">Nothing to show yet.</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[13px] text-ink-2">{p.scopeLine}</span>
                <MatrixLegend />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <MapTierToggle tier={tier} onChange={setTier} className="rounded-full px-3.5 py-1.5 text-[13px]" />
              <WorldHeatMap countries={p.countries} tier={tier} reached={p.reached} gate={p.figures.countryGate} />
              <p className="text-[13px] leading-relaxed text-ink-2">
                {p.active === "org" && p.reached && p.reached.length > 0
                  ? `Outlined countries are where your links reached. They light up once ${p.figures.countryGate.toLocaleString()} people there — from any organisation — have completed the Index; your responses count toward that.`
                  : `A country stays grey until ${p.figures.countryGate.toLocaleString()} people there have completed the Index. Each country is checked on its own.`}
              </p>
            </div>
          )}
        </div>

        {p.children}
      </main>

      <footer className="border-t border-rule bg-plate">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-8">
          <span className="text-[13px] text-ink-2">Of those who have completed the Index · aggregates only, never an individual answer</span>
          <span className="font-mono text-[11.5px] text-ink-2">powered by The Index · jfindx.org</span>
        </div>
      </footer>

      {consult && (
        <ConsultDrawer
          sb={p.sb}
          orgSlug={p.org.slug}
          email={p.email}
          onClose={() => setConsult(false)}
          view={{
            tab: p.active,
            orgName: p.org.name,
            roomName: p.roomName ?? null,
            view,
            tier,
            tierLabel: TIER_LABEL[tier] ?? tier,
            overlay: overlayOn,
            n: p.figures.n,
          }}
        />
      )}
    </div>
  );
}

function Figure({ label, note, value, accent = false }: { label: string; note: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-rule bg-plate px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{label}</p>
        <p className="mt-1 text-[13px] text-ink-2">{note}</p>
      </div>
      <span className={`shrink-0 text-[32px] font-bold tracking-tight ${accent ? "text-emerald-deep" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-[14px] font-semibold ${on ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/**
 * The organisation's brand at the top — white-label means theirs — and the
 * only two tabs. Branding is read from the organisation's public row (the
 * same columns the respondent survey already reads).
 */
export function SignedInHeader({
  sb,
  org,
  active,
  email,
}: {
  sb: SupabaseClient;
  org: { slug: string; name: string };
  active: "org" | "collab";
  email: string | null;
}) {
  const [brand, setBrand] = useState<{ logo_url: string | null; brand_color: string | null } | null>(null);

  useEffect(() => {
    sb.from("organisations")
      .select("logo_url,brand_color")
      .eq("slug", org.slug)
      .maybeSingle()
      .then(({ data }) => data && setBrand(data as { logo_url: string | null; brand_color: string | null }));
  }, [sb, org.slug]);

  return (
    <header className="border-b border-rule bg-plate" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-stretch justify-between gap-x-6 px-5 sm:px-8">
        <div className="flex flex-wrap items-stretch gap-x-8">
          <div className="flex items-center gap-3 py-3">
            {brand?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[16px] font-bold text-plate"
                style={{ background: brand?.brand_color || "rgb(var(--c-ink))" }}
              >
                {org.name.slice(0, 1)}
              </span>
            )}
            <span className="text-[17px] font-bold tracking-tight">{org.name}</span>
          </div>
          <nav aria-label="Dashboards" className="flex items-stretch gap-1">
            <Tab href={`/${org.slug}/dashboard`} on={active === "org"}><span className="sm:hidden">Dashboard</span><span className="hidden sm:inline">{org.name} dashboard</span></Tab>
            <Tab href="/intelligence" on={active === "collab"}><span className="sm:hidden">Collab</span><span className="hidden sm:inline">Collab Intelligence</span></Tab>
          </nav>
        </div>
        <div className="flex items-center gap-2 py-3">
          <Link href="/build?settings=1" className="px-3 py-2.5 text-[14px] font-semibold text-ink-2 no-underline hover:text-ink">
            Survey settings
          </Link>
          {email && <span className="hidden rounded-lg border border-rule-2 px-3 py-2 text-[13px] text-ink-2 sm:inline">{email}</span>}
        </div>
      </div>
    </header>
  );
}

function Tab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-[48px] items-center whitespace-nowrap border-b-[3px] px-3.5 text-[15px] no-underline ${
        on ? "border-emerald font-bold text-ink" : "border-transparent font-semibold text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
