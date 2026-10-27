/**
 * The WSL Finals Title Match: its format, its series result, and how its heats
 * are labelled. Added 17 October 2026.
 *
 * THE FORMAT IS A PROPERTY OF THE SEASON, AND IT CHANGED.
 *   2024: Rulebook 2024, 1.06(e)(iv): "The Final Match is best of three (3)
 *         heats." John John Florence won it 2-0.
 *   2025: the 2025 results page prints, under the Title Match: "World #1 can
 *         win the World Title by winning Title Match Heat 1. Otherwise, Title
 *         Match is Best-of-3 heats." Yago Dora, world #1, won Heat 1: 1-0.
 *         The 2025 rulebook (1 June 2025 edition) still reads only "best of
 *         three", so the results page is the source for the Heat 1 rule.
 * A season not listed here shows no rule rather than a guessed one.
 *
 * HEAT LABELS. ingest_finals.ts stores the four matches as heat_number 1-4 (one
 * per match) and the Title Match's later heats as 5, 6 -- so every ordering on
 * (round_order, heat_number) walks the series in the order it was surfed. Those
 * numbers are storage, not labels: "Match 2 · heat 2" and "Title Match · heat
 * 5" mean nothing to a reader. On the site a match has no heat number and a
 * Title Match heat is numbered within its series: heat_number - 3.
 */

export const TITLE_MATCH_ROUND_ORDER = 4;

/** The Title Match format for a season, in the words the site shows. */
export const TITLE_MATCH_RULE: Readonly<Record<number, string>> = {
  2024: "best of three",
  2025: "world #1 wins the title by winning Heat 1, otherwise best of three",
};

/**
 * Seasons whose Title Match ends when the world #1 wins Heat 1. In every other
 * season a series needs two heat wins; a "result" with fewer means the data
 * holds only part of the series, and the site says so rather than printing a
 * score the sport never produced ("won 1–0" in a best-of-three).
 */
const HEAT1_RULE_SEASONS: ReadonlySet<number> = new Set([2025]);

function winsNeeded(season: number): number {
  return HEAT1_RULE_SEASONS.has(season) ? 1 : 2;
}

export function isFinals(kind: string | null | undefined): boolean {
  return kind === "wsl_finals";
}

/**
 * The heat number a reader should see. Ordinary events: the stored number.
 * The Finals: null for a match, the position in the series for a Title Match
 * heat.
 */
export function displayHeatNumber(
  kind: string | null | undefined,
  roundOrder: number,
  heatNumber: number | null,
): number | null {
  if (!isFinals(kind)) return heatNumber;
  if (roundOrder !== TITLE_MATCH_ROUND_ORDER || heatNumber == null) return null;
  return heatNumber - (TITLE_MATCH_ROUND_ORDER - 1);
}

/** "John John Florence" -> "J. Florence", as WSL's own series line abbreviates. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts.slice(-1)[0]}`;
}

export interface SeriesResult {
  winnerName: string;
  won: number;
  lost: number;
}

/**
 * The series result from the published placing in each Title Match heat:
 * heats won by each surfer, the one with more is the winner. Returns null if
 * no heat has a published first place or the count is tied.
 */
export function seriesResult(
  heats: { entries: { fullName: string; position: number | null }[] }[],
): SeriesResult | null {
  const wins = new Map<string, number>();
  for (const h of heats) {
    for (const e of h.entries) {
      if (!wins.has(e.fullName)) wins.set(e.fullName, 0);
      if (e.position === 1) wins.set(e.fullName, (wins.get(e.fullName) ?? 0) + 1);
    }
  }
  const ranked = [...wins.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2 || ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return null;
  return { winnerName: ranked[0][0], won: ranked[0][1], lost: ranked[1][1] };
}

/** "best of three · J. Florence won 2–0" -- the rule, then the result. */
export function titleMatchNote(season: number, result: SeriesResult | null): string | null {
  const rule = TITLE_MATCH_RULE[season] ?? null;
  const res = !result
    ? null
    : result.won < winsNeeded(season)
      ? `${result.won + result.lost} heat${result.won + result.lost === 1 ? "" : "s"} of the series held; result incomplete`
      : `${shortName(result.winnerName)} won ${result.won}–${result.lost}`;
  const parts = [rule, res].filter((x): x is string => x !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The same, from one surfer's side of the series: "best of three · won 2–0". */
export function titleMatchNoteFor(season: number, won: number, lost: number): string {
  const rule = TITLE_MATCH_RULE[season] ?? null;
  const res =
    Math.max(won, lost) < winsNeeded(season)
      ? `${won + lost} heat${won + lost === 1 ? "" : "s"} of the series held; result incomplete`
      : `${won > lost ? "won" : "lost"} ${won}–${lost}`;
  return rule ? `${rule} · ${res}` : res;
}
