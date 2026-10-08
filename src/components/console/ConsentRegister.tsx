"use client";

/**
 * The consent register (migration 0053 admin_consent_register()): every live
 * organisation and every survey it can send — consented or not, for what, by
 * whom and when, with the full history. Staff names and dates only; nothing
 * about any respondent. Administrators only.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_COUNTRIES } from "@/lib/consentCountries";

type History = {
  confirmed_at: string;
  confirmed_by: string | null;
  countries: string[];
  age_bands: string[];
  includes_minors: boolean;
  method: string;
  ethics_reference: string | null;
  local_advice_reference: string | null;
  statement_version: string;
  why_consent_version: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
};
type Survey = { link_id: string | null; name: string; state: string; history: History[] };
type OrgRow = {
  short_name: string;
  name: string;
  country: string | null;
  status: string | null;
  org_consent: { attested: boolean; attested_at: string | null; attested_by: string | null; statement_version: string | null; why_consent_version: string | null; current: boolean };
  surveys: Survey[];
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "not_consented", label: "Not consented" },
  { key: "outdated", label: "Outdated version" },
  { key: "minors", label: "Includes minors" },
  { key: "care", label: "High-care countries" },
  { key: "recent", label: "Confirmed in the last 7 days" },
] as const;

const careCodes = new Set(CONSENT_COUNTRIES.filter((c) => c.care_level === "high" || c.care_level === "block_until_advice").map((c) => c.country_code));
const countryName = (code: string) => (code.startsWith("OTHER:") ? code.slice(6) : CONSENT_COUNTRIES.find((c) => c.country_code === code)?.country ?? code);
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATE_LABEL: Record<string, string> = { current: "Consented", outdated: "Consented · reconfirm", expired: "Expired", revoked: "Withdrawn", none: "Not consented" };
const STATE_COLOUR: Record<string, string> = { current: "--c-green", outdated: "--c-amber", expired: "--c-vermillion", revoked: "--c-muted", none: "--c-vermillion" };

function matches(f: string, o: OrgRow, s: Survey): boolean {
  const cur = s.history.find((h) => !h.revoked_at);
  switch (f) {
    case "not_consented": return !o.org_consent.attested || !["current", "outdated"].includes(s.state);
    case "outdated": return s.state === "outdated" || s.state === "expired" || !o.org_consent.current;
    case "minors": return Boolean(cur?.includes_minors);
    case "care": return Boolean(cur?.countries.some((c) => careCodes.has(c)));
    case "recent": return Boolean(cur && Date.now() - new Date(cur.confirmed_at).getTime() < 7 * 864e5);
    default: return true;
  }
}

function csv(rows: OrgRow[]): string {
  const head = ["organisation", "org_consent", "org_consent_by", "org_consent_at", "survey", "state", "countries", "age_bands", "includes_minors", "method", "ethics_reference", "local_advice_reference", "confirmed_by", "confirmed_at", "statement_version", "why_consent_version", "revoked_at", "revoke_reason"];
  // Quote every cell, and defuse anything a spreadsheet would run as a formula
  // (references and reasons are typed by organisation admins).
  const q = (v: unknown) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const lines = [head.join(",")];
  for (const o of rows)
    for (const s of o.surveys)
      for (const h of s.history.length ? s.history : [null])
        lines.push([o.name, o.org_consent.attested ? "yes" : "no", o.org_consent.attested_by, o.org_consent.attested_at, s.name, s.state,
          h?.countries.map(countryName).join("; "), h?.age_bands.join("; "), h?.includes_minors, h?.method, h?.ethics_reference,
          h?.local_advice_reference, h?.confirmed_by, h?.confirmed_at, h?.statement_version, h?.why_consent_version, h?.revoked_at, h?.revoke_reason].map(q).join(","));
  return lines.join("\n");
}

export default function ConsentRegister({ sb }: { sb: SupabaseClient | null }) {
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    sb.rpc("admin_consent_register").then(({ data, error }) => {
      if (error) setErr(/admin_consent_register/.test(error.message) ? "The consent register needs migration 0053." : error.message);
      else setRows(data as OrgRow[]);
    });
  }, [sb]);

  const shown = useMemo(
    () => (rows ?? []).map((o) => ({ ...o, surveys: o.surveys.filter((s) => matches(filter, o, s)) })).filter((o) => filter === "all" || o.surveys.length > 0),
    [rows, filter],
  );

  function download() {
    if (!rows) return;
    const blob = new Blob([csv(shown)], { type: "text/csv" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `consent-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  if (err) return <p className="text-[14px] text-vermillion">{err}</p>;
  if (!rows) return <p className="text-[14px] text-ink-2">Loading the register…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${filter === f.key ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={download} className="rounded-lg border border-rule-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink">
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-[13.5px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1.5 font-medium">Organisation</th>
              <th className="py-1.5 font-medium">Organisation consent</th>
              <th className="py-1.5 text-right font-medium">Surveys</th>
              <th className="py-1.5 text-right font-medium">Consented</th>
              <th className="py-1.5 text-right font-medium">Not</th>
              <th className="py-1.5 text-right font-medium">Minors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {shown.map((o) => {
              const ok = o.surveys.filter((s) => ["current", "outdated"].includes(s.state)).length;
              const minors = o.surveys.filter((s) => s.history.find((h) => !h.revoked_at)?.includes_minors).length;
              const isOpen = open === o.short_name;
              return (
                <Fragment key={o.short_name}>
                  <tr className="cursor-pointer hover:bg-paper-deep" onClick={() => setOpen(isOpen ? null : o.short_name)}>
                    <td className="py-2 font-semibold text-ink">
                      <button type="button" aria-expanded={isOpen} className="text-left">{isOpen ? "▾" : "▸"} {o.name}</button>
                    </td>
                    <td className="py-2">
                      {o.org_consent.attested ? (
                        <span>
                          <span style={{ color: `rgb(var(${o.org_consent.current ? "--c-green" : "--c-amber"}))` }}>●</span>{" "}
                          {o.org_consent.attested_by ?? "—"} · {day(o.org_consent.attested_at)}
                          {!o.org_consent.current && " · reconfirm"}
                        </span>
                      ) : (
                        <span className="text-vermillion">Not confirmed</span>
                      )}
                    </td>
                    <td className="tabular py-2 text-right">{o.surveys.length}</td>
                    <td className="tabular py-2 text-right">{ok}</td>
                    <td className="tabular py-2 text-right">{o.surveys.length - ok}</td>
                    <td className="tabular py-2 text-right">{minors}</td>
                  </tr>
                  {isOpen &&
                    o.surveys.map((s) => {
                      const cur = s.history.find((h) => !h.revoked_at) ?? s.history[0];
                      return (
                        <tr key={`${o.short_name}:${s.link_id ?? "house"}`} className="bg-paper-deep/60 align-top">
                          <td className="py-2 pl-6 text-ink">{s.name}</td>
                          <td className="py-2" colSpan={5}>
                            <span className="font-semibold" style={{ color: `rgb(var(${STATE_COLOUR[s.state] ?? "--c-muted"}))` }}>
                              {STATE_LABEL[s.state] ?? s.state}
                            </span>
                            {cur && (
                              <span className="block text-[12.5px] leading-relaxed text-ink-2">
                                {cur.countries.map(countryName).join(", ")} · ages {cur.age_bands.join(", ")} ·{" "}
                                {cur.method.replace(/_/g, " ")}
                                {cur.ethics_reference ? ` · ethics ${cur.ethics_reference}` : ""}
                                {cur.local_advice_reference ? ` · local advice: ${cur.local_advice_reference}` : ""}
                                <br />
                                {cur.revoked_at
                                  ? `Withdrawn by ${cur.revoked_by ?? "—"} · ${day(cur.revoked_at)} — ${cur.revoke_reason ?? ""}`
                                  : `Confirmed by ${cur.confirmed_by ?? "—"} · ${day(cur.confirmed_at)} · statement ${cur.statement_version} · Why consent ${cur.why_consent_version}`}
                                {s.history.length > 1 && ` · ${s.history.length - 1} earlier`}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted">
        Staff names and dates only — nothing about any young person. Consent records themselves stay with each
        organisation.
      </p>
    </div>
  );
}
