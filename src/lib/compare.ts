import type { CompareDataset, CompareHeat } from "@/lib/queries/compare";
import { exactMean, roundHalfUp } from "@/lib/format";

/**
 * Pure comparison arithmetic for `/compare`. No I/O: it runs in the browser
 * over the dataset src/lib/queries/compare.ts ships, and in
 * src/lib/compare.test.ts against hand-checked figures.
 *
 * Two rules the page depends on:
 *   - Heat wins are split by heat size. A 3-surfer heat is harder to win
 *     than a 2-surfer heat, and surfers who reach later rounds surf more
 *     2-surfer heats, so one pooled win rate would compare unlike things.
 *   - Head-to-head is a record ("met 6, ahead in 4"), never a percentage:
 *     of 701 pairs who ever shared a heat, 24 met five or more times.
 */

/** Heat totals are stored at 2 decimals, Datum residuals at 6. */
const TOTAL_DP = 2;
const RESIDUAL_DP = 6;

/** Below this many heats a figure is shown with a small-sample note. */
export const SMALL_SAMPLE_HEATS = 10;
/** Venue rows need at least this many heats from BOTH surfers. */
export const VENUE_MIN_HEATS = 3;

export interface Rate {
  won: number;
  of: number;
  /** Whole-number percentage, half-up; null when `of` is 0. */
  pct: number | null;
}

export interface SurferSummary {
  surferId: number;
  heats: number;
  events: number;
  seasons: number[];
  wins3: Rate;
  wins2: Rate;
  /** Heats carrying a heat total. */
  rated: number;
  meanTotal: number | null;
  bestTotal: number | null;
  /** Heats carrying a Datum residual. */
  withDatum: number;
  meanVsDatum: number | null;
  /** Sample standard deviation of those residuals; null under two heats. */
  sdVsDatum: number | null;
}

export interface Meeting {
  heatId: number;
  eventId: number;
  roundOrder: number;
  roundName: string;
  heatNumber: number | null;
  heatSize: number;
  a: { position: number | null; total: number | null };
  b: { position: number | null; total: number | null };
  /** Who placed higher in the heat; null if either position is missing. */
  ahead: "a" | "b" | null;
}

export interface HeadToHead {
  meetings: Meeting[];
  aAhead: number;
  bAhead: number;
}

export interface VenueRow {
  venueId: number;
  a: { heats: number; meanVsDatum: number | null; withDatum: number };
  b: { heats: number; meanVsDatum: number | null; withDatum: number };
}

export interface PlacingRow {
  eventId: number;
  a: { placing: number | null; status: string | null } | null;
  b: { placing: number | null; status: string | null } | null;
}

function rate(won: number, of: number): Rate {
  return { won, of, pct: of === 0 ? null : roundHalfUp((100 * won) / of, 0) };
}

function seasonOf(ds: CompareDataset): Map<number, number> {
  return new Map(ds.events.map((e) => [e.id, e.seasonYear]));
}

/** One surfer's heats, optionally limited to a season. */
export function heatsFor(ds: CompareDataset, surferId: number, season: number | null): CompareHeat[] {
  const season_ = seasonOf(ds);
  return ds.heats.filter(
    (h) => h.s === surferId && (season == null || season_.get(h.e) === season)
  );
}

export function summarise(ds: CompareDataset, surferId: number, season: number | null): SurferSummary {
  const season_ = seasonOf(ds);
  const hs = heatsFor(ds, surferId, season);
  const totals = hs.map((h) => h.t).filter((v): v is number => v != null);
  const residuals = hs.map((h) => h.r).filter((v): v is number => v != null);
  const three = hs.filter((h) => h.n === 3);
  const two = hs.filter((h) => h.n === 2);
  return {
    surferId,
    heats: hs.length,
    events: new Set(hs.map((h) => h.e)).size,
    seasons: [...new Set(hs.map((h) => season_.get(h.e) as number))].sort((a, b) => a - b),
    wins3: rate(three.filter((h) => h.p === 1).length, three.length),
    wins2: rate(two.filter((h) => h.p === 1).length, two.length),
    rated: totals.length,
    meanTotal: exactMean(totals, TOTAL_DP),
    bestTotal: totals.length ? Math.max(...totals) : null,
    withDatum: residuals.length,
    meanVsDatum: exactMean(residuals, RESIDUAL_DP),
    sdVsDatum: sampleSd(residuals),
  };
}

/** Chronological order: season, event number, round order, heat number. */
function chrono(ds: CompareDataset) {
  const ev = new Map(ds.events.map((e) => [e.id, e]));
  return (x: { eventId: number; roundOrder: number; heatNumber: number | null }) => {
    const e = ev.get(x.eventId);
    return [e?.seasonYear ?? 0, e?.eventNumber ?? 0, x.roundOrder, x.heatNumber ?? 0];
  };
}

