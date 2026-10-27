import type { Metadata } from "next";

/** The production origin. layout.tsx's metadataBase resolves paths against it. */
export const SITE_URL = "https://wsl-analytics.vercel.app";
export const SITE_NAME = "Swell Analytics";

/**
 * Canonical URL and og:url for one page, as a path. Spread into a page's
 * metadata. Next replaces (does not merge) `openGraph` per segment, so the
 * site name and type are restated here rather than set once in the layout.
 */
export function pageMeta(path: string, type: "website" | "profile" | "article" = "website"): Metadata {
  return {
    alternates: { canonical: path },
    openGraph: { url: path, type, siteName: SITE_NAME, locale: "en_GB" },
  };
}
