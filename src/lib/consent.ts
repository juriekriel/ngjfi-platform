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
