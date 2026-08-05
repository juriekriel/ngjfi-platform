import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import PrototypeBanner from "@/components/PrototypeBanner";

/**
 * Three voices, bound once. Self-hosted by next/font — no webfont CDN round
 * trip, which is the difference between usable and unusable on a mid-range
 * Android over 3G at a camp.
 */
const serif = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});
const ui = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "The Jesus Index — a global measure of Jesus-following",
  description:
    "One instrument any organisation can run as their own, so the whole movement finally reads the same scoreboard. Built by the Next Gen Global Collab on the road to 2033.",
  // Prototype running on synthetic data: keep it out of search results until the
  // first real field wave replaces the seed. Remove alongside <PrototypeBanner />.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} ${ui.variable}`}>
      <body>
        <PrototypeBanner />
        {children}
      </body>
    </html>
  );
}
