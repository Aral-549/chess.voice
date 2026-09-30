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
  title: "chess.voice — tournament chess played entirely by voice",
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
      <body className="antialiased h-full">
        {children}

        {/* ── Screen-reader live regions ──────────────────────────────────
            `lib/announce.ts` looks these up by id with getElementById and
            silently does nothing when they are absent — which is exactly what
            happened: they existed in no file, so all 20 announce() call sites
            were no-ops and the app announced nothing at all to a screen
            reader. In an app built for blind players that is the whole
            product. See BUGLOG 2026-09-23.

            They live in the root layout, not in a component, so that they are
            in the DOM before anything can try to announce into them, and
            survive every re-render and route change. Two regions because
            polite and assertive must not share one node: writing an urgent
            message into a polite region does not make it urgent, and
            alternating priorities in one node makes announcements collide. */}
        <div
          id="sr-polite"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />
        <div
          id="sr-assertive"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
        />
      </body>
    </html>
  );
}
