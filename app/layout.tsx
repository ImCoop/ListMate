import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ListMate",
  description: "Create listings once and sync marketplace-ready versions fast.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} font-sans`}>
        {isDev ? (
          <div className="sticky top-0 z-50 border-b border-red-700 bg-red-500 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-black">
            Development Mode
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
