import type { Metadata } from "next";
import "./globals.css";
import PrototypeBanner from "@/components/PrototypeBanner";

export const metadata: Metadata = {
  title: "The Index — Next Gen Jesus-Following Index",
  description:
    "A shared, crowdsourced measure of whether young people are following Jesus — on the road to 2033.",
  // Prototype running on synthetic data: keep it out of search results until the
  // 2027 baseline replaces the seed. Remove alongside <PrototypeBanner />.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PrototypeBanner />
        {children}
      </body>
    </html>
  );
}
