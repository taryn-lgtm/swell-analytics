import type { Metadata } from "next";
import RankingsView from "@/components/views/RankingsView";
import { getSeasons } from "@/lib/queries/seasons";

/*
 * The prerendered target of `/rankings?season=…&format=…`. The public URL
 * keeps its query string; next.config.ts rewrites it here. `season` may be
 * "latest" (a format-only query), and an unknown season falls back to the
 * latest inside RankingsView exactly as the query version always did.
 */
export const revalidate = 3600;

const FORMATS = ["final-five", "cumulative"] as const;

export async function generateStaticParams() {
  const seasons = await getSeasons();
  const years = [...seasons.map((s) => String(s.year)), "latest"];
  return years.flatMap((season) => FORMATS.map((format) => ({ season, format })));
}

export const metadata: Metadata = {
  title: "Rankings",
  description:
    "Men's Championship Tour season rankings: cumulative points with the published throwaway excluded, the Final Five in their published order, and each surfer's Trim.",
  robots: { index: false },
};

interface Props {
  params: Promise<{ season: string; format: string }>;
}

export default async function RankingsVariantPage({ params }: Props) {
  const { season, format } = await params;
  return <RankingsView season={season} format={format} />;
}
