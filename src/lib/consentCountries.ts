/**
 * The consent reference (src/data/consent-countries.json) — every UN member
 * state plus Vatican City, Palestine, Taiwan, Kosovo, Hong Kong, Macau and
 * Puerto Rico. The single source for the consent resource page, the
 * per-survey consent step, the admin consent register, and the
 * consent_country_rules seed (migrations 0053 + 0058; a test keeps them
 * identical). Reference only, never legal advice.
 *
 * Rows carry the reference_version they were written under: 2026-10-v1 (the
 * original 21, researched for the pilots) or 2026-10-v2 (a first-pass desk
 * reference for every other country, prepared for counsel review). Surfaces
 * show v2 rows as "first pass" so nobody mistakes them for checked advice.
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
export const FIRST_PASS_NOTE = data.first_pass_note;

/** Countries in alphabetical order — for pickers and the reference table. */
export const CONSENT_COUNTRIES_SORTED = [...CONSENT_COUNTRIES].sort((a, b) => a.country.localeCompare(b.country, "en"));

/** The reference version of the original, pilot-researched rows. */
const CHECKED_VERSION = "2026-10-v1";
/** A first-pass row: written for counsel review, not yet checked. */
export const isFirstPass = (c: CountryRule) => c.reference_version !== CHECKED_VERSION;

export const CARE_LABEL: Record<CareLevel, string> = {
  standard: "Standard",
  care: "Extra care",
  high: "High risk — local advice strongly recommended",
  block_until_advice: "Blocked until local legal advice is recorded",
};

/** Severity order, for sorting and filters. */
export const CARE_ORDER: CareLevel[] = ["block_until_advice", "high", "care", "standard"];

/**
 * Countries where a parent's consent may be needed past 17 — so the platform
 * minimum (a parent's consent for every 13–17-year-old) does NOT cover them
 * on its own. Read from the data, never listed by hand.
 */
export const CONSENT_PAST_17 = CONSENT_COUNTRIES.filter((c) => c.parental_consent_under > 18);

/** Countries a consent step should warn about, or refuse without advice. */
export function careFor(codes: string[]): { warn: CountryRule[]; block: CountryRule[] } {
  const rules = CONSENT_COUNTRIES.filter((c) => codes.includes(c.country_code));
  return {
    warn: rules.filter((r) => r.care_level === "high"),
    block: rules.filter((r) => r.care_level === "block_until_advice"),
  };
}
