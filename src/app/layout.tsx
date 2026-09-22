import type { Metadata } from "next";
import { Newsreader, Inter_Tight } from "next/font/google";
import "./globals.css";

/**
 * Two voices, bound once. Self-hosted by next/font — no webfont CDN round
 * trip, which is the difference between usable and unusable on a mid-range
 * Android over 3G at a camp.
 *
 * Inter Tight is the workhorse: every sentence, every control, and now every
 * number and caption too. Newsreader is loaded for exactly one use — the
 * ".wordmark" lockup in the masthead/logo and the homepage title — never a
 * second voice for general text, a caption, or a data label. JetBrains Mono
 * is gone: it was a third voice with no job the grotesk couldn't do, and its
 * uppercase-tracked treatment kept leaking onto controls it was never meant
 * for (see CLAUDE.md §8). `--font-mono` now simply points at Inter Tight so
 * every existing `.tabular`/`font-mono` class keeps working without a sweep
 * of every call site — see globals.css.
 */
const serif = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});
const ui = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Jesus Index — a global measure of Jesus-following",
  description:
    "One instrument any organisation can run as their own, so the whole movement finally reads the same scoreboard. Built by the Next Gen Global Collab on the road to 2033.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
