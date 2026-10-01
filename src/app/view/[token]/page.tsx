"use client";

/**
 * A view-only share link — /view/<token> (migration 0046).
 *
 * What a field leader sees when an organisation shares its results: the
 * organisation's brand, its J12 index, n, the 3 × 4 matrix and, where the
 * organisation chose, its own heat map and the detail panels. Nothing can be
 * changed here and there is nothing to sign in to.
 *
 * Rules this page holds, whatever the server returns:
 *   - it renders only what shared_dashboard() returned — every minimum is
 *     enforced in the database, the same floors as the signed-in dashboard;
 *   - the organisation's matrices carry no Collab overlay or benchmark; the
 *     one shared picture is the heat map, linked (as on the dashboard) to all
 *     data gathered for each country;
 *   - the Unengaged matrix is its own view, unlocked at the same floor as the
 *     J12 (migration 0047), never blended with it;
 *   - every score shows its n and is scoped to "of those who have completed
 *     the Index";
 *   - the token never leaves this page except to the database: no analytics,
 *     no outbound links that would carry it (Referer is off).
 *
 * The figures, matrix, map and detail are the dashboard's own components, so
 * a shared view cannot drift from what the organisation sees.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { isToken, type SharedStatus } from "@/lib/shareLinks";
import { Figure, Seg } from "@/components/index/SignedInFrame";
import ScoreMatrix, { MatrixLegend } from "@/components/index/ScoreMatrix";
import WorldHeatMap, { type MapCountry } from "@/components/index/WorldHeatMap";
import MapTierToggle from "@/components/index/MapTierToggle";
import ResultsDetail, { type DetailDash } from "@/components/index/ResultsDetail";
import UnengagedMatrix, { unengagedFrom } from "@/components/index/UnengagedMatrix";
import { completionsNote, type Completions } from "@/lib/completions";
import { fig } from "@/lib/model";

type Matrix = Record<string, Record<string, number | null>>;
type Brand = { name: string; logo_url: string | null; brand_color: string | null };
type Shared = {
  status: SharedStatus;
  org?: Brand;
  until?: string;
  min_group_n?: number;
  label?: string;
  scope?: { kind: "house" | "room"; room_name: string | null };
  expires_at?: string;
  show_map?: boolean;
  show_detail?: boolean;
  dashboard?: DetailDash & {
    index: number | null; matrix: Matrix; min_n?: number;
    completions?: Completions; exploration_min_n?: number;
  };
  /** The dashboard's own map: every country's full data, plus where this scope reached (0046). */
  map?: { published: boolean; country_gate: number; floor: number; countries: MapCountry[]; reached: string[] } | null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export default function SharedViewPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [data, setData] = useState<Shared | null>(null);
  const [failed, setFailed] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [checking, setChecking] = useState(false);
  const [view, setView] = useState<"matrix" | "unengaged" | "heatmap">("matrix");
  const [tier, setTier] = useState("formation");
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async (pass: string | null) => {
    if (!sb) return;
    if (!isToken(token)) { setData({ status: "unavailable" }); return; }
    setChecking(true);
    const { data: d, error } = await sb.rpc("shared_dashboard", { p_token: token, p_passcode: pass });
    setChecking(false);
    if (error) { setFailed(true); return; }
    setFailed(false);
    setData(d as Shared);
  }, [sb, token]);

  useEffect(() => { load(null); }, [load]);

  if (!sb) return <Notice title="Not configured" body="This copy of the platform isn't connected to a database yet." />;
  if (failed) return <Notice title="Couldn't load" body="Check your connection and try again." retry={() => load(passcode || null)} />;
  if (!data) return <Notice title="Loading…" body="" />;

  if (data.status === "unavailable")
    return (
      <Notice
        title="This link isn't available"
        body="It may have expired or been switched off by the organisation that shared it. Ask them for a new one."
      />
    );

  if (data.status === "locked")
    return (
      <Notice
        brand={data.org}
        title="Too many wrong passcodes"
        body={`This link is locked for now${data.until ? ` — try again after ${new Date(data.until).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}. Ask whoever shared it for the passcode.`}
      />
    );

  if (data.status === "passcode_required" || data.status === "passcode_wrong")
    return (
      <Notice brand={data.org} title="Enter the passcode" body="Whoever shared this link has the passcode — it's usually sent separately.">
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (passcode.trim()) load(passcode); }}
        >
          <input
            type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="off"
            aria-label="Passcode" className="min-w-0 flex-1 rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px]"
          />
          <button type="submit" disabled={checking} className="rounded-lg bg-ink px-4 py-2 text-[14px] font-semibold text-paper disabled:opacity-50">
            {checking ? "Checking…" : "Open"}
          </button>
        </form>
        {data.status === "passcode_wrong" && <p className="mt-2 text-[13px] text-vermillion">That passcode didn&apos;t match.</p>}
      </Notice>
    );

  const d = data.dashboard!;
  const org = data.org!;
  const inRoom = data.scope?.kind === "room";
  const floor = inRoom ? d.min_n ?? 10 : data.min_group_n ?? 10;
  const suppressed = Boolean(d.suppressed);
  const map = data.show_map ? data.map ?? null : null;
  const unengaged = unengagedFrom(d);
  const completions = d.completions;
  const scopeLine = inRoom
    ? `Of those who completed the Index through “${data.scope?.room_name}” · n ${d.n.toLocaleString()}`
    : `Of those who completed the Index through any ${org.name} link · n ${d.n.toLocaleString()}`;

  return (
    <div className="flex min-h-screen flex-col bg-paper-deep">
      <header className="border-b border-rule bg-plate" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <BrandMark brand={org} />
          <span className="rounded-full border border-rule-2 px-3 py-1 text-[12.5px] font-semibold text-ink-2">View only</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-7 sm:px-8">
        <section className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">
            {inRoom ? data.scope?.room_name : `${org.name} · all surveys`}
          </h1>
          <p className="text-[14px] text-ink-2">
            Shared with {data.label} · live results, updated as people complete the Index
            {data.expires_at ? ` · this link works until ${day(data.expires_at)}` : ""}
          </p>
        </section>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <Figure
            label="J12 index"
            note={suppressed ? `${d.n} of ${floor} needed` : `n ${d.n.toLocaleString()} · ${inRoom ? "this survey" : "every survey"}`}
            value={fig(suppressed ? null : d.index)}
            accent
          />
          <Figure
            label="Completed the Index"
            note={completions ? completionsNote(completions) : inRoom ? "through this survey" : "across every survey"}
            value={(completions?.total ?? d.n).toLocaleString()}
          />
          {map ? (
            <Figure
              label="Countries active on the map"
              note={`a country lights up at ${map.country_gate.toLocaleString()} completions`}
              value={String(map.countries.length)}
            />
          ) : (
            <Figure label="Scale" note="every score is a 1–5 average" value="1–5" />
          )}
        </div>

        {(map || unengaged) && (
          <div role="group" aria-label="View" className="inline-flex flex-wrap gap-1 self-start rounded-xl bg-rule/70 p-1">
            <Seg on={view === "matrix"} onClick={() => setView("matrix")}>J12 matrix</Seg>
            {unengaged && <Seg on={view === "unengaged"} onClick={() => setView("unengaged")}>Unengaged matrix</Seg>}
            {map && <Seg on={view === "heatmap"} onClick={() => setView("heatmap")}>Heat map</Seg>}
          </div>
        )}

        <div className="flex min-h-[380px] flex-col rounded-2xl border border-rule bg-plate px-4 py-5 shadow-sm sm:px-7 sm:py-6">
          {view === "unengaged" && unengaged ? (
            <UnengagedMatrix
              data={unengaged}
              scopeLine={inRoom
                ? `Of those not yet following who completed the Index through “${data.scope?.room_name}”`
                : `Of those not yet following who completed the Index through any ${org.name} link`}
            />
          ) : view === "heatmap" && map ? (
            <div className="flex flex-col gap-4">
              <MapTierToggle tier={tier} onChange={setTier} className="rounded-full px-3.5 py-1.5 text-[13px]" />
              <WorldHeatMap countries={map.countries} tier={tier} reached={map.reached} gate={map.country_gate} />
              <p className="text-[13px] leading-relaxed text-ink-2">
                {map.published
                  ? `Each country's colour is everyone there who has completed the Index — from any organisation — and appears once ${map.country_gate.toLocaleString()} have. `
                  : "Country colours appear once the Collab publishes its shared view. "}
                Outlined countries are where {inRoom ? "this survey" : org.name} reached {floor.toLocaleString()} or more people.
              </p>
            </div>
          ) : suppressed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <p className="text-[20px] font-semibold">{d.n} of {floor} needed before we show a score</p>
              <p className="max-w-lg text-[14.5px] leading-relaxed text-ink-2">
                {inRoom
                  ? "A single survey holds its own floor, because a small group is exactly where a score could point back to a person. These responses already count toward the organisation's overall results."
                  : "A floor the whole platform holds to. Below this many people an average risks pointing back to one or two real young people, so nothing derived is shown."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <ScoreMatrix matrix={d.matrix} />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[13px] text-ink-2">{scopeLine}</span>
                <MatrixLegend />
              </div>
            </div>
          )}
        </div>

        {data.show_detail && !inRoom && (
          <section className="rounded-2xl border border-rule bg-plate px-4 py-3 sm:px-6">
            <button type="button" onClick={() => setShowDetail((v) => !v)} aria-expanded={showDetail}
              className="flex w-full items-center justify-between py-1 text-left text-[14px] font-semibold text-ink">
              More detail
              <span aria-hidden className="text-ink-2">{showDetail ? "▲" : "▾"}</span>
            </button>
            {showDetail && <div className="pb-2"><ResultsDetail dash={{ ...d, min_group_n: data.min_group_n }} /></div>}
          </section>
        )}
      </main>

      <footer className="border-t border-rule bg-plate" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-8">
          <span className="text-[13px] text-ink-2">Of those who have completed the Index · aggregates only, never an individual answer</span>
          <span className="font-mono text-[11.5px] text-ink-2">powered by The Index · jfindx.org</span>
        </div>
      </footer>
    </div>
  );
}

/** White-label means theirs: the organisation's logo or initial, and its name. */
function BrandMark({ brand }: { brand: Brand }) {
  return (
    <div className="flex items-center gap-3">
      {brand.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain" />
      ) : (
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg text-[16px] font-bold text-plate"
          style={{ background: brand.brand_color || "rgb(var(--c-ink))" }}>
          {brand.name.slice(0, 1)}
        </span>
      )}
      <span className="text-[17px] font-bold tracking-tight">{brand.name}</span>
    </div>
  );
}

function Notice({
  title, body, brand, retry, children,
}: { title: string; body: string; brand?: Brand; retry?: () => void; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      {brand && <div className="mb-4"><BrandMark brand={brand} /></div>}
      <div className="rounded-2xl border border-rule bg-plate p-6 shadow-sm">
        <h1 className="text-[18px] font-bold">{title}</h1>
        {body && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{body}</p>}
        {children}
        {retry && (
          <button type="button" onClick={retry} className="mt-4 rounded-lg border border-rule-2 px-4 py-2 text-[14px] font-semibold">
            Try again
          </button>
        )}
      </div>
      <p className="mt-4 text-center font-mono text-[11.5px] text-ink-2">powered by The Index · jfindx.org</p>
    </main>
  );
}
