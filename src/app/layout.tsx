import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Index — Next Gen Jesus-Following Index",
  description:
    "A shared, crowdsourced measure of whether young people are following Jesus — on the road to 2033.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
