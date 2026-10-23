/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Launch readiness (Oct 2026): the site uses no next/image, so the Image
  // Optimization endpoint (/_next/image) is switched off entirely. Several
  // Next.js advisories, including critical ones, live in that endpoint and have
  // no fix on the 14.x line; with it off, there is nothing there to reach.
  // Upgrading to Next 15.5+/16 is the real fix — a post-launch task.
  images: { unoptimized: true },
  // /organization -> /organisation: the route was renamed to match the site's
  // British spelling everywhere else. Keep the old path resolving in case
  // anyone bookmarked or shared it before the rename.
  async redirects() {
    return [
      { source: "/organization", destination: "/organisation", permanent: true },
      // "How did we get here" became "Our story" (Oct 2026), linked from the footer.
      { source: "/history", destination: "/our-story", permanent: true },
      // Round 4 (Oct 2026): the shared PDFs carry the Jesus Index name now.
      // Keep the old file names resolving for links already sent around.
      { source: "/share/JFINDX-two-pager.pdf", destination: "/share/JesusIndex-two-pager.pdf", permanent: true },
      { source: "/share/JFINDX-pitch-and-demo.pdf", destination: "/share/JesusIndex-pitch-and-demo.pdf", permanent: true },
    ];
  },
  // Round 8 (Oct 2026): the leadership pitch, generated from the live
  // instrument (scripts/build-pitch.mjs). beforeFiles so it wins over [org].
  async rewrites() {
    return { beforeFiles: [{ source: "/pitch", destination: "/pitch/index.html" }] };
  },
};

export default nextConfig;
