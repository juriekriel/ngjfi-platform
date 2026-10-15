/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
};

export default nextConfig;
