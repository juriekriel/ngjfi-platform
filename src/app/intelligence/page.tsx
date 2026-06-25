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
};

const TIERS = ["exposure", "response", "formation", "multiplication"];
const TIER_LABEL: Record<string, string> = {
  exposure: "Exposure", response: "Response", formation: "Formation", multiplication: "Multiplication",
};
const DOMAINS = ["follow", "mission", "world"];
const DOMAIN_LABEL: Record<string, string> = {
  follow: "Follow Jesus", mission: "Participate in mission", world: "World looks different",
};
const AGE_LABEL: Record<string, string> = { "13_17": "13–17", "18_22": "18–22", "23_30": "23–30" };

const green = (v: number | null) =>
  v === null || v === undefined ? "transparent" : `rgba(63,157,114,${Math.max(0.08, v / 100)})`;
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));

export default function IntelligencePage() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [d, setD] = useState<Intel | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!sb) { setErr("Supabase not configured."); return; }
      const { data, error } = await sb.rpc("collab_intelligence");
      if (error) setErr(error.message);
      else setD(data as Intel);
    })();
  }, [sb]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Collab Intelligence
      </div>
      <h1 className="mt-2 font-sans text-3xl font-black tracking-tight sm:text-4xl">
        What the Collab sees
      </h1>
      <p className="mt-3 max-w-2xl text-slate">
        The crowdsourced picture across every participating organisation — the kind of finding no
        scattered study could prove.
      </p>

      {err && <p className="mt-6 text-sm text-accent">{err}</p>}
      {!d && !err && <p className="mt-6 text-sm text-slate">Loading…</p>}

      {d && (
        <>
          {/* headline counts */}
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-5">
            {[
              ["Responses", d.totals.responses?.toLocaleString?.() ?? d.totals.responses],
              ["Organisations", d.totals.orgs],
              ["Countries", d.totals.countries],
              ["Regions", d.totals.regions],
              ["Languages", d.totals.languages],
            ].map(([label, val]) => (
              <div key={String(label)} className="bg-card p-4">
                <div className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</div>
                <div className="mt-1 font-sans text-2xl font-bold">{String(val)}</div>
              </div>
            ))}
          </div>

          {/* journey funnel */}
          <section className="mt-8 rounded-xl border border-ink bg-card p-6">
            <h2 className="font-sans text-xl font-semibold">The journey funnel</h2>
            <p className="mt-1 text-sm text-slate">
              Global average across all responses — reached and responding, narrowing toward formation and multiplication.
            </p>
            <div className="mt-5 space-y-3">
              {TIERS.map((tk, i) => {
                const v = d.funnel?.[tk] ?? 0;
                const prev = i > 0 ? d.funnel?.[TIERS[i - 1]] ?? null : null;
                const drop = prev !== null && v !== null ? Math.round((v as number) - (prev as number)) : null;
                const low = tk === "multiplication";
                return (
                  <div key={tk} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted">
                      {TIER_LABEL[tk]}
                    </span>
                    <div className="h-9 flex-1 rounded bg-paper-deep">
                      <div
                        className="flex h-full items-center rounded pl-3 text-sm font-semibold text-white"
                        style={{ width: `${v ?? 0}%`, background: low ? "#ff7a47" : "#3f9d72" }}
                      >
                        {fmt(d.funnel?.[tk])}
                      </div>
                    </div>
                    <span className="w-10 shrink-0 font-mono text-[10px] text-accent">
                      {drop !== null ? drop : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3x4 heat grid */}
          <section className="mt-6 rounded-xl border border-ink bg-card p-6">
            <h2 className="font-sans text-xl font-semibold">Questions × tiers</h2>
            <p className="mt-1 text-sm text-slate">Every domain read at every depth — darker is stronger.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-center">
                <thead>
                  <tr>
                    <th className="w-1/4" />
                    {TIERS.map((tk) => (
                      <th key={tk} className="font-mono text-[8.5px] uppercase tracking-wider text-muted">
                        {TIER_LABEL[tk]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DOMAINS.map((dk) => (
                    <tr key={dk}>
                      <td className="text-left font-serif text-sm font-medium">{DOMAIN_LABEL[dk]}</td>
                      {TIERS.map((tk) => {
                        const v = d.matrix?.[dk]?.[tk] ?? null;
                        return (
                          <td
                            key={tk}
                            className="rounded py-3 font-sans text-base font-bold"
                            style={{ background: green(v), color: v !== null && v >= 55 ? "#fff" : "#22252b" }}
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
          </section>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* regions */}
            <section className="rounded-xl border border-ink bg-card p-6">
              <h2 className="font-sans text-xl font-semibold">By region</h2>
              <p className="mt-1 text-sm text-slate">Index by region — the Global South leads.</p>
              <div className="mt-4 space-y-3">
                {(d.regions || []).map((r) => (
                  <div key={r.region} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0">{r.region}</span>
                    <div className="h-2 flex-1 rounded bg-paper-deep">
                      <div className="h-full rounded bg-moss" style={{ width: `${r.index}%` }} />
                    </div>
                    <b className="w-8 text-right font-serif">{r.index}</b>
                    <span className="w-16 text-right font-mono text-[11px] text-muted">
                      {r.responses?.toLocaleString?.() ?? r.responses}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* by age */}
            <section className="rounded-xl border border-ink bg-card p-6">
              <h2 className="font-sans text-xl font-semibold">Multiplication by age</h2>
              <p className="mt-1 text-sm text-slate">Reproduction rises with age.</p>
              <div className="mt-4 space-y-3">
                {Object.keys(AGE_LABEL).map((ak) => {
                  const v = d.by_age?.[ak] ?? 0;
                  return (
                    <div key={ak} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 font-mono text-[11px] text-slate">{AGE_LABEL[ak]}</span>
                      <div className="h-3 flex-1 rounded bg-paper-deep">
                        <div className="h-full rounded bg-accent" style={{ width: `${v ?? 0}%` }} />
                      </div>
                      <b className="w-10 text-right font-serif">{fmt(d.by_age?.[ak])}</b>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-wider text-muted">
            Of those who completed the Index — never a whole population. ·{" "}
            <Link href="/" className="text-accent">home</Link>
          </p>
        </>
      )}
    </main>
  );
}