export function headToHead(ds: CompareDataset, a: number, b: number, season: number | null): HeadToHead {
  const bByHeat = new Map(heatsFor(ds, b, season).map((h) => [h.h, h]));
  const meetings: Meeting[] = [];
  for (const ha of heatsFor(ds, a, season)) {
    const hb = bByHeat.get(ha.h);
    if (!hb) continue;
    const ahead =
      ha.p == null || hb.p == null || ha.p === hb.p ? null : ha.p < hb.p ? "a" : "b";
    meetings.push({
      heatId: ha.h,
      eventId: ha.e,
      roundOrder: ha.ro,
      roundName: ha.rn,
      heatNumber: ha.hn,
      heatSize: ha.n,
      a: { position: ha.p, total: ha.t },
      b: { position: hb.p, total: hb.t },
      ahead,
    });
  }
  const key = chrono(ds);
  meetings.sort((x, y) => {
    const kx = key(x);
    const ky = key(y);
    for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] - ky[i];
    return 0;
  });
  return {
    meetings,
    aAhead: meetings.filter((m) => m.ahead === "a").length,
    bAhead: meetings.filter((m) => m.ahead === "b").length,
  };
}

/** Venues where BOTH surfers have at least VENUE_MIN_HEATS heats. */
export function venueRows(ds: CompareDataset, a: number, b: number, season: number | null): VenueRow[] {
  const side = (surferId: number) => {
    const m = new Map<number, CompareHeat[]>();
    for (const h of heatsFor(ds, surferId, season)) {
      if (h.v == null) continue; // venue not recorded: counted by the page, not bucketed
      const g = m.get(h.v) ?? [];
      g.push(h);
      m.set(h.v, g);
    }
    return m;
  };
  const stat = (g: CompareHeat[]) => {
    const rs = g.map((h) => h.r).filter((v): v is number => v != null);
    return { heats: g.length, meanVsDatum: exactMean(rs, RESIDUAL_DP), withDatum: rs.length };
  };
  const ma = side(a);
  const mb = side(b);
  const rows: VenueRow[] = [];
  for (const [venueId, ga] of ma) {
    const gb = mb.get(venueId);
    if (!gb || ga.length < VENUE_MIN_HEATS || gb.length < VENUE_MIN_HEATS) continue;
    rows.push({ venueId, a: stat(ga), b: stat(gb) });
  }
  return rows.sort((x, y) => y.a.heats + y.b.heats - (x.a.heats + x.b.heats));
}

/** Regular events in the season where at least one of the two has an entry. */
export function placingRows(ds: CompareDataset, a: number, b: number, season: number | null): PlacingRow[] {
  const find = (s: number, e: number) => {
    const p = ds.placings.find((x) => x.s === s && x.e === e);
    return p ? { placing: p.pl, status: p.st } : null;
  };
  return ds.events
    .filter((e) => e.kind === "regular" && (season == null || e.seasonYear === season))
    .sort((x, y) => x.seasonYear - y.seasonYear || x.eventNumber - y.eventNumber)
    .map((e) => ({ eventId: e.id, a: find(a, e.id), b: find(b, e.id) }))
    .filter((r) => r.a != null || r.b != null);
}

/**
 * The default pair: the two surfers who met most often in the data, ties
 * broken by combined heats. Chosen from rows so the page carries no
 * hand-picked names.
 */
export function defaultPair(ds: CompareDataset): [number, number] | null {
  const byHeat = new Map<number, number[]>();
  for (const h of ds.heats) {
    const g = byHeat.get(h.h) ?? [];
    g.push(h.s);
    byHeat.set(h.h, g);
  }
  const met = new Map<string, number>();
  for (const ids of byHeat.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const [x, y] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        const k = `${x}-${y}`;
        met.set(k, (met.get(k) ?? 0) + 1);
      }
  }
  const heatCount = new Map<number, number>();
  for (const h of ds.heats) heatCount.set(h.s, (heatCount.get(h.s) ?? 0) + 1);
  let best: [number, number] | null = null;
  let bestKey: [number, number] = [-1, -1];
  for (const [k, n] of met) {
    const [x, y] = k.split("-").map(Number);
    const combined = (heatCount.get(x) ?? 0) + (heatCount.get(y) ?? 0);
    if (n > bestKey[0] || (n === bestKey[0] && combined > bestKey[1])) {
      best = [x, y];
      bestKey = [n, combined];
    }
  }
  return best;
}

function sampleSd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Whether two surfers' average-vs-Datum figures can be told apart: the gap
 * against 1.96 times the standard error of the difference (each mean's
 * SE = sd / sqrt(n)). Added for M5 after the WSL-analyst audit, which found
 * /compare presenting a 0.5 gap on about 60 heats each as if it meant
 * something when the noise was about 0.4 per surfer.
 */
export function vsDatumGap(a: SurferSummary, b: SurferSummary): {
  gap: number;
  threshold: number;
  distinguishable: boolean;
} | null {
  if (a.meanVsDatum == null || b.meanVsDatum == null || a.sdVsDatum == null || b.sdVsDatum == null) return null;
  const se = Math.sqrt(a.sdVsDatum ** 2 / a.withDatum + b.sdVsDatum ** 2 / b.withDatum);
  const gap = Math.abs(a.meanVsDatum - b.meanVsDatum);
  const threshold = 1.96 * se;
  return { gap, threshold, distinguishable: gap > threshold };
}
