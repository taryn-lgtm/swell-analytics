import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import HomeView from "@/components/views/HomeView";

/*
 * `/` at the default minimum-heats threshold. Static: the "every surfer"
 * variant (`/?all=1`) is its own prerendered route, src/app/home/all, reached
 * by a rewrite in next.config.ts. See HomeView for why no route reads the
 * query string.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Swell Analytics" },
  description:
    "Independent analytics for the WSL men's Championship Tour: every heat scored against what the round expects, with rankings, surfer records and head-to-head comparisons.",
  ...pageMeta("/"),
};

export default function HomePage() {
  return <HomeView showingAll={false} />;
}
