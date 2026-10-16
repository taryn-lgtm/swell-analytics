/**
 * Points-era metadata. Raw points are NOT comparable across these eras
 * (different scales), and season format changes how a title is decided.
 * Anything that shows points across seasons must signal the era.
 */

export type PointsEraId = "2015-17" | "2018" | "2019" | "2021+";

export function pointsEra(seasonYear: number): PointsEraId {
  if (seasonYear <= 2017) return "2015-17";
  if (seasonYear === 2018) return "2018";
  if (seasonYear <= 2020) return "2019";
  return "2021+";
}

export const ERA_NOTES: Record<PointsEraId, string> = {
  "2015-17": "2015–2017 points scale (event win = 10,000; distinct step values below).",
  "2018": "2018 points scale — unique intermediate values (e.g. 1,665 for 17th).",
  "2019": "2019–2020 points scale (win = 10,000, runner-up = 7,800, 33rd = 265).",
  "2021+": "2021-onwards points scale. From 2022 a mid-season cut trims the field.",
};

/** Season format labels, straight from seasons.format. */
export const FORMAT_LABELS: Record<string, string> = {
  cumulative_points: "Season points decide the world title",
  final_five: "Final Five — the world title is decided at the WSL Finals, not by season points",
  cumulative_2026: "Season points decide the world title (best results count; Pipe Masters ×1.5)",
};
