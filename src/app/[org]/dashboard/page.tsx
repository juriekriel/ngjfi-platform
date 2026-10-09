"use client";

/**
 * An organisation's own dashboard — the first of the two signed-in tabs.
 *
 * Rendered through <SignedInFrame>, the same component Collab Intelligence's
 * signed-in view uses, so the two tabs are identical in shape (locked design,
 * Sept 2026): three figures, the J12 matrix / Heat map switch, "Overlay the
 * Collab" (whole house only) and "What does this mean?". Above them sit the
 * house and its rooms: selecting a distribution link scopes the dashboard to
 * that room (org_link_dashboard(), migration 0033).
 *
 * Everything that used to make this page a long scroll — trend, per-item
 * detail, Drivers & Journey, the Exploration Index, exports — is kept, one
 * click away under "Export your results", so nothing an organisation relied
 * on has gone.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import SignedInFrame from "@/components/index/SignedInFrame";
import ResultsDetail, { type DetailDash, type DetailItem } from "@/components/index/ResultsDetail";
import { unengagedFrom } from "@/components/index/UnengagedMatrix";
import { completionsNote, type Completions } from "@/lib/completions";
import RoomCards, { type RoomSelection, type DashboardView } from "@/components/index/RoomCards";
import OrgSettings from "@/components/index/OrgSettings";
import { resolvePanels, type Panels } from "@/lib/dashboardPanels";
import ShareJfindx from "@/components/index/ShareJfindx";
import OrgTeam from "@/components/index/OrgTeam";
import ShareLinksPanel from "@/components/index/ShareLinksPanel";
import type { MapCountry } from "@/components/index/WorldHeatMap";
import { exportItemsCsv } from "@/lib/exportCsv";
import WhoAnswered from "@/components/index/WhoAnswered";

type Matrix = Record<string, Record<string, number | null>>;
/** The house's full payload — ResultsDetail's shape plus what the frame and exports read. */
type Dash = DetailDash & {
  org: { slug: string; name: string; verified: boolean };
  suppressed?: boolean;
  min_group_n?: number;
  index: number | null;
  tiers: Record<string, number | null>;
  domains: Record<string, number | null>;
  matrix: Matrix;
  items: DetailItem[];
  season?: { start: string | null; end: string | null };
  /** Everyone who completed, segmented (0047). `n` above stays the J12's own n. */
  completions?: Completions;
  exploration_min_n?: number;
};
/** org_link_dashboard() (0033) — one room's J12, never benchmarked. */
type RoomDash = {
  n: number; suppressed: boolean; min_n: number; index: number | null; matrix: Matrix;
  /** 0047: a room's completions, segmented, and its own Unengaged matrix. */
  completions?: Completions;
  exploration_n?: number; exploration_min_n?: number; exploration_suppressed?: boolean;
  exploration_index?: number | null; exploration_matrix?: Matrix;
};
/** The pooled Collab picture (collab_intelligence()) — the overlay and the map. */
type Collab = { published: boolean; matrix?: Matrix; countries?: MapCountry[]; country_gate?: number };
type Season = { label: string; start: string | null; end: string | null; n: number };

type DashView = DashboardView;

