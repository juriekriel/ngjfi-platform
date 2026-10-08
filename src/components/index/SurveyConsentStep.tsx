"use client";

/**
 * The per-survey consent step (migration 0053). Shown before a survey's link
 * and QR code appear — "you can't send what isn't consented".
 *
 * Every consent request carries "Why consent?" in full; picking a country
 * shows that country's row from the reference, with a warning for high-care
 * countries and a required local-advice reference for blocked ones (the
 * database enforces the same rules). Age groups come from the instrument.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { instrument } from "@/lib/instrument";
import {
  PARENTAL_CONSENT_METHODS,
  SURVEY_CONSENT_STATEMENT_VERSION,
  bandIncludesMinors,
  surveyConsentStatement,
  type ParentalConsentMethod,
} from "@/lib/consent";
import { CARE_LABEL, CONSENT_COUNTRIES } from "@/lib/consentCountries";
import { WhyConsentBlock } from "@/content/consent/ConsentResource";
import { CONSENT_DISCLAIMER, WHY_CONSENT_VERSION } from "@/content/consent/why-consent";

export type SurveyConsentStatus = {
  link_id: string | null;
  name?: string;
  state: "current" | "outdated" | "expired" | "revoked" | "none";
  confirmed_at: string | null;
  confirmed_by: string | null;
  country_codes: string[] | null;
  age_bands: string[] | null;
  includes_minors: boolean | null;
  parental_consent_method: ParentalConsentMethod | null;
};

/** Collecting? Current, or an older statement still inside its grace period. */
export const consentOpen = (s?: SurveyConsentStatus | null) => s?.state === "current" || s?.state === "outdated";

const bandOptions = () =>
  (instrument.items.find((i) => i.key === "age_band")?.options ?? [])
    .filter((o) => !(o as { ends_survey?: boolean }).ends_survey)
    .map((o) => ({ value: String(o.value), label: o.text.en ?? String(o.value) }));

