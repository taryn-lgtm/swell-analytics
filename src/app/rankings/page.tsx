import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import RankingsView from "@/components/views/RankingsView";

/*
 * `/rankings` with no query: the latest season, Final Five order. Static.
 * Any `?season=` / `?format=` reaches src/app/rankings/[season]/[format]
 * through a rewrite in next.config.ts. See RankingsView for why.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Rankings",
  description:
    "Men's Championship Tour season rankings: cumulative points with the published throwaway excluded, the Final Five in their published order, and each surfer's Trim.",
  ...pageMeta("/rankings"),
};

export default function RankingsPage() {
  return <RankingsView />;
}
