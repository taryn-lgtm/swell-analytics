// =====================================================================
// parse_popup.ts — read a retained Tier 2 heat-details popup
// =====================================================================
//
// Reads retained artefacts from disk. Never fetches. No network code.
//
// WHAT THE POPUP CARRIES THAT TIER 1 DOES NOT
//
//   Every ride, in chronological order, attributed to a surfer, with the
//   counting pair marked — plus the heat's conditions. That is M1 item 5
//   and both Datum inputs, and it exists nowhere else on the site.
//
// WHY THIS MODULE EXISTS SEPARATELY FROM parse_results.ts
//
//   It does not duplicate it. `parseAthletes` already reads the popup's
//   athlete blocks correctly — verified 19 August, 2 of 2 athletes with
//   names, country, heat total, placing, ride count and counting pair —
//   because the popup renders the SAME `hot-heat-athlete` markup as the
//   results page, `id="hot-heat-athlete--<heat>-<athlete>"` and all. So
//   this module imports it and adds only the two things the popup has
//   and the results page has not: the wave grid and the stat bar.
//
// THE WAVE GRID, AND THE TRAP IN IT
//
//   Rides are NOT grouped by surfer. They are laid out as a Flickity
//   carousel of COLUMNS, one column per ride ordinal:
//
//     .wave-item                      <- column, one per ride number
//       .wave-number      "7"         <- the chronological ordinal
//       .wave  [.wave--counted]       <- slot for athlete index 1
//         .wave-score     "4.00"
//       .wave  [.wave--empty]         <- slot for athlete index 2
//
//   A surfer's rides are read DOWN a fixed slot position across columns,
//   not along a row. `.wave--empty` holds the slot open when a surfer has
//   no ride at that ordinal, and that is the only thing keeping the
//   columns aligned. So:
//
//     - slot position within a column IS the athlete index (1-based)
//     - empties must be counted for position and skipped for output
//     - a column whose slot count differs from the athlete count means
//       the alignment assumption has failed, and this module STOPS
//
//   Getting that wrong produces the exact failure CLAUDE.md trap 13
//   describes for the Replay link's `wave_scores` array: scores that are
//   real, in the right heat, attributed to the wrong surfer. No error, no
//   count mismatch, numbers that still look like surf scores.
//
// WAVE ORDER IS CHRONOLOGICAL HERE, AND THAT IS THE POINT
//
//   `waves.wave_order` is NOT NULL and means ride order. Tier 1's counting
//   pair is ordered by SCORE (Dora's 4.53 + 4.00 are rides 7 and 5), which
//   is why ingest_event.ts deliberately writes no waves and opens a
//   data_gaps row instead — trap 15. `.wave-number` is the real ordinal,
//   so rides parsed here can be written to `waves` as they stand.
//
// THE SOURCE CHECKS ITSELF, SO WE MAKE IT
//
//   The popup publishes four things that are arithmetic consequences of
//   the ride grid: total ride count, each surfer's ride count, each
//   surfer's counting pair and heat total, and the heat's average score.
//   Every one is recomputed here from the rides and compared. A parser
//   that mis-attributes a column fails at least one of them.
//
//   These are not assertions about surfing. They are the source being held
//   to its own arithmetic — the cheapest positive control there is,
//   because it needs no expected value written down by hand.
//
// NOT READ HERE, AND WHY
//
//   `data-tooltip` on each ride carries `waveId=<n>` pointing at
//   `/wave-judges-scores?waveId=<n>`. The id is captured because it is a
//   stable per-ride key from WSL and costs nothing. The judges' scores
//   behind it are NOT fetched: that is a separate endpoint, a separate
//   collection decision, and out of M1. See the finding filed 19 August —
//   `waves`' own column comment currently says judge-by-judge is "NOT
//   published, on current evidence", and this attribute is evidence that
//   wants weighing.
//
// Run the controls: npx tsx scripts/lib/parse_popup.test.ts

