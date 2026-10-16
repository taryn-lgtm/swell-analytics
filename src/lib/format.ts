/**
 * Shared display formatting for stats. Domain rules live here so every
 * surface renders them identically:
 *  - DNS (null heat_total / null scores) renders as an em-dash, never 0.
 *  - Points always grouped (54,750), scores always 2dp (16.77).
 */

export const EM_DASH = "—";

export function formatPoints(points: number | null | undefined): string {
  if (points == null) return EM_DASH;
  return points.toLocaleString("en-US");
}

export function formatScore(score: number | null | undefined): string {
  if (score == null) return EM_DASH;
  return score.toFixed(2);
}

/**
 * Rounding for figures this site COMPUTES, as opposed to figures it reads.
 *
 * `toFixed` resolves an exact tie by binary accident rather than by rule.
 * Measured 11 September over the 73 surfer pages: ten surfers' mean heat
 * total lands exactly on a half-cent, and `toFixed(2)` sends SIX of them up
 * and FOUR down -- Kauli Vaast's 14.075 renders 14.07 while Postgres's
 * round() gives 14.08, and Keanu Asing's 7.415 renders 7.42 in agreement.
 * Same value shape, opposite answers, no rule anywhere.
 *
 * A published figure never hits this: heat totals and points are stored at
 * the precision they are shown at, so there is nothing to round. It is only
 * the means and residual averages this project derives that can tie, and
 * this is the rule they use: half away from zero, done on the decimal
 * string so the binary representation cannot cast the deciding vote.
 *
 * `formatTrim`, `formatTrimDelta` and `formatPriorWeight` (lib/trim) use
 * this rule too -- Taryn's decision, 30 September.
 */
export function roundHalfUp(value: number, dp: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // Below 1e-6 (or above 1e21) String() switches to exponent form, and
  // "1e-7" + "e3" is NaN. Nothing that small can decide a tie at dp <= 6.
  if (String(abs).includes("e")) return sign * (Math.round(abs * 10 ** dp) / 10 ** dp);
  return sign * Number(`${Math.round(Number(`${abs}e${dp}`))}e-${dp}`);
}

/**
 * The mean of values stored at `dp` decimals, summed in integer units of
 * 10^-dp so the sum is exact.
 *
 * roundHalfUp can only keep a tie if the tie reaches it. A float sum loses
 * it first: Gabriel Medina's six 1-4' totals average exactly 14.255, but
 * summed as doubles they give 14.254999999999997, which renders 14.25 where
 * Postgres gives 14.26 (found 1 October by scripts/verify_surfers). Summed in
 * hundredths the total is the integer 8553, and 8553 / 600 is the nearest
 * double to 14.255.
 */
export function exactMean(values: number[], dp: number): number | null {
  if (values.length === 0) return null;
  const scale = 10 ** dp;
  const units = values.reduce((acc, v) => acc + Math.round(v * scale), 0);
  return units / (values.length * scale);
}

/** A derived figure at `dp` decimals, rounded by the rule above. */
export function formatDerived(value: number | null | undefined, dp = 2): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  return roundHalfUp(value, dp).toFixed(dp);
}

/** As formatDerived, with the sign always shown (residuals, deltas). */
export function formatDerivedSigned(value: number | null | undefined, dp = 2): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  const r = roundHalfUp(value, dp);
  return `${r >= 0 ? "+" : ""}${r.toFixed(dp)}`;
}

export type ScoreBand = "excellent" | "good" | "normal";

/** CLAUDE.md wave-score thresholds: ≥8 excellent, ≥6 good, else normal. */
export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score == null) return "normal";
  if (score >= 8.0) return "excellent";
  if (score >= 6.0) return "good";
  return "normal";
}

/** Ordinal for placements: 1st, 2nd, 3rd, 5th, 9th… */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
