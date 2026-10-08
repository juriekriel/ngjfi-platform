/**
 * The edge-consent statement an organisation confirms before it can collect
 * real responses (migration 0042).
 *
 * The version string must match platform_settings.consent_statement_version:
 * the database refuses an attestation to any other version, so wording and
 * version always change together. Bump BOTH when the wording changes, in the
 * same PR as a migration that updates the setting.
 *
 * DRAFT — for review by counsel and the Collab before pilots.
 */
export const CONSENT_STATEMENT_VERSION = "2026-10-v1";

export const CONSENT_STATEMENT: string[] = [
  "We have obtained the consent our context requires before anyone takes this survey — including a parent's or guardian's consent for 13-to-17-year-olds wherever our law, denomination or safeguarding policy requires it.",
  "We will only share our survey links with people aged 13 or over.",
  "We will keep any consent records ourselves. We will not send them to the Index, and the Index will never ask for them.",
  "We understand that the Index stores answers anonymously and shows us grouped results only, never an individual's answers.",
];

/**
 * The PER-SURVEY consent statement (migration 0053): confirmed for every
 * survey sent — the organisation's default link and every room link — with
 * the details below. Same rule as above: bump the version with the wording,
 * together with platform_settings.survey_consent_statement_version.
 *
 * DRAFT — for review by counsel and the Collab before pilots.
 */
export const SURVEY_CONSENT_STATEMENT_VERSION = "2026-10-v1";

export const PARENTAL_CONSENT_METHODS = [
  { value: "written_form", label: "Signed written form" },
  { value: "verified_email", label: "Verified email from a parent or guardian" },
  { value: "other_documented", label: "Another documented method" },
  { value: "not_applicable_adults_only", label: "Not needed — this survey invites adults (18+) only" },
] as const;
export type ParentalConsentMethod = (typeof PARENTAL_CONSENT_METHODS)[number]["value"];

export type SurveyConsentDetails = {
  countries: string[];
  ageBands: string[];
  method: ParentalConsentMethod | null;
  ethicsReference?: string | null;
  localAdviceReference?: string | null;
};

const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The survey statement, filled with this survey's details (placeholders when blank). */
export function surveyConsentStatement(d: SurveyConsentDetails): string[] {
  const method = PARENTAL_CONSENT_METHODS.find((m) => m.value === d.method);
  const lines = [
    `This survey will run in ${d.countries.length ? list(d.countries) : "[countries]"} and invites ${d.ageBands.length ? list(d.ageBands) : "[age groups]"}.`,
    d.method === "not_applicable_adults_only"
      ? "This survey is for adults only; anyone who says they are under 18 is stopped and nothing is kept."
      : `For anyone under 18, we have the parent's or guardian's consent our context requires, gathered by ${method ? method.label.toLowerCase() : "[method]"}, before they take part.`,
    "The young people will be told that taking part is voluntary and anonymous, and that they can skip any question or stop at any time.",
    "We have read “Why consent?” and the country reference for these countries, and have taken local advice where it is required.",
  ];
  if (d.ethicsReference) lines.push(`Ethics approval: ${d.ethicsReference}.`);
  if (d.localAdviceReference) lines.push(`Local legal advice: ${d.localAdviceReference}.`);
  return lines;
}
