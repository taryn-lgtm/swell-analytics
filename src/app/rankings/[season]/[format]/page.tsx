import { pageMeta } from "@/lib/seo";
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

interface Props {
  params: Promise<{ season: string; format: string }>;
}

/* Titled by what the variant shows, so tabs and history tell them apart.
   noindex, canonical to /rankings. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { season, format } = await params;
  const what = [/^\d{4}$/.test(season) ? season : null, format === "cumulative" ? "cumulative points" : "Final Five"]
    .filter(Boolean)
    .join(", ");
  return {
    title: `Rankings ${what}`,
    description:
      "Men's Championship Tour season rankings: cumulative points with the published throwaway excluded, the Final Five in their published order, and each surfer's Trim.",
    robots: { index: false },
    ...pageMeta("/rankings"),
  };
}

export default async function RankingsVariantPage({ params }: Props) {
  const { season, format } = await params;
  return <RankingsView season={season} format={format} />;
}
