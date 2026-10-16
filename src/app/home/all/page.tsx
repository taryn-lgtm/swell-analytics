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
  title: { absolute: "Trim leaderboard" },
  description:
    "How far each Championship Tour surfer beats what the round expects of them, heat by heat.",
  alternates: { canonical: "/?all=1" },
  robots: { index: false },
};

export default function HomeAllPage() {
  return <HomeView showingAll />;
}
