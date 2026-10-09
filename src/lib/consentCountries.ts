/**
 * The 21-country consent reference (src/data/consent-countries.json) — the
 * single source for the consent resource page, the per-survey consent step,
 * and the consent_country_rules seed in migration 0053 (a test keeps the
 * three identical). Reference only, never legal advice.
 */
import data from "@/data/consent-countries.json";

export type CareLevel = "standard" | "care" | "high" | "block_until_advice";
export type CountryRule = {
  country_code: string;
  country: string;
  care_level: CareLevel;
  parental_consent_under: number;
  main_law: string;
  parental_consent_note: string;
  faith_data: string;
  ethics_review: string;
  data_abroad: string;
  summary: string;
  reference_version: string;
};

export const CONSENT_COUNTRIES = data.countries as CountryRule[];
export const CONSENT_REFERENCE_VERSION = data.version;

export const CARE_LABEL: Record<CareLevel, string> = {
  standard: "Standard",
  care: "Extra care",
  high: "High risk — local advice strongly recommended",
  block_until_advice: "Blocked until local legal advice is recorded",
};

/** Countries a consent step should warn about, or refuse without advice. */
export function careFor(codes: string[]): { warn: CountryRule[]; block: CountryRule[] } {
  const rules = CONSENT_COUNTRIES.filter((c) => codes.includes(c.country_code));
  return {
    warn: rules.filter((r) => r.care_level === "high"),
    block: rules.filter((r) => r.care_level === "block_until_advice"),
  };
}
