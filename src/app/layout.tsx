import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getResultsThrough, getSeasons, seasonsListLabel } from "@/lib/queries/seasons";
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

/* Archivo carries every figure (scores, Trim, ranks, chart labels) with
   tabular digits on, chosen by Taryn on 16 October 2026 over IBM Plex Mono so
   numbers read as part of the sentence rather than as code. SIL OFL, latin
   subset (includes U+2212, the minus sign Trim deltas use). Plex Mono stays
   for code snippets only. */
const archivo = localFont({
  src: "../fonts/archivo-var-latin.woff2",
  weight: "100 900",
  variable: "--font-archivo",
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
  const [seasons, resultsThrough] = await Promise.all([getSeasons(), getResultsThrough()]);
  const seasonsLabel = seasonsListLabel(seasons);
  return (
    <html
      lang="en"
      className={`h-full ${bricolage.variable} ${fraunces.variable} ${archivo.variable} ${plexMono.variable}`}
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
        {/* First focusable element: keyboard and screen-reader users can jump
            past the nav. Hidden until focused (globals.css .skip-link). */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader seasonsLabel={seasonsLabel} resultsThrough={resultsThrough} />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter seasonsLabel={seasonsLabel} resultsThrough={resultsThrough} />
      </body>
    </html>
  );
}
