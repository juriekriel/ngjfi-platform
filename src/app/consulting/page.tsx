import { notFound } from "next/navigation";

export const metadata = {
  title: "The Index — Consulting",
  robots: { index: false, follow: false },
};

/**
 * The Index — Consulting Overview / Prospectus (Phase 2).
 *
 * Reserved architecture only. The route, layout and data shape exist so a
 * later build slots in without a rewrite, but there is nothing here for a
 * visitor to find until `NEXT_PUBLIC_CONSULTING_ENABLED` is explicitly set.
 *
 * Turning this on for real is a product decision (pricing, scope, who it's
 * for) — not something to flip quietly inside a routine deploy.
 */
export default function ConsultingPage() {
  if (process.env.NEXT_PUBLIC_CONSULTING_ENABLED !== "true") {
    notFound();
  }

  return (
    <main style={{ padding: "4rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Consulting overview</h1>
      <p>
        Placeholder for the Phase 2 consulting layer — turning a score into
        changed strategy. Content, pricing and access model to follow.
      </p>
    </main>
  );
}
