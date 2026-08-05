import IntelligenceView from "@/components/index/IntelligenceView";

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
 */
export default function IntelligencePage() {
  return <IntelligenceView space="live" />;
}
