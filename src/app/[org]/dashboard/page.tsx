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
 * click away under "More detail & export", so nothing an organisation relied
 * on has gone.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { instrument, t } from "@/lib/instrument";
import SignedInFrame from "@/components/index/SignedInFrame";
import RoomCards, { type RoomSelection } from "@/components/index/RoomCards";
import type { MapCountry } from "@/components/index/WorldHeatMap";
import { exportItemsCsv } from "@/lib/exportCsv";

type Matrix = Record<string, Record<string, number | null>>;
type Item = { key: string; domain: string; tier: string; mean: number | null; n: number };
/** Drivers/Journey are unscored (option-selection rates, not means) — reported
 * alongside the Index, never blended into it. Below min_group_n, `options`
 * is null but `n` is still shown, same suppression style as everything else. */
type InsightAgg = { n: number; options: Record<string, number> | null };
type Dash = {
  org: { slug: string; name: string; verified: boolean };
  n: number;
  suppressed?: boolean;
  min_group_n?: number;
  index: number | null;
  tiers: Record<string, number | null>;
  domains: Record<string, number | null>;
  matrix: Matrix;
  items: Item[];
  trend?: { year: number; index: number }[] | null;
  insights?: Record<string, InsightAgg>;
  /** The Exploration Index (0026) — a SEPARATE figure, never blended with the Index. */
  exploration_n?: number;
  exploration_suppressed?: boolean;
  exploration_index?: number | null;
  exploration_tiers?: Record<string, number | null>;
  exploration_domains?: Record<string, number | null>;
  exploration_matrix?: Matrix;
  season?: { start: string | null; end: string | null };
};
/** org_link_dashboard() (0033) — one room's J12, never benchmarked. */
type RoomDash = { n: number; suppressed: boolean; min_n: number; index: number | null; matrix: Matrix };
/** The pooled Collab picture (collab_intelligence()) — the overlay and the map. */
type Collab = { published: boolean; matrix?: Matrix; countries?: MapCountry[]; country_gate?: number };
type Season = { label: string; start: string | null; end: string | null; n: number };

const TIERS = ["exposure", "response", "formation", "multiplication"];
const TIER_LABEL: Record<string, string> = {
  exposure: "Exposure", response: "Response", formation: "Formation", multiplication: "Multiplication",
};
const DOMAINS = ["follow", "mission", "world"];
const DOMAIN_LABEL: Record<string, string> = {
  follow: "Follow Jesus", mission: "Participate in mission", world: "World looks different",
};
const ITEM_LABEL: Record<string, string> = Object.fromEntries(
  instrument.items.map((i) => [i.key, t(i.text, "en")]),
);
// Drivers/Journey, in instrument order — derived from the instrument, never hard-coded.
const INSIGHT_ITEMS = instrument.items
  .filter((i) => i.question_domain === "drivers" || i.question_domain === "journey")
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((i) => ({
    key: i.key,
    domain: i.question_domain,
    label: t(i.text, "en"),
    options: (i.options ?? []).map((o) => ({ value: String(o.value), label: t(o.text, "en") })),
  }));
