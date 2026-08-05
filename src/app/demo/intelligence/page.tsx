import IntelligenceView from "@/components/index/IntelligenceView";

export const metadata = {
  title: "Collab Intelligence (sandbox) — The Jesus Index",
  description: "The sandbox's global view. Every figure in it is invented.",
  robots: { index: false, follow: false },
};

/**
 * The sandbox's global view. Reads the DEMO space via
 * `collab_intelligence_demo()`, which aggregates the fiction only within itself
 * and can never see a real organisation. Deliberately noindex.
 */
export default function DemoIntelligencePage() {
  return <IntelligenceView space="demo" />;
}
