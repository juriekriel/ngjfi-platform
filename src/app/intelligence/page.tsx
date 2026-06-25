"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Intel = {
  totals: { responses: number; orgs: number; countries: number; regions: number; languages: number };
  funnel: Record<string, number | null>;
  domains: Record<string, number | null>;
  matrix: Record<string, Record<string, number | null>>;
  by_age: Record<string, number | null>;
  regions: { region: string; index: number; responses: number }[];
  trend: { year: number; index: number }[] | null;
  countries: { country: string; n: number; tiers: Record<string, number | null> }[] | null;
  findings: { formation_mult_r2: number | null; formation_corr: number | null; mult_top: number | null; mult_bottom: number | null };
};

const TIERS = ["exposure", "response", "formation", "multiplication"];
const TIER_LABEL: Record<string, string> = { exposure: "Exposure", response: "Response", formation: "Formation", multiplication: "Multiplication" };
const DOMAINS = ["follow", "mission", "world"];
const DOMAIN_LABEL: Record<string, string> = { follow: "Follow Jesus", mission: "Participate in mission", world: "World looks different" };
const AGE_LABEL: Record<string, string> = { "13_17": "13–17", "18_22": "18–22", "23_30": "23–30" };

// rough geographic tile layout for the demo countries
const TILES: Record<string, { c: number; r: number; code: string }> = {
  Canada: { c: 2, r: 1, code: "CA" }, "United States": { c: 2, r: 2, code: "US" }, Mexico: { c: 2, r: 3, code: "MX" },
  Colombia: { c: 3, r: 4, code: "CO" }, Peru: { c: 3, r: 5, code: "PE" }, Brazil: { c: 4, r: 5, code: "BR" }, Argentina: { c: 3, r: 7, code: "AR" },
  Sweden: { c: 7, r: 1, code: "SE" }, "United Kingdom": { c: 6, r: 2, code: "UK" }, Germany: { c: 7, r: 2, code: "DE" }, France: { c: 6, r: 3, code: "FR" },
  Egypt: { c: 8, r: 4, code: "EG" }, Nigeria: { c: 6, r: 5, code: "NG" }, Uganda: { c: 7, r: 5, code: "UG" }, Kenya: { c: 8, r: 5, code: "KE" }, "South Africa": { c: 7, r: 7, code: "ZA" },
  Kazakhstan: { c: 10, r: 2, code: "KZ" }, Nepal: { c: 11, r: 3, code: "NP" }, India: { c: 11, r: 4, code: "IN" },
  Japan: { c: 13, r: 2, code: "JP" }, "South Korea": { c: 13, r: 3, code: "KR" },
  Vietnam: { c: 12, r: 5, code: "VN" }, Indonesia: { c: 12, r: 6, code: "ID" }, Philippines: { c: 13, r: 5, code: "PH" }, "Papua New Guinea": { c: 13, r: 6, code: "PG" },
};
const level = (v: number | null | undefined) =>
  v === null || v === undefined ? "#e6e8ec" : v >= 58 ? "#3f9d72" : v >= 42 ? "#e0993f" : "#d65349";
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
const greenCell = (v: number | null) => (v === null || v === undefined ? "transparent" : `rgba(63,157,114,${Math.max(0.08, v / 100)})`);

