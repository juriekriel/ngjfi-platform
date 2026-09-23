import IntelligenceEntry from "@/components/index/IntelligenceEntry";

export const metadata = {
  title: "Collab Intelligence — The Jesus Index",
  description:
    "The crowdsourced picture across every participating organisation. Live space only — no synthetic data has ever been in it.",
};

/**
 * The published view. Reads the LIVE data space, which the database enforces:
 * `collab_intelligence()` filters demo organisations inside its own body, so no
 * caller can accidentally include them. It stays honestly empty until the
 * critical-mass gate is passed.
 *
 * Signed-in organisation members see it as the second tab of their
 * dashboard (same frame, same controls); everyone else sees the public page.
 * See IntelligenceEntry.
 */
export default function IntelligencePage() {
  return <IntelligenceEntry />;
}
