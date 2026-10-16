import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getSeasons, seasonsListLabel } from "@/lib/queries/seasons";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/*
 * Fonts are self-hosted (src/fonts, latin subset) via next/font/local:
 * no compile-time Google Fonts dependency — next/font/google stalled
 * dev-server compiles for minutes on this machine, and self-hosting also
 * removes a build-time network dependency in CI/Vercel.
 */

/* Swell (M4): Bricolage Grotesque for text and headings, Fraunces italic for
   the display titles and names. Both SIL Open Font License, latin subset.
   Fraunces replaced Bodoni Moda on 16 October 2026 at Taryn's choice: Bodoni's
   hairlines vanished in light-on-dark display sizes and broke letters apart. */
const bricolage = localFont({
  src: "../fonts/bricolage-grotesque-var-latin.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
  display: "swap",
});

const fraunces = localFont({
  src: "../fonts/fraunces-italic-var-latin.woff2",
  weight: "400 700",
  style: "italic",
  variable: "--font-fraunces",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/plex-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/plex-mono-500-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plex-mono-600-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

/* The description names no season range: the seasons held are read from the
   database at render time and stated in the chrome. */
export const metadata: Metadata = {
  metadataBase: new URL("https://wsl-analytics.vercel.app"),
  title: {
    default: "Swell Analytics",
    template: "%s · Swell Analytics",
  },
  description:
    "Men's Championship Tour analytics — Trim, the score-for-the-conditions rating, with every figure traced to a published heat.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const seasonsLabel = seasonsListLabel(await getSeasons());
  return (
    <html
      lang="en"
      className={`h-full ${bricolage.variable} ${fraunces.variable} ${plexMono.variable}`}
      // The init script sets data-theme before hydration; React must not
      // treat that as a mismatch.
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint, so a dark-preferring reader never sees a
            flash of the light paper. src/lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-fg antialiased">
        <SiteHeader seasonsLabel={seasonsLabel} />
        <main className="flex-1">{children}</main>
        <SiteFooter seasonsLabel={seasonsLabel} />
      </body>
    </html>
  );
}
