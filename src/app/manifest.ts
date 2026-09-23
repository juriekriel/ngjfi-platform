import type { MetadataRoute } from "next";

/**
 * The web app manifest — Next's metadata-route convention, served at
 * /manifest.webmanifest automatically (no <link> tag needed in layout.tsx).
 *
 * The platform-wide manifest. Each organisation's survey has its own
 * (src/app/[org]/manifest.webmanifest), so an installed survey opens straight
 * to that organisation. The rest of the PWA layer: public/sw.js (offline
 * shell), src/lib/outbox.ts (answers queued on the phone until there is a
 * signal), src/components/pwa/OfflineShell.tsx (registration + draining).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Jesus Index",
    short_name: "JFINDX",
    description: "A global measure of Jesus-following.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FF7A47",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
