import type { MetadataRoute } from "next";

/**
 * The web app manifest — Next's metadata-route convention, served at
 * /manifest.webmanifest automatically (no <link> tag needed in layout.tsx).
 *
 * This is the icon/installability piece of the PWA checklist (CLAUDE.md §4):
 * the icon set itself (public/icons/*.png, generated from public/icon-mark.svg
 * — see that file for the source). The rest of the PWA layer — service
 * worker, offline shell, offline-tolerant submission queue — is still open
 * and deliberately NOT implied by this file alone.
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