import {
  parseAthletes,
  readRetainedHtml,
  stripNonMarkup,
  type AthleteRecord,
} from "./parse_results.ts";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface Ride {
  /** Slot position in the column, 1-based. Equals `hot-heat-athlete--athlete-index-N`. */
  athleteIndex: number;
  wslAthleteId: string;
  /** Chronological ride ordinal, from `.wave-number`. Goes to `waves.wave_order`. */
  waveOrder: number;
  score: number;
  /** `.wave--counted` — one of the two that make the heat total. */
  counted: boolean;
  /** WSL's own ride id from the tooltip URL. `null` if the attribute is absent. */
  wslWaveId: string | null;
}

export interface HeatConditions {
  /** Exactly as published, e.g. `4-6'`. Kept verbatim alongside the parse. */
  waveRangePublished: string | null;
  waveHeightMinFt: number | null;
  waveHeightMaxFt: number | null;
  windConditions: string | null;
  /** WSL's own "Total waves" figure. Cross-checked against the ride count. */
  publishedWaveCount: number | null;
  /** WSL's own "Avg. heat score". Cross-checked against the heat totals. */
  publishedAvgHeatScore: number | null;
}

export interface PopupCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ParsedPopup {
  slug: string;
  wslHeatId: string | null;
  athletes: AthleteRecord[];
  conditions: HeatConditions;
  rides: Ride[];
  /** The source held to its own arithmetic. Any `ok:false` means do not load. */
  checks: PopupCheck[];
  /** True only if every check passed. */
  consistent: boolean;
}

// ---------------------------------------------------------------------
// Small extractors — local, and deliberately narrow
// ---------------------------------------------------------------------

/** Inner text of the first element carrying `cls` as a whole class token. */
function innerTextOfClass(block: string, cls: string): string | null {
  const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<`, "");
  const m = re.exec(block);
  if (!m) return null;
  const t = m[1].replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
}

/**
 * A score, or null. Never 0 as a stand-in for unreadable — `0.00` is a real
 * WSL score (a ride can be scored zero) and must stay distinguishable from
 * "we could not read this".
 */
function parseScore(raw: string | null): number | null {
  if (raw === null) return null;
  const m = /-?\d+(?:\.\d+)?/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Round to 2dp for comparison against published figures.
 *
 * In integer hundredths, NOT `Math.round(n * 100) / 100` on a float.
 *
 * 2024 event 5 heat 100528: totals 18.40 and 14.87 have a mean of exactly
 * 16.635, which WSL publishes as 16.64. In binary floating point that mean
 * evaluates to 16.634999999999998, so the naive form rounds it DOWN to 16.63
 * and the heat was refused as "the source disagreeing with itself". The source
 * was right; the arithmetic was wrong. Scores are published to 2dp, so summing
 * them as integer hundredths is exact and there is no reason to leave the
 * question to a float.
 */
function r2(n: number): number {
  return Math.round(n * 100 + Number.EPSILON * Math.sign(n) * 100) / 100;
}

/** Exact sum of 2dp values, via integer hundredths. */
function sum2(xs: number[]): number {
  return xs.reduce((t, x) => t + Math.round(x * 100), 0) / 100;
}

/** Exact mean of 2dp values, rounded half-up as WSL publishes it. */
function mean2(xs: number[]): number {
  if (xs.length === 0) return 0;
  const cents = xs.reduce((t, x) => t + Math.round(x * 100), 0);
  return Math.floor(cents / xs.length + 0.5) / 100;
}

// ---------------------------------------------------------------------
// The stat bar — heat conditions
// ---------------------------------------------------------------------

/** What each stat-bar modifier is expected to be labelled. Cross-check only. */
const STAT_LABELS: Record<string, string> = {
  "wave-height": "wave range",
  wind: "wind conditions",
  waves: "total waves",
  "avg-heat-score": "avg. heat score",
};

/**
 * Four labelled stats, read by CLASS MODIFIER — `stat-bar__stat-item--wind` and
 * friends — never by position.
 *
 * Position would silently swap wind for wave range the first time WSL reorders
 * them, and every value is a plausible string, so nothing downstream would
 * notice. The modifier is structural and survives reordering.
 *
 * The items are `<li>`, not `<div>`. This function matched `<div>` on its first
 * draft and returned four nulls against a popup carrying all four stats — a
 * clean example of an instrument's silence being mistakable for the world's.
 * The published-figure cross-checks in `parsePopupMarkup` are what caught it:
 * "published null · parsed 19" is loud, where a missing conditions row would
 * not have been.
 *
 * `labelMismatches` records any stat whose visible label has drifted from the
 * expected wording. Reported, not fatal — the modifier is the handle, the label
 * is the second opinion.
 */
export function parseStatBar(markup: string): HeatConditions & { labelMismatches: string[] } {
  const found = new Map<string, string>();
  const byLabel = new Map<string, string>();
  const labelMismatches: string[] = [];
  const opens = [...markup.matchAll(/<li class="[^"]*\bstat-bar__stat-item\b[^"]*"[^>]*>/g)];

  for (let i = 0; i < opens.length; i++) {
    const start = opens[i].index ?? 0;
    const end = i + 1 < opens.length ? (opens[i + 1].index ?? markup.length) : markup.length;
    const block = markup.slice(start, end);
    const label = innerTextOfClass(block, "label");
    const value = innerTextOfClass(block, "value");
    if (value === null) continue;

    const mod = /stat-bar__stat-item--([a-z-]+)/.exec(opens[i][0]);
    if (mod) {
      found.set(mod[1], value);
      const expect = STAT_LABELS[mod[1]];
      if (expect !== undefined && (label ?? "").toLowerCase() !== expect) {
        labelMismatches.push(`${mod[1]}: expected label "${expect}", found ${JSON.stringify(label)}`);
      }
    }
    if (label !== null) byLabel.set(label.toLowerCase(), value);
  }

  // Modifier first, visible label as the fallback. If WSL drops the modifier
  // the label still gets us there, and the mismatch list says which handle
  // did the work.
  const pick = (mod: string): string | null =>
    found.get(mod) ?? byLabel.get(STAT_LABELS[mod] ?? " ") ?? null;

  const range = pick("wave-height");
  // `4-6'` → 4 and 6. Anything that does not match this shape stays null and
  // the published string is kept, rather than being coerced into a number.
  const rm = range ? /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/.exec(range) : null;

  return {
    waveRangePublished: range,
    waveHeightMinFt: rm ? Number(rm[1]) : null,
    waveHeightMaxFt: rm ? Number(rm[2]) : null,
    windConditions: pick("wind"),
    publishedWaveCount: parseScore(pick("waves")),
    publishedAvgHeatScore: parseScore(pick("avg-heat-score")),
    labelMismatches,
  };
}