export default function IntelligencePage() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [d, setD] = useState<Intel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tier, setTier] = useState("formation");

  useEffect(() => {
    (async () => {
      if (!sb) { setErr("Supabase not configured."); return; }
      const { data, error } = await sb.rpc("collab_intelligence");
      if (error) setErr(error.message); else setD(data as Intel);
    })();
  }, [sb]);

  const f = d?.findings;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Collab Intelligence</div>
      <h1 className="mt-2 font-sans text-3xl font-black tracking-tight sm:text-4xl">What the Collab sees</h1>
      <p className="mt-3 max-w-2xl text-slate">
        The crowdsourced picture across every participating organisation — the kind of finding no scattered study could prove.
      </p>

      {err && <p className="mt-6 text-sm text-accent">{err}</p>}
      {!d && !err && <p className="mt-6 text-sm text-slate">Loading…</p>}

      {d && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-5">
            {[["Responses", d.totals.responses], ["Organisations", d.totals.orgs], ["Countries", d.totals.countries], ["Regions", d.totals.regions], ["Languages", d.totals.languages]].map(([label, val]) => (
              <div key={String(label)} className="bg-card p-4">
                <div className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</div>
                <div className="mt-1 font-sans text-2xl font-bold">{Number(val).toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* trend */}
          {d.trend && d.trend.length > 1 && (
            <section className="mt-6 rounded-xl border border-ink bg-card p-6">
              <h2 className="font-sans text-xl font-semibold">Movement over time</h2>
              <p className="mt-1 text-sm text-slate">Global Index by annual wave — the number the Collab cares about most.</p>
              <div className="mt-4 flex items-end gap-6">
                {d.trend.map((p) => (
                  <div key={p.year} className="flex flex-col items-center gap-1">
                    <div className="text-sm font-bold">{p.index}</div>
                    <div className="w-12 rounded-t bg-moss" style={{ height: `${Math.max(8, (p.index / 100) * 120)}px` }} />
                    <div className="font-mono text-[10px] text-muted">{p.year}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* funnel */}
          <section className="mt-6 rounded-xl border border-ink bg-card p-6">
            <h2 className="font-sans text-xl font-semibold">The journey funnel</h2>
            <p className="mt-1 text-sm text-slate">Reached and responding, narrowing toward formation and multiplication.</p>
            <div className="mt-5 space-y-3">
              {TIERS.map((tk, i) => {
                const v = d.funnel?.[tk] ?? 0;
                const prev = i > 0 ? d.funnel?.[TIERS[i - 1]] ?? null : null;
                const drop = prev !== null && v !== null ? Math.round((v as number) - (prev as number)) : null;
                return (
                  <div key={tk} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted">{TIER_LABEL[tk]}</span>
                    <div className="h-9 flex-1 rounded bg-paper-deep">
                      <div className="flex h-full items-center rounded pl-3 text-sm font-semibold text-white" style={{ width: `${v ?? 0}%`, background: tk === "multiplication" ? "#ff7a47" : "#3f9d72" }}>{fmt(d.funnel?.[tk])}</div>
                    </div>
                    <span className="w-10 shrink-0 font-mono text-[10px] text-accent">{drop !== null ? drop : ""}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* findings */}
          {f && (
            <section className="mt-6 rounded-xl border border-ink bg-card p-6">
              <h2 className="font-sans text-xl font-semibold">What the data reveals</h2>
              <p className="mt-1 text-sm text-slate">Correlations the shared dataset makes visible (computed live across organisations).</p>
              <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
                <div className="bg-card p-5">
                  <div className="font-serif text-3xl font-black text-accent">{fmt(f.formation_mult_r2)}%</div>
                  <div className="mt-2 text-sm text-slate">of the variation in multiplication is explained by an org&apos;s formation score (r = {fmt(f.formation_corr)}).</div>
                </div>
                <div className="bg-card p-5">
                  <div className="font-serif text-3xl font-black text-accent">{fmt(f.mult_top)}</div>
                  <div className="mt-2 text-sm text-slate">multiplication score in top-quartile organisations — versus {fmt(f.mult_bottom)} in the bottom quartile.</div>
                </div>
                <div className="bg-card p-5">
                  <div className="font-serif text-3xl font-black text-accent">
                    {f.mult_top && f.mult_bottom ? (f.mult_top / Math.max(1, f.mult_bottom)).toFixed(1) : "—"}×
                  </div>
                  <div className="mt-2 text-sm text-slate">higher multiplication where formation runs deep — the engine of reproduction.</div>
                </div>
              </div>
            </section>
          )}

          {/* heat grid */}
          <section className="mt-6 rounded-xl border border-ink bg-card p-6">
            <h2 className="font-sans text-xl font-semibold">Questions × tiers</h2>
            <p className="mt-1 text-sm text-slate">Every domain read at every depth — darker is stronger.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-center">
                <thead><tr><th className="w-1/4" />{TIERS.map((tk) => (<th key={tk} className="font-mono text-[8.5px] uppercase tracking-wider text-muted">{TIER_LABEL[tk]}</th>))}</tr></thead>
                <tbody>
                  {DOMAINS.map((dk) => (
                    <tr key={dk}>
                      <td className="text-left font-serif text-sm font-medium">{DOMAIN_LABEL[dk]}</td>
                      {TIERS.map((tk) => {
                        const v = d.matrix?.[dk]?.[tk] ?? null;
                        return <td key={tk} className="rounded py-3 font-sans text-base font-bold" style={{ background: greenCell(v), color: v !== null && v >= 55 ? "#fff" : "#22252b" }}>{fmt(v)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* map */}
          {d.countries && (
            <section className="mt-6 rounded-xl border border-ink bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-sans text-xl font-semibold">The map, tier by tier</h2>
                  <p className="mt-1 text-sm text-slate">Nations coloured by score — switch tiers to watch the world shift.</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {TIERS.map((tk) => (
                    <button key={tk} onClick={() => setTier(tk)}
                      className={`rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider ${tier === tk ? "border-ink bg-ink text-paper" : "border-rule text-slate"}`}>
                      {TIER_LABEL[tk]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(13, minmax(34px, 1fr))", gridAutoRows: "40px", minWidth: 560 }}>
                  {(d.countries || []).map((c) => {
                    const pos = TILES[c.country];
                    if (!pos) return null;
                    const v = c.tiers?.[tier] ?? null;
                    const dark = v !== null && v !== undefined;
                    return (
                      <div key={c.country} title={`${c.country} · ${TIER_LABEL[tier]}: ${fmt(v)} (n=${c.n})`}
                        className="flex flex-col items-center justify-center rounded"
                        style={{ gridColumn: pos.c, gridRow: pos.r, background: level(v), color: dark ? "#fff" : "#9aa0a8" }}>
                        <span className="font-mono text-[10px] font-semibold leading-none">{pos.code}</span>
                        <span className="text-[9px] font-semibold leading-none opacity-90">{fmt(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 font-mono text-[9px] uppercase tracking-wider text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: "#3f9d72" }} /> Strong · 58+</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: "#e0993f" }} /> Emerging · 42–57</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: "#d65349" }} /> Early · under 42</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-rule" style={{ background: "#e6e8ec" }} /> No data</span>
              </div>
            </section>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border border-ink bg-card p-6">
              <h2 className="font-sans text-xl font-semibold">By region</h2>
              <p className="mt-1 text-sm text-slate">Index by region — the Global South leads.</p>
              <div className="mt-4 space-y-3">
                {(d.regions || []).map((r) => (
                  <div key={r.region} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0">{r.region}</span>
                    <div className="h-2 flex-1 rounded bg-paper-deep"><div className="h-full rounded bg-moss" style={{ width: `${r.index}%` }} /></div>
                    <b className="w-8 text-right font-serif">{r.index}</b>
                    <span className="w-16 text-right font-mono text-[11px] text-muted">{r.responses?.toLocaleString?.() ?? r.responses}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-ink bg-card p-6">
              <h2 className="font-sans text-xl font-semibold">Multiplication by age</h2>
              <p className="mt-1 text-sm text-slate">Reproduction rises with age.</p>
              <div className="mt-4 space-y-3">
                {Object.keys(AGE_LABEL).map((ak) => {
                  const v = d.by_age?.[ak] ?? 0;
                  return (
                    <div key={ak} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 font-mono text-[11px] text-slate">{AGE_LABEL[ak]}</span>
                      <div className="h-3 flex-1 rounded bg-paper-deep"><div className="h-full rounded bg-accent" style={{ width: `${v ?? 0}%` }} /></div>
                      <b className="w-10 text-right font-serif">{fmt(d.by_age?.[ak])}</b>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-wider text-muted">
            Of those who completed the Index — never a whole population. · <Link href="/" className="text-accent">home</Link>
          </p>
        </>
      )}
    </main>
  );
}
