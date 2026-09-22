import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full">
      <body className="antialiased bg-gray-900 text-white h-full">
        {children}
      </body>
    </html>
  );
}

