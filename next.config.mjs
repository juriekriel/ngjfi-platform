/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // /organization -> /organisation: the route was renamed to match the site's
  // British spelling everywhere else. Keep the old path resolving in case
  // anyone bookmarked or shared it before the rename.
  async redirects() {
    return [
      { source: "/organization", destination: "/organisation", permanent: true },
    ];
  },
};

export default nextConfig;