export default function SurveyConsentStep({
  sb,
  orgSlug,
  linkId,
  surveyName,
  existing,
  onDone,
  onCancel,
}: {
  sb: SupabaseClient;
  orgSlug: string;
  linkId: string | null;
  surveyName: string;
  existing?: SurveyConsentStatus | null;
  onDone: (s: SurveyConsentStatus) => void;
  onCancel: () => void;
}) {
  const bands = useMemo(bandOptions, []);
  const [countries, setCountries] = useState<string[]>(existing?.country_codes?.filter((c) => !c.startsWith("OTHER:")) ?? []);
  const [other, setOther] = useState(existing?.country_codes?.find((c) => c.startsWith("OTHER:"))?.slice(6) ?? "");
  // Prefill from the last confirmation, keeping only bands the active instrument still offers.
  const [ages, setAges] = useState<string[]>(
    existing?.age_bands?.filter((a) => bands.some((b) => b.value === a)) ?? bands.map((b) => b.value),
  );
  const [method, setMethod] = useState<ParentalConsentMethod | "">(existing?.parental_consent_method ?? "");
  const [ethics, setEthics] = useState("");
  const [advice, setAdvice] = useState("");
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const minors = ages.some(bandIncludesMinors);
  const effMethod: ParentalConsentMethod | "" = minors ? (method === "not_applicable_adults_only" ? "" : method) : "not_applicable_adults_only";
  const picked = CONSENT_COUNTRIES.filter((c) => countries.includes(c.country_code));
  const blocked = picked.filter((c) => c.care_level === "block_until_advice");
  const codes = [...countries, ...(other.trim() ? [`OTHER:${other.trim()}`] : [])];
  const ready = codes.length > 0 && ages.length > 0 && effMethod !== "" && (blocked.length === 0 || advice.trim()) && ticked;

  const statement = surveyConsentStatement({
    countries: [...picked.map((c) => c.country), ...(other.trim() ? [other.trim()] : [])],
    ageBands: bands.filter((b) => ages.includes(b.value)).map((b) => b.label),
    method: effMethod || null,
    ethicsReference: ethics.trim() || null,
    localAdviceReference: advice.trim() || null,
  });

  const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  async function submit() {
    setBusy(true);
    setErr(null);
    const { data, error } = await sb.rpc("confirm_survey_consent", {
      p_org_slug: orgSlug,
      p_link_id: linkId,
      p_country_codes: codes,
      p_age_bands: ages,
      p_parental_consent_method: effMethod,
      p_ethics_reference: ethics.trim() || null,
      p_local_advice_reference: advice.trim() || null,
      p_statement_version: SURVEY_CONSENT_STATEMENT_VERSION,
      p_why_consent_version: WHY_CONSENT_VERSION,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone(data as SurveyConsentStatus);
  }

  const lbl = "block text-[12px] font-semibold uppercase tracking-wider text-ink-2";
  return (
    <div className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto text-left">
      <div>
        <p className="figcap">Consent for this survey</p>
        <h2 className="mt-1 text-[20px] font-bold">{surveyName}</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">Its link and QR code appear once this is confirmed.</p>
      </div>

      <WhyConsentBlock compact />
      <p className="text-[13px] text-ink-2">
        <Link href="/resources/consent" target="_blank" className="font-semibold text-ink underline underline-offset-2">
          Read the full consent resource
        </Link>{" "}
        — the parent letter, the script, and the rules country by country.
      </p>

      <fieldset>
        <legend className={lbl}>Where will this survey run?</legend>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {CONSENT_COUNTRIES.map((c) => (
            <label key={c.country_code} className="flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" checked={countries.includes(c.country_code)} onChange={() => setCountries(toggle(countries, c.country_code))} />
              {c.country}
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-[13.5px]">
          Another country:
          <input value={other} onChange={(e) => setOther(e.target.value)} className="rounded-md border border-rule-2 px-2 py-1 text-[13.5px]" aria-label="Another country" />
        </label>
        {picked.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {picked.map((c) => (
              <li
                key={c.country_code}
                className="rounded-lg border px-3 py-2 text-[12.5px] leading-snug text-ink-2"
                style={{ borderColor: c.care_level === "standard" ? "rgb(var(--c-rule))" : c.care_level === "care" ? "rgb(var(--c-amber))" : "rgb(var(--c-vermillion))" }}
              >
                <b className="text-ink">{c.country}</b> · {CARE_LABEL[c.care_level]}
                <br />
                Parent/guardian consent needed under {c.parental_consent_note}. Faith answers: {c.faith_data}. {c.summary}
              </li>
            ))}
            <li className="text-[11.5px] text-muted">{CONSENT_DISCLAIMER.split(".")[0]}. Individual country laws may differ.</li>
          </ul>
        )}
        {other.trim() && (
          <p className="mt-2 text-[12.5px] text-ink-2">
            {other.trim()} isn&apos;t in our reference yet — check its law before you send, and take local advice if unsure.
          </p>
        )}
        {blocked.length > 0 && (
          <label className="mt-3 block">
            <span className={lbl}>Local legal advice — required for {blocked.map((b) => b.country).join(", ")}</span>
            <input value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Who advised you, and when"
              className="mt-1 w-full rounded-md border border-rule-2 px-2 py-1.5 text-[13.5px]" />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend className={lbl}>Who is invited?</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {bands.map((b) => (
            <label key={b.value} className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={ages.includes(b.value)} onChange={() => setAges(toggle(ages, b.value))} />
              {b.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-muted">Anyone who picks an age group you haven&apos;t invited is stopped politely, and nothing is kept.</p>
      </fieldset>

      <label className="block">
        <span className={lbl}>How was parental consent gathered?</span>
        {minors ? (
          <select value={effMethod} onChange={(e) => setMethod(e.target.value as ParentalConsentMethod)}
            className="mt-1 w-full rounded-md border border-rule-2 px-2 py-1.5 text-[14px]">
            <option value="">Choose…</option>
            {PARENTAL_CONSENT_METHODS.filter((m) => m.value !== "not_applicable_adults_only").map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        ) : (
          <span className="mt-1 block text-[13.5px] text-ink-2">Not needed — this survey invites adults (18+) only.</span>
        )}
      </label>

      <label className="block">
        <span className={lbl}>Ethics approval reference (optional)</span>
        <input value={ethics} onChange={(e) => setEthics(e.target.value)} placeholder="e.g. a review board approval number"
          className="mt-1 w-full rounded-md border border-rule-2 px-2 py-1.5 text-[13.5px]" />
      </label>

      <div className="rounded-lg border border-rule bg-paper-deep px-4 py-3">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">You confirm · version {SURVEY_CONSENT_STATEMENT_VERSION}</p>
        <ul className="mt-2 list-disc pl-5 text-[13.5px] leading-relaxed text-ink">
          {statement.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>

      <label className="flex items-start gap-2.5 text-[14px] font-semibold leading-snug">
        <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none" />
        I&apos;ve read “Why consent?” and confirm the above for this survey.
      </label>
      {err && <p className="text-[13px] text-vermillion">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={!ready || busy}
          className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper disabled:opacity-40">
          {busy ? "Confirming…" : "Confirm consent for this survey"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-rule-2 px-4 py-2.5 text-[14px] font-semibold text-ink-2">
          Not now
        </button>
      </div>
      <p className="text-[12px] text-muted">Your name and the time are recorded, with the Why consent? version ({WHY_CONSENT_VERSION}).</p>
    </div>
  );
}
