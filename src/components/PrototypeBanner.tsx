/**
 * The rule travels with the brand.
 *
 * The Collab's first non-negotiable is "never overclaim". While the platform
 * runs on synthetic seed data, every page that shows a number says so in a way
 * nobody can miss or crop away. Remove this component together with the
 * `robots: noindex` in layout.tsx on the day real field data lands.
 */
export default function PrototypeBanner() {
  return (
    <div className="sticky top-0 z-50 border-b border-rule bg-ink px-4 py-1.5 text-center">
      <p className="tabular text-[10px] uppercase leading-relaxed tracking-[0.14em] text-paper">
        Sample data — synthetic, labelled, never quoted
        <span className="mx-2 text-muted">·</span>
        <span className="text-muted">the Index is in development</span>
      </p>
    </div>
  );
}