// ---------------------------------------------------------------------
// The wave grid
// ---------------------------------------------------------------------

interface Column {
  waveOrder: number | null;
  slots: { score: number | null; counted: boolean; empty: boolean; wslWaveId: string | null }[];
}

/** Columns as the page lays them out, before any attribution is decided. */
export function parseWaveColumns(markup: string): Column[] {
  const opens = [...markup.matchAll(/<div class="wave-item(?:\s[^"]*)?"[^>]*>/g)];
  const cols: Column[] = [];

  for (let i = 0; i < opens.length; i++) {
    const start = opens[i].index ?? 0;
    const end = i + 1 < opens.length ? (opens[i + 1].index ?? markup.length) : markup.length;
    const block = markup.slice(start, end);

    // `wave` as a whole token only. `wave-number`, `wave-score` and
    // `wave-item` all begin with it; matching them too would turn one
    // column into four phantom slots.
    const slotOpens = [...block.matchAll(/<div class="wave(?:\s[^"]*)?"[^>]*>/g)];
    const slots: Column["slots"] = [];

    for (let j = 0; j < slotOpens.length; j++) {
      const s = slotOpens[j].index ?? 0;
      const e = j + 1 < slotOpens.length ? (slotOpens[j + 1].index ?? block.length) : block.length;
      const slot = block.slice(s, e);
      const tag = slotOpens[j][0];
      const idm = /waveId=(\d+)/.exec(tag);
      slots.push({
        score: parseScore(innerTextOfClass(slot, "wave-score")),
        counted: /\bwave--counted\b/.test(tag),
        empty: /\bwave--empty\b/.test(tag),
        wslWaveId: idm ? idm[1] : null,
      });
    }

    cols.push({ waveOrder: parseScore(innerTextOfClass(block, "wave-number")), slots });
  }
  return cols;
}

