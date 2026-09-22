import type { Metadata } from "next";
import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// globals.css has referenced these three variables since the beginning, but
// nothing ever defined them — so the entire app rendered in the browser's
// default sans. These are the faces it was always asking for.
//
// Public Sans is the body face on purpose: it was designed for US government
// services with legibility as the brief, which is the right pedigree for an
// app whose users include people with low vision. Fraunces carries the display
// voice, and Plex Mono sets chess notation, where a monospaced 1/l/0/O
// distinction actually matters.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const body = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "VoiceChessmate — Accessible Chess Through Conversation",
  description:
    "A conversational chess companion for blind and visually impaired players. Play chess entirely through voice using AssemblyAI's Voice Agent API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${display.variable} ${body.variable} ${mono.variable}`}
    >
      {/* Colours come from the theme tokens in globals.css. The previous
          hardcoded bg-gray-900/text-white fought them, which is why the
          high-contrast and light themes never fully took. */}
      <body className="antialiased h-full">{children}</body>
    </html>
  );
}
