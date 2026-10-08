"use client";

/**
 * "Who answered" and "Survey completion" (migration 0052), under the results.
 *
 * One dimension at a time, every row with its n, a score only where the group
 * clears the floor (the database decides; this component adds no gating of
 * its own). Followers' groups show the J12 Index; non-followers' the
 * Exploration Index — never one number for both.
 */
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { instrument } from "@/lib/instrument";
import localesFile from "@/data/locales.json";
import {
  DIMENSIONS,
  completionLine,
  groupLabel,
  stopPoints,
  type Breakdown,
  type Completion,
  type Dimension,
} from "@/lib/breakdown";

type Props = {
  sb: SupabaseClient;
  orgSlug: string;
  /** a room (distribution link); omit for the whole house */
  linkId?: string | null;
  season?: { start: string | null; end: string | null } | null;
};

const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

export default function WhoAnswered({ sb, orgSlug, linkId, season }: Props) {
  const [dim, setDim] = useState<Dimension>("age_band");
  const [bd, setBd] = useState<Breakdown | null>(null);
  const [comp, setComp] = useState<Completion | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const call = linkId
      ? sb.rpc("link_breakdown", { p_org_slug: orgSlug, p_link_id: linkId, p_dimension: dim })
      : sb.rpc("org_breakdown", {
          p_org_slug: orgSlug, p_dimension: dim,
          p_season_start: season?.start ?? null, p_season_end: season?.end ?? null,
        });
    call.then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(/org_breakdown|link_breakdown/.test(error.message) ? "This view needs migration 0052." : error.message);
      else { setErr(null); setBd(data as Breakdown); }
    });
    return () => { live = false; };
  }, [sb, orgSlug, linkId, dim, season?.start, season?.end]);

  useEffect(() => {
    let live = true;
    const call = linkId
      ? sb.rpc("link_completion", { p_org_slug: orgSlug, p_link_id: linkId })
      : sb.rpc("org_completion", {
          p_org_slug: orgSlug, p_season_start: season?.start ?? null, p_season_end: season?.end ?? null,
        });
    call.then(({ data, error }) => { if (live && !error) setComp(data as Completion); });
    return () => { live = false; };
  }, [sb, orgSlug, linkId, season?.start, season?.end]);

  const locales = (localesFile as { locales: { code: string; name: string }[] }).locales;
  const stops = comp ? stopPoints(comp) : [];
  const anyExplore = bd?.groups.some((g) => g.exploration_index != null);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-rule bg-plate px-4 py-4 sm:px-6">
      {/* ── completion ───────────────────────────────────────── */}
      <div>
        <h3 className="text-[15px] font-semibold text-ink">Survey completion</h3>
        <p className="mt-1 text-[14px] text-ink-2">{comp ? completionLine(comp) : "Loading…"}</p>
        {stops.length > 0 && (
          <div className="mt-3">
            <p className="figcap">Where people who didn&apos;t finish stopped</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {stops.map((s) => (
                <li key={s.label} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-2 text-[13px]">
                  <span className="text-ink-2">{s.label}</span>
                  <span className="h-2 rounded bg-paper-deep" aria-hidden>
                    <span className="block h-2 rounded" style={{ width: `${Math.round(s.share * 100)}%`, background: "rgb(var(--c-emerald))" }} />
                  </span>
                  <span className="tabular text-right text-ink">{s.n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {comp?.extras_opt_in_rate != null && (
          <p className="mt-2 text-[13px] text-ink-2">
            {Math.round(comp.extras_opt_in_rate * 100)}% of {comp.extras_reached.toLocaleString("en")} who reached the
            optional questions chose to answer them.
          </p>
        )}
      </div>

      {/* ── who answered ─────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink">Who answered</h3>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <span className="sr-only">Break down by</span>
            <select value={dim} onChange={(e) => setDim(e.target.value as Dimension)}
              className="rounded-lg border border-rule-2 bg-plate px-2.5 py-1.5 text-[13px] font-semibold text-ink">
              {DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
        </div>
        {err && <p className="mt-2 text-[13px] text-vermillion">{err}</p>}
        {bd && bd.groups.length === 0 && <p className="mt-2 text-[13.5px] text-ink-2">No completed surveys yet.</p>}
        {bd && bd.groups.length > 0 && (
          <table className="mt-3 w-full text-[13.5px]">
            <caption className="sr-only">Results by {DIMENSIONS.find((d) => d.key === dim)?.label}</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-1 font-medium">Group</th>
                <th className="py-1 text-right font-medium">n</th>
                <th className="w-[30%] py-1 font-medium"><span className="sr-only">Share</span></th>
                <th className="py-1 text-right font-medium">Index</th>
                {anyExplore && <th className="py-1 text-right font-medium">Exploration</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {bd.groups.map((g) => (
                <tr key={g.value}>
                  <td className="py-1.5 text-ink">{groupLabel(dim, g.value, instrument as never, locales)}</td>
                  <td className="tabular py-1.5 text-right text-ink">{g.suppressed ? <span className="text-muted">fewer than {bd.min_n}</span> : g.n}</td>
                  <td className="py-1.5 pl-3">
                    {g.share != null && (
                      <span className="block h-2 rounded bg-paper-deep" aria-hidden>
                        <span className="block h-2 rounded" style={{ width: `${Math.round(g.share * 100)}%`, background: "rgb(var(--c-violet))" }} />
                      </span>
                    )}
                  </td>
                  <td className="tabular py-1.5 text-right text-ink">{g.suppressed ? "" : fmt(g.index)}</td>
                  {anyExplore && <td className="tabular py-1.5 text-right text-ink">{g.suppressed ? "" : fmt(g.exploration_index)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bd && (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            Of those who have completed the Index · n {bd.total.toLocaleString("en")} · scores 1–5 · a group smaller than{" "}
            {bd.min_n} shows no score, and when only one group is hidden the next smallest is hidden too
            {dim === "country" ? " · a country is named only once it reaches the place gate" : ""}.
          </p>
        )}
      </div>
    </section>
  );
}
