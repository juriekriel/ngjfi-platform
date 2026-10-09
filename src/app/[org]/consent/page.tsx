import OrgConsent from "./OrgConsent";

export const metadata = {
  title: "Consent",
  description: "Why consent matters, how it works, and the materials to run the survey well.",
};

/** /<short_name>/consent — the consent resource in the organisation's own branding. */
export default function OrgConsentPage({ params }: { params: { org: string } }) {
  return <OrgConsent slug={params.org} />;
}