// ---------------------------------------------------------------------
// Whole popup
// ---------------------------------------------------------------------

/**
 * Athlete ids in slot order, read from `data-athlete-index`.
 *
 * This is NOT `position`. `position` is the placing (who won); index is the
 * render slot (which column row). In heat 105133 deVault is index 1 and
 * place 1, so the two agree and a bug swapping them would be invisible —
 * which is exactly why they are read separately.
 */
export function athleteIdsBySlot(markup: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /<div\s+class="hot-heat-athlete(?:\s[^"]*)?"([^>]*)>/g;
  for (const m of markup.matchAll(re)) {
    const attrs = m[1];
    const id = /data-athlete-id="(\d+)"/.exec(attrs);
    const idx = /data-athlete-index="(\d+)"/.exec(attrs);
    if (id && idx) out.set(Number(idx[1]), id[1]);
  }
  return out;
}

export function parsePopupMarkup(markup: string, slug: string): ParsedPopup {
  const { athletes } = parseAthletes(markup);
  const conditions = parseStatBar(markup);
  const cols = parseWaveColumns(markup);
  const slotIds = athleteIdsBySlot(markup);
  const checks: PopupCheck[] = [];

  const wslHeatId = athletes.length > 0 ? athletes[0].wslHeatId : null;

  // ---- alignment, before anything is attributed ----------------------
  const badCols = cols.filter((c) => c.slots.length !== slotIds.size);
  checks.push({
    name: "every column has one slot per surfer",
    ok: badCols.length === 0 && cols.length > 0 && slotIds.size > 0,
    detail:
      cols.length === 0 || slotIds.size === 0
        ? `nothing to align: ${cols.length} columns, ${slotIds.size} surfers`
        : badCols.length === 0
          ? `${cols.length} columns x ${slotIds.size} slots`
          : `${badCols.length} column(s) have a slot count other than ${slotIds.size}: ` +
            badCols.map((c) => `order ${c.waveOrder} has ${c.slots.length}`).join("; ") +
            ` — slot position no longer identifies the surfer. Rides NOT attributed.`,
  });

  const aligned = badCols.length === 0 && cols.length > 0 && slotIds.size > 0;
  const rides: Ride[] = [];

  if (aligned) {
    for (const c of cols) {
      if (c.waveOrder === null) continue;
      c.slots.forEach((s, j) => {
        const athleteIndex = j + 1;
        const wslAthleteId = slotIds.get(athleteIndex);
        if (s.empty || s.score === null || wslAthleteId === undefined) return;
        rides.push({
          athleteIndex,
          wslAthleteId,
          waveOrder: c.waveOrder as number,
          score: s.score,
          counted: s.counted,
          wslWaveId: s.wslWaveId,
        });
      });
    }
  }

  // ---- the source held to its own arithmetic --------------------------
  const ridesOf = (id: string): Ride[] => rides.filter((r) => r.wslAthleteId === id);

  checks.push({
    name: "published total waves equals rides parsed",
    ok: conditions.publishedWaveCount !== null && conditions.publishedWaveCount === rides.length,
    detail: `published ${conditions.publishedWaveCount} · parsed ${rides.length}`,
  });

  for (const a of athletes) {
    const mine = ridesOf(a.wslAthleteId);
    const counted = mine.filter((r) => r.counted).map((r) => r.score);
    const sum = sum2(counted);

    checks.push({
      name: `${a.shortName ?? a.wslAthleteId}: ride count matches --waves-N`,
      ok: a.rideCount !== null && a.rideCount === mine.length,
      detail: `class says ${a.rideCount} · parsed ${mine.length}`,
    });

    // The counting pair is the best TWO rides — or the only one, if that is all
    // the surfer caught. 2024 event 4 heat 100179: Seth Moniz rode once, scored
    // 5.00, and his heat total is 5.00. Demanding exactly two counted rides
    // refused four legitimate heats across two seasons before this was measured.
    // Rulebook 10.05(c) sets a maximum of two, not a minimum.
    const expectedCounted = Math.min(2, mine.length);
    // An athlete can also ride NOTHING. 2025 event 6 heat 106361: Ryan Callinan
    // is one of three athletes in the Opening Round, takes no wave, and has no
    // published heat total. He is the only such record in 712 retained popups.
    //
    // This is the same lesson as the comment above, one step further down. That
    // one says two counted rides is a maximum, not a minimum; `counted.length > 0`
    // was still demanding a minimum of one. Zero is legitimate.
    //
    // The rideless branch is STRICTER, not looser: it requires the published
    // total to be absent. An athlete who rode nothing but carries a total would
    // be the source disagreeing with itself, and still fails.
    const rodeNothing = mine.length === 0;
    checks.push({
      name: `${a.shortName ?? a.wslAthleteId}: counted rides sum to the heat total`,
      ok: rodeNothing
        ? counted.length === 0 && a.heatTotal === null
        : counted.length === expectedCounted &&
          counted.length > 0 &&
          a.heatTotal !== null &&
          sum === r2(a.heatTotal),
      detail: rodeNothing
        ? `rode nothing; published total ${a.heatTotal === null ? "absent, as it should be" : a.heatTotal}`
        : `${counted.length} counted of ${mine.length} ridden (expected ${expectedCounted}) ` +
          `[${counted.join(" + ")}] = ${sum} · published total ${a.heatTotal}`,
    });

    // The pair also appears as text in the athlete block. Two independent
    // reads of the same fact — the grid and the caption — must agree.
    const pair = a.countedWaves;
    const sameSet =
      pair !== null &&
      counted.length === pair.length &&
      [...counted].sort((x, y) => x - y).join(",") === [...pair].sort((x, y) => x - y).join(",");
    checks.push({
      name: `${a.shortName ?? a.wslAthleteId}: grid pair matches the published caption`,
      // Two empty reads agree. An athlete who rode nothing has no grid pair and
      // no caption; requiring a non-null caption made that a failure.
      ok: rodeNothing ? counted.length === 0 && (pair === null || pair.length === 0) : sameSet,
      detail: `grid [${counted.join(", ")}] · caption [${(pair ?? []).join(", ")}]`,
    });
  }

  // WSL's published average divides by every athlete in the heat and counts an
  // athlete who rode nothing as zero. Measured on 2025 event 6 heat 106361, the
  // only heat in 712 that can tell the two readings apart: published 9.06,
  // (13.83 + 13.34 + 0) / 3 = 9.0567, against 13.585 for the mean over the two
  // who scored. Five other candidate readings were computed and eliminated --
  // mean of all rides, sum over 3, sum over 2, mean of counted rides.
  //
  // The other 711 popups have a total for every athlete, so they agree with both
  // readings and are evidence for neither.
  //
  // An athlete who RODE but carries no total is not zero, it is unmeasurable:
  // the mean goes null and this check fails, as it did before.
  const perAthlete = athletes.map((a) =>
    a.heatTotal !== null ? a.heatTotal : ridesOf(a.wslAthleteId).length === 0 ? 0 : null,
  );
  const totals = perAthlete.filter((t): t is number => t !== null);
  const mean =
    perAthlete.length > 0 && totals.length === perAthlete.length ? mean2(totals) : null;
  // Compared in integer hundredths. `Math.abs(a - b) <= 0.01` is itself a float
  // comparison and returned false on a genuine 0.01 difference.
  checks.push({
    name: "published average heat score matches the mean of the heat totals",
    ok:
      conditions.publishedAvgHeatScore !== null &&
      mean !== null &&
      Math.abs(Math.round(conditions.publishedAvgHeatScore * 100) - Math.round(mean * 100)) <= 1,
    detail: `published ${conditions.publishedAvgHeatScore} · computed ${mean} from ${totals.length} totals`,
  });

  return {
    slug,
    wslHeatId,
    athletes,
    conditions,
    rides,
    checks,
    consistent: checks.every((c) => c.ok),
  };
}

/** Read a retained popup off disk and parse it. Never fetches. */
export function parsePopup(slug: string): ParsedPopup {
  return parsePopupMarkup(stripNonMarkup(readRetainedHtml(slug)), slug);
}
