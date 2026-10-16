import type { Metadata } from "next";
import HomeView from "@/components/views/HomeView";

/*
 * `/?all=1` -- the home leaderboard with every surfer. The public URL is
 * `/?all=1`; next.config.ts rewrites it here so the page can be prerendered.
 * Not linked directly, and not indexed, so `/?all=1` stays the one address.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  // absolute: the layout's title template applies to child segments, not to
  // the root page, so without it this variant would title differently from `/`.
  title: { absolute: "Swell Analytics" },
  description:
    "Independent analytics for the WSL men's Championship Tour: every heat scored against what the round expects, with rankings, surfer records and head-to-head comparisons.",
  alternates: { canonical: "/?all=1" },
  robots: { index: false },
};

export default function HomeAllPage() {
  return <HomeView showingAll />;
}
