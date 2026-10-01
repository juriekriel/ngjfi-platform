import type { Metadata } from "next";

/**
 * View-only share links (migration 0046). The token in the URL is the
 * credential, so the page is kept out of search engines and never sends a
 * Referer (netlify.toml sets the same as response headers, belt and braces).
 */
export const metadata: Metadata = {
  title: "Results · view only",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function ViewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
