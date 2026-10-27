import { MINUS, roundHalfUp, withMinus } from "@/lib/format";

/**
 * Trim display rules shared by every route that shows a Trim figure.
 *
 * TRIM_MIN_HEATS is the signed M2 item 5 threshold (decision 42): 16 heats,
 * the point at which a surfer's own record outweighs the starting prior.
 * With the V1 half-life of 15 heats the prior still carries (1 - alpha)^n of
 * the rating after n heats -- 0.500 at 15, 0.477 at 16 -- so 16 is the first
 * heat count where the prior is the minority. It is a DEFAULT FILTER the
 * reader can switch off, never a silent cut: v_trim_current applies no
 * threshold, and every table that shows Trim shows n_heats and prior_weight
 * beside it.
 *
 * It is a constant here rather than a database row because it is a
 * presentation choice, not a model parameter -- trim_model_runs carries the
 * half-life and alpha the number derives from.
 */
export const TRIM_MIN_HEATS = 16;

/*
 * ROUNDING, settled by Taryn 30 September: half away from zero, the
 * roundHalfUp rule in lib/format that the derived means already use.
 * These three used `toFixed`, which resolves an exact tie by binary
 * accident: Liam O'Brien's stored trim_after of 0.435500 (2024 event 6)
 * rendered 0.435 where Postgres's round() gives 0.436, and the independent
 * check of /events/[slug] caught it. Trim columns are stored at six
 * decimals, so an exact tie at the third is a real value, not noise --
 * measured then: 4 trim_after, 4 trim_before, 9 prior_weight, none in
 * v_trim_current.
 */

/** Trim is points per heat on the 0-20 scale; three decimals as docs/trim_v1.html. */
export function formatTrim(trim: number | null | undefined): string {
  if (trim == null || Number.isNaN(trim)) return "—";
  return withMinus(roundHalfUp(trim, 3).toFixed(3));
}

/**
 * Signed Trim delta, three decimals, with the sign always shown. The sign
 * is the raw delta's. The delta is a float subtraction of two six-decimal
 * values, so it is first snapped back to six decimals: without that, an
 * exact tie like 0.0005 arrives as 0.00049999... and rounds the wrong way.
 */
export function formatTrimDelta(delta: number | null | undefined): string {
  if (delta == null || Number.isNaN(delta)) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? MINUS : "±";
  return `${sign}${roundHalfUp(roundHalfUp(Math.abs(delta), 6), 3).toFixed(3)}`;
}

/**
 * Sampling noise on a Trim figure, as a 95% half-width (the "±" shown beside
 * it). Added for M5 after the WSL-analyst audit (17 October 2026): ranks were
 * shown to three decimals on a measure whose noise is several tenths.
 *
 * Trim after n rated heats is sum_i alpha (1 - alpha)^(n - i) r_i, a weighted
 * sum of heat residuals plus (1 - alpha)^n times the prior of zero, which adds
 * no noise. Treating residuals as independent with standard deviation sigma,
 * the variance is sigma^2 alpha^2 (1 - (1 - alpha)^(2n)) / (1 - (1 - alpha)^2).
 * sigma is the run's walk-forward RMSE, the residual spread the model actually
 * faced. This is an approximation (residuals are not perfectly independent
 * and sigma is pooled across surfers), and the copy beside it says so.
 * Long records converge on 1.96 sigma sqrt(alpha / (2 - alpha)), about 0.87.
 */
export function trimHalfWidth95(nHeats: number, alpha: number, sigma: number): number {
  const q = (1 - alpha) ** 2;
  const variance = sigma ** 2 * alpha ** 2 * ((1 - q ** nHeats) / (1 - q));
  return 1.96 * Math.sqrt(variance);
}

/** The ± half-width at two decimals, half-up: "± 0.87". */
export function formatTrimRange(halfWidth: number | null | undefined): string {
  if (halfWidth == null || Number.isNaN(halfWidth)) return "—";
  return `± ${roundHalfUp(halfWidth, 2).toFixed(2)}`;
}

/** Prior weight as a 0-1 share, three decimals (0.144), as docs/trim_v1.html. */
export function formatPriorWeight(w: number | null | undefined): string {
  if (w == null || Number.isNaN(w)) return "—";
  return roundHalfUp(w, 3).toFixed(3);
}

/**
 * PostgREST returns numeric columns as JSON numbers, and the generated
 * types say `number`; this guards the one case where a driver hands back a
 * string so a figure never renders as "NaN" or concatenates.
 */
export function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