const labelFor = (key: string) => ITEM_LABEL[key] ?? key;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n));
const violet = (v: number | null) =>
  v === null || v === undefined ? "transparent" : `rgba(139,92,246,${Math.max(0.08, v / 5.5)})`;

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
    const { data: sea, error: seaErr } = await sb.rpc("org_seasons", { p_org_slug: slug });
    if (!seaErr && sea) setSeasons(sea as Season[]);
    setSeasonIdx(0);
  }, [sb, slug]);

  useEffect(() => { load(); }, [load]);

  // A selected room loads its own J12. Never benchmarked; see RoomCards.
  useEffect(() => {
    if (!sb || room.kind !== "room") { setRoomDash(null); setRoomErr(null); return; }
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
    const res = data as { ok: boolean; email_domain?: string; expected?: string };
    if (res.ok) { setMsg(null); load(); }
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
        <p className="mt-1 text-sm text-slate">You&apos;re signed in but not yet linked to <b>{slug}</b>. We check your email domain matches its website domain.</p>
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
    if (roomErr) empty = { title: "This room couldn't load", body: roomErr };
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

  const houseNote = dash.suppressed ? `${dash.n} of ${floor} needed` : `n ${dash.n.toLocaleString()} · every link`;
  const roomNote = roomDash ? (roomDash.suppressed ? `${roomDash.n} of ${roomDash.min_n} needed` : `n ${roomDash.n.toLocaleString()} · this link`) : "loading";

  return (
    <SignedInFrame
      sb={sb}
      org={{ slug, name: dash.org.name }}
      active="org"
      email={userEmail}
      title={inRoom ? (roomName as string) : `${dash.org.name} · the whole house`}
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
          <RoomCards sb={sb} orgSlug={slug} houseN={dash.n} selected={room} onSelect={setRoom} />
        )
      }
      figures={{
        index,
        indexNote: inRoom ? roomNote : houseNote,
        n,
        nNote: inRoom ? "through this link · also counted in the house" : "across every link",
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
      consultEnabled={!demoPreview}
      countries={countries}
      reached={reached}
      roomName={roomName}
      scopeLine={
        inRoom
          ? `Of those who completed the Index through “${roomName}” · n ${(n ?? 0).toLocaleString()}`
          : `Of those who completed the Index through any ${dash.org.name} link · n ${dash.n.toLocaleString()}`
      }
    >
      {!inRoom && (
        <section className="rounded-2xl border border-rule bg-plate px-4 py-3 sm:px-6">
          <button type="button" onClick={() => setShowDetail((v) => !v)} aria-expanded={showDetail}
            className="flex w-full items-center justify-between py-1 text-left text-[14px] font-semibold text-ink">
            More detail &amp; export
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
              {!dash.suppressed && (
                <>
          {/* trend over waves */}
          {dash.trend && dash.trend.length > 1 && (
            <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Movement over time</div>
              <div className="mt-3 flex items-end gap-5">
                {dash.trend.map((p) => (
                  <div key={p.year} className="flex flex-col items-center gap-1">
                    <div className="text-xs font-bold">{p.index}</div>
                    <div className="w-10 rounded-t bg-moss" style={{ height: `${Math.max(6, (p.index / 5) * 90)}px` }} />
                    <div className="font-mono text-[10px] text-muted">{p.year}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* per-item table */}
          <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Per-question detail</div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-wider text-muted">
                  <th className="pb-2">Item</th><th className="pb-2">Tier</th><th className="pb-2 text-right">Mean</th><th className="pb-2 text-right">n</th>
                </tr>
              </thead>
              <tbody>
                {(dash.items || []).map((it) => (
                  <tr key={it.key} className="border-t border-rule">
                    <td className="py-1.5 pr-2">{labelFor(it.key) || it.key}</td>
                    <td className="py-1.5 font-mono text-[10px] uppercase text-muted">{TIER_LABEL[it.tier] || it.tier}</td>
                    <td className="py-1.5 text-right font-semibold">{fmt(it.mean)}</td>
                    <td className="py-1.5 text-right font-mono text-[11px] text-muted">{it.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Drivers & Journey — unscored insight layers, reported separately from
              the Index above, never blended into it (CLAUDE.md #6, #9). */}
          {dash.insights && Object.keys(dash.insights).length > 0 && (
            <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">
                Drivers &amp; journey — not part of the Index score
              </div>
              <div className="mt-3 space-y-4">
                {INSIGHT_ITEMS.map((item) => {
                  const agg = dash.insights?.[item.key];
                  if (!agg) return null;
                  return (
                    <div key={item.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">n {agg.n}</span>
                      </div>
                      {agg.options ? (
                        <div className="mt-1.5 space-y-1">
                          {item.options.map((o) => {
                            const count = agg.options?.[o.value] ?? 0;
                            const pct = agg.n > 0 ? Math.round((count / agg.n) * 100) : 0;
                            return (
                              <div key={o.value} className="flex items-center gap-2 text-xs">
                                <span className="w-44 shrink-0 truncate text-slate" title={o.label}>{o.label}</span>
                                <div className="h-2 flex-1 rounded bg-paper-deep">
                                  <div className="h-full rounded bg-bench" style={{ width: `${pct}%` }} />
                                </div>
                                <b className="w-9 shrink-0 text-right font-mono text-[10px]">{pct}%</b>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-1 font-mono text-[10px] text-muted">Not enough data yet.</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 font-mono text-[9px] uppercase tracking-wider text-muted">
                Respondents could pick more than one — shares don&apos;t sum to 100%.
              </p>
            </div>
          )}

                </>
              )}
      {/* The Exploration Index — v4's parallel figure for the Unengaged branch
          (migration 0026). Rendered independently of the block above: the two
          figures are suppressed on their own separate n, so an org can clear
          one gate without clearing the other. Never shown as part of, or
          combined with, the Index score above. */}
      {dash && typeof dash.exploration_n === "number" && dash.exploration_n > 0 && (
        <div className="mt-6 rounded-lg border-2 border-violet bg-paper p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-violet">
              The Exploration Index — not the Index score
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              n = {dash.exploration_n.toLocaleString()}
            </span>
          </div>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate">
            A separate, equally-structured measure for respondents who don&apos;t yet identify as
            followers of Jesus. Same 3×4 model, same math as the Index above — never summed,
            averaged, or otherwise blended with it.
          </p>

          {dash.exploration_suppressed ? (
            <p className="mt-4 text-sm text-slate">
              {dash.exploration_n} of {dash.min_group_n ?? 10} needed before we show a score.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
                <div className="rounded-lg border border-rule bg-paper-deep p-4">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Exploration score</div>
                  <div className="mt-2 text-4xl font-bold text-violet">{fmt(dash.exploration_index)}</div>
                </div>
                <div className="rounded-lg border border-rule bg-paper-deep p-4">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted">The journey</div>
                  <div className="mt-2 space-y-1.5">
                    {TIERS.map((tk) => (
                      <div key={tk} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-slate">{TIER_LABEL[tk]}</span>
                        <div className="h-2.5 flex-1 rounded bg-paper">
                          <div
                            className="h-full rounded bg-navy"
                            style={{ width: `${((dash.exploration_tiers?.[tk] ?? 0) / 5) * 100}%` }}
                          />
                        </div>
                        <b className="w-7 text-right">{fmt(dash.exploration_tiers?.[tk])}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-rule bg-paper-deep p-4">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted">By question</div>
                  <div className="mt-3 space-y-2.5">
                    {DOMAINS.map((dk) => (
                      <div key={dk} className="text-sm">
                        <div className="flex justify-between">
                          <span>{DOMAIN_LABEL[dk]}</span>
                          <b>{fmt(dash.exploration_domains?.[dk])}</b>
                        </div>
                        <div className="mt-1 h-2 rounded bg-paper">
                          <div
                            className="h-full rounded bg-navy"
                            style={{ width: `${((dash.exploration_domains?.[dk] ?? 0) / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-rule bg-paper-deep p-4">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Questions × tiers</div>
                  <table className="mt-3 w-full border-separate border-spacing-1 text-center text-xs">
                    <thead><tr><th /></tr></thead>
                    <tbody>
                      {DOMAINS.map((dk) => (
                        <tr key={dk}>
                          <td className="text-left text-[11px]">{DOMAIN_LABEL[dk]}</td>
                          {TIERS.map((tk) => {
                            const v = dash.exploration_matrix?.[dk]?.[tk] ?? null;
                            return (
                              <td
                                key={tk}
                                className="rounded py-2 font-semibold"
                                style={{ background: violet(v), color: v !== null && v >= 3.2 ? "#fff" : "#22252b" }}
                              >
                                {fmt(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <p className="mt-4 font-mono text-[9px] uppercase tracking-wider text-violet">
            Aggregates only — never individual responses. Of those who completed the Index. Never blended with the Index score.
          </p>
        </div>
      )}

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
