"use client";

/**
 * §6 of the consent resource — the country reference, now every country
 * (Oct 2026). Two hundred rows need a search box and a level filter on
 * screen; on paper (@media print) every row prints, filters or not.
 * Rows come straight from src/data/consent-countries.json via
 * lib/consentCountries — never a copy. First-pass (v2) rows are marked.
 */
import { useMemo, useState } from "react";
import { CARE_LABEL, CARE_ORDER, CONSENT_COUNTRIES_SORTED, isFirstPass, type CareLevel } from "@/lib/consentCountries";

const CARE_TONE: Record<CareLevel, string> = {
  standard: "rgb(var(--c-rule-2))",
  care: "rgb(var(--c-amber))",
  high: "rgb(var(--c-vermillion))",
  block_until_advice: "rgb(var(--c-vermillion))",
};

export default function CountryReference() {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<CareLevel | "all">("all");
  const term = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      CONSENT_COUNTRIES_SORTED.filter(
        (c) =>
          (level === "all" || c.care_level === level) &&
          (!term || c.country.toLowerCase().includes(term) || c.main_law.toLowerCase().includes(term) || c.country_code.toLowerCase() === term),
      ),
    [term, level],
  );
  const count = (l: CareLevel) => CONSENT_COUNTRIES_SORTED.filter((c) => c.care_level === l).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a country or law…"
          aria-label="Search the country reference"
          className="min-w-[14rem] flex-1 rounded-md border border-rule-2 px-2.5 py-1.5 text-[14px]"
        />
        <div role="group" aria-label="Filter by level of care" className="flex flex-wrap gap-1">
          {(["all", ...CARE_ORDER] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${level === l ? "border-ink bg-ink text-paper" : "border-rule text-ink-2 hover:text-ink"}`}
            >
              {l === "all" ? `All ${CONSENT_COUNTRIES_SORTED.length}` : `${CARE_LABEL[l].split(" — ")[0].replace("Blocked until local legal advice is recorded", "Blocked")} · ${count(l)}`}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-muted print:hidden" aria-live="polite">
        Showing {shown.length} of {CONSENT_COUNTRIES_SORTED.length}. Printing includes every country.
      </p>

      <div className="mt-2 max-h-[36rem] overflow-auto rounded-lg border border-rule print:max-h-none print:overflow-visible print:border-0">
        <table className="w-full min-w-[56rem] border-collapse text-[13px] leading-snug">
          <thead className="sticky top-0 bg-plate print:static">
            <tr>
              {["Country", "Main law (regulator)", "Parent/guardian consent needed under", "Faith answers sensitive?", "Ethics review for a church-run survey", "Storing data abroad (US/EU)", "Level of care"].map((h) => (
                <th key={h} className="border-b border-rule-2 px-2 py-1.5 text-left font-semibold text-ink">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONSENT_COUNTRIES_SORTED.map((c) => {
              const on = shown.includes(c);
              return (
                <tr key={c.country_code} className={`align-top ${on ? "" : "hidden print:table-row"}`}>
                  <td className="border-b border-rule px-2 py-1.5">
                    <b className="text-ink">{c.country}</b>
                    {isFirstPass(c) && <span className="mt-0.5 block text-[11px] text-muted">first pass · to verify</span>}
                  </td>
                  <td className="border-b border-rule px-2 py-1.5">{c.main_law}</td>
                  <td className="border-b border-rule px-2 py-1.5">{c.parental_consent_note}</td>
                  <td className="border-b border-rule px-2 py-1.5">{c.faith_data}</td>
                  <td className="border-b border-rule px-2 py-1.5">{c.ethics_review}</td>
                  <td className="border-b border-rule px-2 py-1.5">{c.data_abroad}</td>
                  <td className="border-b border-rule px-2 py-1.5" style={{ boxShadow: `inset 3px 0 0 ${CARE_TONE[c.care_level]}` }}>
                    <span className="block font-semibold text-ink">{CARE_LABEL[c.care_level]}</span>
                    {c.summary}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
