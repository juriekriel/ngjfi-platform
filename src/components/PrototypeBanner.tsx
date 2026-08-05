/**
 * Sitewide honesty banner.
 *
 * The Collab's first non-negotiable is "never overclaim". While the platform is
 * running on synthetic seed data, every page that shows a number has to say so
 * in a way nobody can miss or screenshot away. Remove this component (and the
 * `robots: noindex` in layout.tsx) on the day real field data lands.
 */
export default function PrototypeBanner() {
  return (
    <div className="sticky top-0 z-50 border-b border-[#c2410c]/25 bg-[#fff4ed] px-4 py-2 text-center">
      <p className="text-[12px] leading-snug text-[#7c2d12]">
        <b className="font-mono text-[10px] uppercase tracking-[0.18em]">Prototype</b>
        <span className="mx-2 text-[#c2410c]/40">|</span>
        Every figure on this site is <b>sample data</b>, generated to test the platform. These are
        not findings and must not be quoted. Real fieldwork begins with the 2027 baseline.
      </p>
    </div>
  );
}
