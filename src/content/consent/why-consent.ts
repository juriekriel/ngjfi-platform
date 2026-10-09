/**
 * "Why consent?" — shown in full with EVERY consent request (the organisation
 * confirmation and every survey sent), and as §0 of the consent resource.
 * Every confirmation stores WHY_CONSENT_VERSION, so we can prove which text
 * was shown. Change the words → bump the version.
 *
 * DRAFT — for review by counsel and the Collab before pilots.
 */
export const WHY_CONSENT_VERSION = "2026-10-v1";

export const WHY_CONSENT = {
  title: "Why we ask you to confirm consent",
  intro:
    "You're inviting young people to answer questions about faith. In most countries, answers about religious belief are protected as sensitive information, and anyone under 18 is protected as a child. That usually means:",
  points: [
    { strong: "a parent or guardian says yes", rest: " before a minor takes part, and the young person agrees too" },
    { strong: "taking part is free and voluntary", rest: ", with no pressure and no reward" },
    { strong: "answers stay private", rest: ", so no one can trace them back to a person" },
  ],
  local:
    "The Index never asks for names, emails or consent forms. That's deliberate: consent is gathered by you, locally, where you know the young people and the law. The platform can't check it for you, so we ask you to confirm it, for your organisation and again for each survey you send.",
  rule: "No consent, no participation. Until you confirm, your survey link can't record answers.",
  countries:
    "Rules differ by country. See the country reference before you send, and check your own law, denomination and safeguarding policy.",
} as const;

export const CONSENT_DISCLAIMER =
  "This is a reference, not legal advice. It summarises our understanding of each country's rules as of October 2026, mostly from law-firm summaries and official sources. Laws change, and individual country laws, regional laws, denominational rules and safeguarding policies may differ from or go beyond what is listed here. Items marked “to confirm” or “assume” were not verified against the law itself. Each organisation remains responsible for meeting the law and policies that apply to it. If in doubt, take local legal advice before you send a survey.";
