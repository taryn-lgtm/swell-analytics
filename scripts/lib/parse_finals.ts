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

/** One heat of the Title Match series, as the results page publishes it. */
export interface SeriesHeat {
  /** 1-based position in the series: H1, H2, H3. */
  heatNumber: number;
  wslHeatId: string;
  /** Heat total per WSL athlete id, read off the series block. */
  totals: Map<string, number>;
}

/** The Title Match series: every heat the page publishes, and the published result. */
export interface TitleMatchSeries {
  heats: SeriesHeat[];
  /** "J. Florence Wins 2 - 0" as rendered, or null if the page shows none. */
  resultText: string | null;
  /** Heats won, from the result text: [winner, loser]. */
  score: [number, number] | null;
}

/**
 * The Title Match series, added 17 October 2026.
 *
 * The Title Match is a series, not a heat. The results page renders it as ONE
 * block whose Details link names only heat 1, but the block carries every heat's
 * score per surfer (`hot-heat-athlete__score` once per heat, labelled H1, H2,
 * H3), the series result ("Wins 2 - 0"), and one full-heat-replay link per heat
 * whose GTM blob names that heat's id. 2024 men's: heats 102841 and 102842,
 * JJF 15.50 / 18.13 against Italo 15.33 / 16.30, "Wins 2 - 0". Loading only the
 * first pair is how 2024 Title Match Heat 2 stayed out of v2 for two months
 * while the bytes sat on disk.
 *
 * Every heat id comes from a replay link and every score from the block; the
 * two are paired by series position and the counts must agree, or this throws.
 */
export function titleMatchSeries(markup: string, division: "mens" | "womens"): TitleMatchSeries {
  // Replay links in document order: heat number from the slug, heat id from the
  // first heat_ids in the GTM blob that follows the link.
  const byNumber = new Map<number, string>();
  const linkRe = new RegExp(`/posts/\\d+/[a-z0-9-]*-${division}-title-match(-heat-(\\d+))?-[a-z0-9-]*`, "g");
  for (const m of markup.matchAll(linkRe)) {
    const n = m[2] === undefined ? 1 : Number(m[2]);
    const tail = markup.slice(m.index ?? 0, (m.index ?? 0) + 4000);
    const id = /heat_ids(?:&quot;|")\s*:\s*(?:&quot;|")(\d+)/.exec(tail)?.[1];
    if (id === undefined) continue;
    const prev = byNumber.get(n);
    if (prev !== undefined && prev !== id) {
      throw new Error(`title match heat ${n} is linked to two heat ids, ${prev} and ${id}`);
    }
    byNumber.set(n, id);
  }
  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  if (numbers.length === 0) return { heats: [], resultText: null, score: null };
  if (numbers.some((n, i) => n !== i + 1)) {
    throw new Error(`title match replay links are not a contiguous series: heats ${numbers.join(", ")}`);
  }

  // The block: from heat 1's Details-link heat class to the next heat grid cell.
  const firstId = byNumber.get(1)!;
  const start = markup.indexOf(`post-event-watch-heat-grid__heat--heat-id-${firstId}`);
  if (start < 0) throw new Error(`no heat block for title match heat 1 (${firstId})`);
  const nextCell = markup.indexOf("post-event-watch-heat-grid__heat ", start + 10);
  const block = markup.slice(start, nextCell > start ? nextCell : start + 20000);

  const resultText = /hot-heat__status--advance[^>]*>\s*([^<]*?Wins\s+\d+\s*-\s*\d+)\s*</.exec(block)?.[1].trim() ?? null;
  const sm = resultText ? /Wins\s+(\d+)\s*-\s*(\d+)/.exec(resultText) : null;
  const score: [number, number] | null = sm ? [Number(sm[1]), Number(sm[2])] : null;

  const labels = [...block.matchAll(/heat-label">\s*H(\d+)\s*</g)].map((m) => Number(m[1]));
  const athletes = [...block.matchAll(/hot-heat-athlete--athlete-id-(\d+)\b/g)];
  const perAthlete = new Map<string, number[]>();
  for (let i = 0; i < athletes.length; i++) {
    const id = athletes[i][1];
    if (perAthlete.has(id)) continue;
    const from = athletes[i].index ?? 0;
    const to = i + 1 < athletes.length ? (athletes[i + 1].index ?? block.length) : block.length;
    const scores = [...block.slice(from, to).matchAll(/class="hot-heat-athlete__score[^"]*">\s*([\d.]+)\s*</g)].map((m) =>
      Number(m[1]),
    );
    perAthlete.set(id, scores);
  }

  const n = numbers.length;
  for (const [id, s] of perAthlete) {
    if (s.length !== n) {
      throw new Error(`athlete ${id} has ${s.length} title match score(s) against ${n} heat(s) in the replay links`);
    }
  }
  // A one-heat series renders no H labels; any series of two or more must label every heat.
  if (n > 1 && labels.join(",") !== numbers.join(",")) {
    throw new Error(`title match heat labels [${labels.join(", ")}] do not match the replay links [${numbers.join(", ")}]`);
  }
  if (score !== null && score[0] + score[1] !== n) {
    throw new Error(`series result "${resultText}" accounts for ${score[0] + score[1]} heat(s); the page publishes ${n}`);
  }

  const heats: SeriesHeat[] = numbers.map((k) => ({
    heatNumber: k,
    wslHeatId: byNumber.get(k)!,
    totals: new Map([...perAthlete].map(([id, s]) => [id, s[k - 1]])),
  }));
  return { heats, resultText, score };
}
