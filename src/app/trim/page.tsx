import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrimExplainer, { type ExplainerHeat, type ScatterRow } from "@/components/trim/TrimExplainer";
import { getSurferProfile } from "@/lib/queries/surfer";
import { getSeasonRankings } from "@/lib/queries/rankings";
import { getTrimModelRun } from "@/lib/queries/home";

/*
 * `/trim` -- the Trim explainer, ported from the Swell concept
 * (docs/concepts/m4_site/trim.html, added to M4 on 9 October).
 *
 * Every figure on it is read from v2 at render time: one surfer's rated heats
 * (Datum, posted total, gap, Trim after) from the same query the surfer page
 * uses, the decay rate from the latest trim_model_runs row, and the 2025
 * points table for the points-against-Trim chart. The concept embedded an
 * export of these; this page does not.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How Trim works",
  description:
    "Trim measures every Championship Tour heat against what that round normally produces, and keeps a running average that leans on recent heats.",
  ...pageMeta("/trim"),
};

/** The worked example. Chosen in the concept for having the longest 2024-25 record. */
const EXAMPLE_SLUG = "griffin-colapinto";
const SCATTER_SEASON = 2025;

export default async function TrimPage() {
  const [profile, run, rankings] = await Promise.all([
    getSurferProfile(EXAMPLE_SLUG),
    getTrimModelRun(),
    getSeasonRankings(SCATTER_SEASON),
  ]);
  if (!profile || !run) notFound();

  const heats: ExplainerHeat[] = profile.heats
    .filter(
      (h): h is typeof h & { seq: number; expected: number; heatTotal: number; residual: number; trimAfter: number } =>
        h.seq != null && h.expected != null && h.heatTotal != null && h.residual != null && h.trimAfter != null
    )
    .sort((a, b) => a.seq - b.seq)
    .map((h) => ({
      year: h.seasonYear,
      event: h.eventName,
      round: h.roundName,
      datum: h.expected,
      posted: h.heatTotal,
      gap: h.residual,
      trim: h.trimAfter,
    }));

  // Surfers who carry a counting or thrown result at every counted event of
  // the season: the population for which points rank and Trim rank compare.
  const scatter: ScatterRow[] = [];
  if (rankings) {
    const events = rankings.countedEvents.length;
    for (const r of rankings.rows) {
      const results = r.eventsCounted + (r.thrownPoints != null ? 1 : 0);
      if (r.trim && results >= events) scatter.push({ name: r.fullName, points: r.points, trim: r.trim.trim });
    }
  }

  return (
    <TrimExplainer
      surferName={profile.fullName}
      heats={heats}
      alpha={run.alpha}
      scatter={scatter}
      scatterSeason={SCATTER_SEASON}
    />
  );
}
