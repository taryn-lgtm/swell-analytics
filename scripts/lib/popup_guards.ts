// =====================================================================
// popup_guards.ts — attribution guards for Tier 2 popup capture
// =====================================================================
//
// On 17 August 2026 the popup collector's first bulk run misattributed 2 of 3
// captures. It clicked a heat's Details link, then waited on a selector that
// the PREVIOUS popup already satisfied, and serialised the old DOM under the
// new heat's filename. Every existing check passed: the popup was complete, it
// carried wave scores, the sha256 was a true hash of the bytes, and the sidecar
// was well formed. The popup is client-rendered with no per-heat URL, so the
// filename was the only attribution and the filename was wrong.
//
// docs/findings/2026-08-17_tier2_popup_misattribution.md
//
// TWO GUARDS, DELIBERATELY INDEPENDENT
//
//   (a) the captured DOM must name the heat it is being filed as
//   (b) the capture must not be byte-identical to the one before it
//
// Either alone would have caught the 105130 capture. (b) does not depend on
// knowing the id format and catches a stale capture even if WSL stops putting
// heatId in the markup; (a) catches a stale capture that happens to differ by a
// timestamp or an ad slot and so is not byte-identical. This class of failure is
// silent by construction, so it gets belt and braces.
//
// These functions are the ones the collector calls. Controls import THESE, not
// a reimplementation — docs/sources/controls.json records why: athleteBlockCount
// once had its own regex, and its control passed while the function was broken.

/** How many times the popup names this heat via a heatId reference. */
export function heatIdMentions(html: string, heatId: string): number {
  const escaped = heatId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...html.matchAll(new RegExp(`heatId=${escaped}\\b`, "g"))].length;
}

/**
 * Guard (a). Returns null if the capture names its heat, or the reason it does
 * not. A capture that never mentions its own heat id is another heat's popup.
 */
export function attributionFailure(html: string, heatId: string): string | null {
  const mentions = heatIdMentions(html, heatId);
  if (mentions > 0) return null;
  const seen = [...new Set([...html.matchAll(/heatId=(\d+)/g)].map((m) => m[1]))];
  return (
    `capture does not name heat ${heatId} anywhere (0 heatId=${heatId} references). ` +
    (seen.length > 0
      ? `It names ${seen.join(", ")} instead — this is another heat's popup, ` +
        `serialised before the clicked one rendered.`
      : `It names no heat at all.`)
  );
}

/**
 * Guard (b). Returns null if this capture differs from the previous one, or the
 * reason it does not. Two heats cannot serialise to identical bytes.
 */
export function duplicateFailure(
  sha: string,
  heatId: string,
  previous: { sha: string; heatId: string } | null,
): string | null {
  if (previous === null || previous.sha !== sha) return null;
  return (
    `capture is byte-identical to the previous one (heat ${previous.heatId}, ` +
    `sha256 ${sha.slice(0, 16)}…). Two different heats cannot produce the same ` +
    `bytes; the popup had not changed when this was serialised.`
  );
}
