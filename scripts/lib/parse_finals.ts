/**
 * parse_finals.ts — reading the WSL Finals page shape
 *
 * Shared so there is exactly one parser, for the same reason manifest.ts and
 * retain.ts are shared: two copies drift, and the copy that drifts is the one
 * that silently stops checking something. `ingest_finals.ts` and
 * `write_finals_manifest.ts` both need the division call, and it is the single
 * most safety-critical read in this project.
 *
 * THE PAGE CARRIES BOTH DIVISIONS
 *   Eight heat blocks in one document — four men's, four women's. Loading it
 *   without separating them puts the women's Finals into a men's CT database
 *   with real names and plausible scores. That is the failure shape v1 died of.
 *
 *   The discriminator is the full-heat-replay link that immediately PRECEDES
 *   each heat block: `/posts/<id>/…-mens-match-1-…` or `…-womens-…`.
 *
 *   Two other approaches were tried and REJECTED. Recorded so nobody retries:
 *
 *     - `tour_codes` in a nearby GTM blob. Looks right at a ±3000-character
 *       window and is not: the nearest PRECEDING tour code is the page-chrome
 *       value `CT` for all eight heats, 9k–70k characters away. Any window wide
 *       enough to find MCT for a men's heat finds it for a women's one too.
 *     - Athlete names. Circular, and it would pass silently the moment the
 *       page changed order.
 */

/** Match title as rendered, to round_order. The ladder is fixed at four. */
export const MATCH_ORDER: Record<string, number> = {
  "match 1": 1,
  "match 2": 2,
  "match 3": 3,
  "title match": 4,
  "final match": 4,
};

/**
 * Where a surfer finishes when their run ends in each match.
 *
 * Not invented: it is what the ladder forces, and it reproduces the published
 * final rankings top five exactly for both 2024 and 2025 — two seasons, ten
 * positions, from a page unrelated to the rankings page it agrees with.
 */
export const LOSER_FINISHES: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2 };

/** Heat ids in document order. */
export function heatOrder(markup: string): string[] {
  const out: string[] = [];
  for (const m of markup.matchAll(/id="hot-heat-athlete--(\d+)-\d+"/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Division of each heat, from the replay link that precedes its block. */
export function divisionsByHeat(markup: string): Map<string, "mens" | "womens"> {
  const events: { pos: number; kind: "heat" | "mark"; value: string }[] = [];
  for (const m of markup.matchAll(/id="hot-heat-athlete--(\d+)-\d+"/g)) {
    events.push({ pos: m.index ?? 0, kind: "heat", value: m[1] });
  }
  for (const m of markup.matchAll(/\/posts\/\d+\/[a-z0-9-]*-(mens|womens)-[a-z0-9-]*/g)) {
    events.push({ pos: m.index ?? 0, kind: "mark", value: m[1] });
  }
  events.sort((a, b) => a.pos - b.pos);

  const out = new Map<string, "mens" | "womens">();
  let current: "mens" | "womens" | null = null;
  for (const e of events) {
    if (e.kind === "mark") current = e.value as "mens" | "womens";
    else if (current !== null && !out.has(e.value)) out.set(e.value, current);
  }
  return out;
}

/** How many heats the Title Match actually ran, per the replay links. */
export function titleMatchHeats(markup: string, division: "mens" | "womens"): number {
  const links = [
    ...markup.matchAll(
      new RegExp(`/posts/\\d+/[a-z0-9-]*-${division}-title-match([a-z0-9-]*)`, "g"),
    ),
  ].map((m) => m[1]);
  if (links.length === 0) return 0;
  let max = 1;
  for (const tail of links) {
    const m = /-heat-(\d+)/.exec(tail);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Every heat-details popup link on the page, by heat id.
 *
 * Keyed off `data-request-name`, NOT off a class name. WSL uses four different
 * class names for this one link across its page shapes, and the Finals uses one
 * of the three that the original collector did not look for. See the comment on
 * DETAILS_LINK in scripts/collect_heat_popups.ts.
 */
export function popupLinksByHeat(markup: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of markup.matchAll(/<a\b[^>]*data-request-name="postEventWatchHeatDetailsPopup"[^>]*>/g)) {
    const href = /href="([^"]*)"/.exec(a[0])?.[1];
    if (href === undefined) continue;
    const heatId = /[?&]heatId=(\d+)/.exec(href)?.[1];
    if (heatId === undefined) continue;
    if (!out.has(heatId)) out.set(heatId, href);
  }
  return out;
}