export default function DashboardPage({ params }: { params: { org: string } }) {
  const slug = params.org;
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsClaim, setNeedsClaim] = useState(false);
  // True when a signed-out visitor is shown a demo organisation. Real orgs never reach this.
  const [demoPreview, setDemoPreview] = useState(false);

  const [collab, setCollab] = useState<Collab | null>(null);
  const [reached, setReached] = useState<string[]>([]);
  const [room, setRoom] = useState<RoomSelection>({ kind: "house" });
  const [roomDash, setRoomDash] = useState<RoomDash | null>(null);
  const [roomErr, setRoomErr] = useState<string | null>(null);

  const [showDetail, setShowDetail] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // What the organisation switched on (0054). Everything until it loads, or without 0054.
  const [panels, setPanels] = useState<Panels>(() => resolvePanels(null));
  // Results, Edit your dashboard, or Your team & access — one dashboard, three views (?view=).
  const [view, setView] = useState<DashView>("results");
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "settings" || v === "team") setView(v);
    // Share now lives at the foot of the results; an old ?view=share opens it there.
    else if (v === "share") setShowShare(true);
    // View-only links live in Team & access; keep any bookmarked ?view=viewlinks working.
    else if (v === "viewlinks") setView("team");
  }, []);
  const changeView = useCallback((v: DashView) => {
    setView(v);
    const u = new URL(window.location.href);
    if (v === "results") u.searchParams.delete("view");
    else u.searchParams.set("view", v);
    window.history.replaceState(null, "", u.toString());
  }, []);
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data: s } = await sb.auth.getSession();
    setAuthed(Boolean(s.session));
    setUserEmail(s.session?.user.email ?? null);

    // Public and gated server-side (country gate, publish switch) — safe either way.
    sb.rpc("collab_intelligence").then(({ data }) => data && setCollab(data as Collab));

    if (!s.session) {
      const { data, error } = await sb.rpc("org_dashboard_demo", { p_org_slug: slug });
      if (!error && data) { setDash(data as Dash); setDemoPreview(true); }
      return;
    }

    setDemoPreview(false);
    const { data, error } = await sb.rpc("org_dashboard_season", {
      p_org_slug: slug, p_season_start: null, p_season_end: null,
    });
    if (error) { setNeedsClaim(true); return; }
    setDash(data as Dash);
    setNeedsClaim(false);
    sb.rpc("org_reach_countries", { p_org_slug: slug }).then(({ data: r }) => r && setReached(r as string[]));
    sb.rpc("org_dashboard_panels", { p_org_slug: slug }).then(({ data: pn, error: pnErr }) =>
      setPanels(resolvePanels(pnErr ? null : (pn as { panels?: unknown } | null)?.panels)));
    const { data: sea, error: seaErr } = await sb.rpc("org_seasons", { p_org_slug: slug });
    if (!seaErr && sea) setSeasons(sea as Season[]);
    setSeasonIdx(0);
  }, [sb, slug]);

  useEffect(() => { load(); }, [load]);

  // A selected room loads its own J12. Never benchmarked; see RoomCards.
  useEffect(() => {
    if (!sb || room.kind !== "room" || room.link.is_test) { setRoomDash(null); setRoomErr(null); return; }
    let live = true;
    sb.rpc("org_link_dashboard", { p_org_slug: slug, p_link_id: room.link.id }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setRoomErr(error.message); setRoomDash(null); }
      else { setRoomErr(null); setRoomDash(data as RoomDash); }
    });
    return () => { live = false; };
  }, [sb, slug, room]);

  const changeSeason = useCallback(async (idx: number) => {
    if (!sb || !seasons?.[idx]) return;
    setSeasonIdx(idx);
    const picked = seasons[idx];
    const { data, error } = await sb.rpc("org_dashboard_season", {
      p_org_slug: slug, p_season_start: picked.start, p_season_end: picked.end,
    });
    if (!error && data) setDash(data as Dash);
  }, [sb, slug, seasons]);

  async function signIn() {
    if (!sb || !email) return;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined },
    });
    setMsg(error ? error.message : `Magic link sent to ${email}. Check your inbox.`);
  }

  async function claim() {
    if (!sb) return;
    const { data, error } = await sb.rpc("join_org_by_domain", { p_org_slug: slug });
    if (error) { setMsg(error.message); return; }
    const res = data as { ok: boolean; reason?: string; email_domain?: string; expected?: string };
    if (res.ok) { setMsg(null); load(); }
    else if (res.reason === "already_claimed")
      setMsg("This organisation already has its Org Administrator. Ask them to add you from Team & access on their dashboard — then use the sign-in link they send you.");
    else setMsg(`Your email domain (${res.email_domain}) doesn't match this ministry's domain (${res.expected}).`);
  }

  if (!sb) return <Plain slug={slug}><p className="text-sm text-slate">Supabase isn&apos;t configured yet.</p></Plain>;

  if (authed === false && !demoPreview)
    return (
      <Plain slug={slug}>
        <h2 className="text-lg font-semibold">Ministry sign-in</h2>
        <p className="mt-1 text-sm text-slate">Use your <b>ministry email</b> (your organisation&apos;s website domain) so we can verify you.</p>
        <div className="mt-4 flex gap-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourministry.org"
            aria-label="Ministry email" className="flex-1 rounded-lg border border-rule px-3 py-2 text-sm" />
          <button onClick={signIn} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">Send link</button>
        </div>
        {msg && <p className="mt-3 text-sm text-slate">{msg}</p>}
      </Plain>
    );

  if (needsClaim)
    return (
      <Plain slug={slug}>
        <h2 className="text-lg font-semibold">Verify your ministry</h2>
        <p className="mt-1 text-sm text-slate">
          You&apos;re signed in but not yet linked to <b>{slug}</b>. If you were added to its team, this accepts the invitation.
          If nobody has claimed it yet, we check your email domain matches its website domain and you become its Org Administrator.
        </p>
        <button onClick={claim} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Verify &amp; claim access</button>
        {msg && <p className="mt-3 text-sm text-accent">{msg}</p>}
      </Plain>
    );

  if (!dash) return <Plain slug={slug}><p className="text-sm text-slate">Loading…</p></Plain>;

  const floor = dash.min_group_n ?? 10;
  const inRoom = room.kind === "room";
  const roomName = inRoom ? room.link.name : null;
  const collabMatrix = collab?.published ? collab.matrix ?? null : null;
  const countries = collab?.published ? collab.countries ?? [] : [];
  const gate = collab?.country_gate ?? 2000;

  // What the frame shows, for the house or for one room.
  let n: number | null = dash.n;
  let index: number | null = dash.suppressed ? null : dash.index;
  let matrix: Matrix | null = dash.suppressed ? null : dash.matrix;
  let empty: { title: string; body: string } | null = dash.suppressed
    ? {
        title: `${dash.n} of ${floor} needed before we show a score`,
        body: "A floor the whole platform holds to. Below this many people an average risks pointing back to one or two real young people, so nothing derived is shown. Your count is real and visible either way.",
      }
    : null;

  if (inRoom) {
    n = roomDash?.n ?? room.link.n;
    index = roomDash && !roomDash.suppressed ? roomDash.index : null;
    matrix = roomDash && !roomDash.suppressed ? roomDash.matrix : null;
    const l = room.link;
    if (l.is_test)
      empty = {
        title: "This is a test link",
        body: "Everything works exactly as it will for real — the survey, the offline queue, the thank-you screen — but answers given here are kept apart. They never count in any score, count, map or Collab figure, and they're deleted automatically after 7 days. For a real room, make a new link without the Test box ticked.",
      };
    else if (roomErr) empty = { title: "This room couldn't load", body: roomErr };
    else if (!roomDash) empty = { title: "Loading this room…", body: "" };
    else if (roomDash.n === 0 && l.status === "scheduled" && l.active_from)
      empty = {
        title: `This link opens ${new Date(l.active_from).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        body: "Nothing has come through it yet, so there is nothing to show — and a zero would be a lie. Its results appear here once enough people finish, and they count toward the whole house at the same time.",
      };
    else if (roomDash.suppressed)
      empty = {
        title: `${roomDash.n} of ${roomDash.min_n} needed before this room shows a score`,
        body: "Rooms hold to their own floor, because a small room is exactly where a score could point back to a person. These responses already count toward your whole house.",
      };
    else empty = null;
  }

  // 0047: completions count everyone, segmented; the two matrices stay apart.
  const shownCompletions: Completions | undefined = inRoom
    ? (room.link.is_test ? undefined : roomDash?.completions)
    : dash.completions;
  const unengaged = inRoom ? (room.link.is_test || roomErr ? null : unengagedFrom(roomDash)) : unengagedFrom(dash);

  const houseNote = dash.suppressed ? `${dash.n} of ${floor} needed` : `n ${dash.n.toLocaleString()} · every link`;
  const roomNote = roomDash ? (roomDash.suppressed ? `${roomDash.n} of ${roomDash.min_n} needed` : `n ${roomDash.n.toLocaleString()} · this link`) : "loading";

  return (
    <SignedInFrame
      sb={sb}
      org={{ slug, name: dash.org.name }}
      active="org"
      email={userEmail}
      title={
        view === "settings"
          ? `${dash.org.name} · edit your dashboard`
          : view === "share"
            ? "Share about the JFINDX"
            : view === "team"
              ? `${dash.org.name} · your team & access`
            : inRoom
              ? (roomName as string)
              : `${dash.org.name} · the whole house`
      }
      body={
        view === "settings" && !demoPreview ? (
          <OrgSettings sb={sb} orgSlug={slug} onSaved={load} />
        ) : view === "team" && !demoPreview ? (
          // Who can open the dashboard, and who can see it without signing in (0046).
          <div className="flex flex-col gap-3">
            <OrgTeam sb={sb} orgSlug={slug} orgName={dash.org.name} />
            <ShareLinksPanel sb={sb} orgSlug={slug} orgName={dash.org.name} />
          </div>
        ) : view === "share" ? (
          <ShareJfindx orgName={dash.org.name} />
        ) : undefined
      }
      titleRight={
        !demoPreview && seasons && seasons.length > 1 && !inRoom ? (
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <span className="font-mono text-[11px] uppercase tracking-wider">Season</span>
            <select value={seasonIdx} onChange={(e) => changeSeason(Number(e.target.value))}
              className="rounded-lg border border-rule-2 bg-plate px-2.5 py-1.5 text-[13px] font-semibold text-ink">
              {seasons.map((se, i) => <option key={se.label} value={i}>{se.label} ({se.n.toLocaleString()})</option>)}
            </select>
          </label>
        ) : undefined
      }
      scope={
        demoPreview ? (
          <div className="rounded-xl border border-rule bg-plate px-4 py-3 text-[13.5px] text-ink-2">
            <b className="text-ink">Open preview of a sample organisation.</b> A real ministry&apos;s dashboard is only
            reachable after email verification against its own website domain — and shows aggregates only.
          </div>
        ) : (
          <RoomCards
            sb={sb}
            orgSlug={slug}
            houseN={dash.completions?.total ?? dash.n}
            selected={room}
            onSelect={(r) => {
              setRoom(r);
              if (view !== "results") changeView("results");
            }}
            orgName={dash.org.name}
            view={view}
            onView={changeView}
          />
        )
      }
      figures={{
        index,
        indexNote: inRoom ? roomNote : houseNote,
        n: shownCompletions?.total ?? n,
        nNote: shownCompletions
          ? completionsNote(shownCompletions)
          : inRoom ? "through this link · also counted in the house" : "across every link",
        scoredN: n,
        activeCountries: collab ? countries.length : null,
        countryGate: gate,
      }}
      matrix={matrix}
      empty={empty}
      overlay={{
        label: "Collab",
        button: "Overlay the Collab",
        matrix: collabMatrix,
        allowed: !inRoom,
        reason: inRoom
          ? "Comparing to the Collab is for the whole house only"
          : "The Collab's pooled view isn't published yet",
      }}
      unengaged={unengaged}
      unengagedScopeLine={
        inRoom
          ? `Of those not yet following who completed the Index through “${roomName}”`
          : `Of those not yet following who completed the Index through any ${dash.org.name} link`
      }
      consultEnabled={!demoPreview}
      countries={countries}
      reached={reached}
      roomName={roomName}
      panels={panels}
      scopeLine={
        inRoom
          ? `Of those who completed the Index through “${roomName}” · n ${(n ?? 0).toLocaleString()}`
          : `Of those who completed the Index through any ${dash.org.name} link · n ${dash.n.toLocaleString()}`
      }
    >
      {view === "results" && !demoPreview && panels.who_answered && (
        <WhoAnswered
          sb={sb}
          orgSlug={slug}
          linkId={inRoom && room.kind === "room" ? room.link.id : null}
          season={!inRoom && seasons && seasonIdx > 0 ? { start: seasons[seasonIdx].start, end: seasons[seasonIdx].end } : null}
        />
      )}
      {!inRoom && view === "results" && panels.export && (
        <section className="rounded-2xl border border-rule bg-plate px-4 py-3 sm:px-6">
          <button type="button" onClick={() => setShowDetail((v) => !v)} aria-expanded={showDetail}
            className="flex w-full items-center justify-between py-1 text-left text-[14px] font-semibold text-ink">
            Export your results
            <span aria-hidden className="text-ink-2">{showDetail ? "▲" : "▾"}</span>
          </button>
          {showDetail && (
            <div className="pb-2">
              {!demoPreview && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted">Export:</span>
                  <button type="button" disabled={exporting}
                    onClick={async () => {
                      setExporting(true);
                      const { data } = await sb.rpc("org_dashboard_season", { p_org_slug: slug, p_season_start: null, p_season_end: null });
                      if (data) exportItemsCsv(data as Dash, `${slug}-all-time`);
                      setExporting(false);
                    }}
                    className="rounded-lg border border-rule px-3 py-1.5 text-[13px] font-semibold text-ink disabled:opacity-50">
                    All data (CSV)
                  </button>
                  {seasons && seasonIdx > 0 && (
                    <button type="button" onClick={() => exportItemsCsv(dash, `${slug}-${seasons[seasonIdx].label}`)}
                      className="rounded-lg border border-rule px-3 py-1.5 text-[13px] font-semibold text-ink">
                      This season (CSV)
                    </button>
                  )}
                  <a href={`/${slug}/dashboard/export?tier=formation`} className="rounded-lg border border-rule px-3 py-1.5 text-[13px] font-semibold text-ink no-underline">
                    Heat map + Matrix (PDF) →
                  </a>
                </div>
              )}
              <ResultsDetail dash={dash} />

            </div>
          )}
        </section>
      )}
      {view === "results" && (panels.share || showShare) && (
        // Share about the JFINDX — last on the page, the same shape as
        // "Export your results" above it, a shade darker.
        <section className="rounded-2xl border border-ink bg-ink px-4 py-3 text-paper sm:px-6">
          <button type="button" onClick={() => setShowShare((v) => !v)} aria-expanded={showShare}
            className="flex w-full items-center justify-between py-1 text-left text-[14px] font-semibold text-paper">
            Share about the JFINDX
            <span aria-hidden className="text-paper/70">{showShare ? "▲" : "▾"}</span>
          </button>
          {showShare && (
            <div className="mt-3 pb-2 text-ink">
              <ShareJfindx orgName={dash.org.name} />
            </div>
          )}
        </section>
      )}
    </SignedInFrame>
  );
}

/** Sign-in, verification and loading states — before there is a dashboard to frame. */
function Plain({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{slug} · dashboard</div>
      <div className="mt-4 rounded-xl border border-rule bg-card p-6">{children}</div>
    </main>
  );
}
