import { cache } from "react";
import { db } from "@/lib/db/server";
import { num } from "@/lib/trim";
import type { Tables } from "@/lib/database.types";
import { getTrimCurrent, getTrimModelRun } from "@/lib/queries/home";

/**
 * Data for `/about` -- the page the definition of beta requires:
 * "An about page explaining the methodology honestly, including its limits"
 * (PROJECT_PLAN.md). M3 item 5 names three limits it must state; every one
 * of them is a figure, and every figure here is read from a v2 row.
 *
 * The page holds NO literal number about surfing. That is not stylistic:
 * the three limits are exactly the figures most likely to drift as the
 * database grows, and a hand-typed limit is one that quietly stops being
 * true. `PROJECT_PLAN.md` and `docs/CURRENT_MILESTONE.md` both carry "a
 * mean of 25.4 heats per surfer"; the database says 25.2, because 25.4
 * divides all 1,852 heat entries by 73 surfers while Trim rests on the
 * 1,843 that carry a heat total. This module computes the mean over the
 * rated heats, so the page states the mean of the thing it describes.
 */

export type DatumModelRun = Tables<"datum_model_runs">;

export const getDatumModelRun = cache(async (): Promise<DatumModelRun | null> => {
  const { data, error } = await db
    .from("datum_model_runs")
    .select("*")
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw new Error(`datum_model_runs query failed: ${error.message}`);
  return data[0] ?? null;
});

export interface TrimShape {
  /** Surfers carrying a Trim rating -- v_trim_current applies no threshold. */
  rated: number;
  /** Surfers at or above the display threshold. */
  atThreshold: number;
  /** Surfers below ten heats -- the thin end, stated rather than hidden. */
  belowTen: number;
  /** Mean rated heats per rated surfer. */
  meanHeats: number | null;
  maxHeats: number | null;
  minHeats: number | null;
  /** Rated heats behind the whole model: the sum of the per-surfer counts. */
  totalRatedHeats: number;
}

/**
 * Trim's shape, derived from the rows of `v_trim_current` rather than from
 * a stored summary -- so it cannot disagree with the leaderboard the reader
 * has just looked at.
 */
export const getTrimShape = cache(async (threshold: number): Promise<TrimShape> => {
  const rows = await getTrimCurrent();
  const heats = rows.map((r) => r.nHeats).filter((n): n is number => n != null);
  const total = heats.reduce((a, b) => a + b, 0);
  return {
    rated: rows.length,
    atThreshold: rows.filter((r) => r.nHeats >= threshold).length,
    belowTen: rows.filter((r) => r.nHeats < 10).length,
    meanHeats: heats.length ? total / heats.length : null,
    maxHeats: heats.length ? Math.max(...heats) : null,
    minHeats: heats.length ? Math.min(...heats) : null,
    totalRatedHeats: total,
  };
});

export interface Coverage {
  heats: number;
  heatsWithVenue: number;
  heatsWithAvgScore: number;
  entries: number;
  entriesWithTotal: number;
  waves: number;
  events: number;
  surfers: number;
}

/**
 * Per-figure coverage, each stating its population (DESIGN_BRIEF §4.1(d)).
 * The denominators are what make the numerators readable: "712 of 800" is a
 * disclosure, "712 heats" is a boast. `head: true` transfers no rows.
 */
export const getCoverage = cache(async (): Promise<Coverage> => {
  const [heats, heatsWithVenue, heatsWithAvgScore, entries, entriesWithTotal, waves, events, surfers] =
    await Promise.all([
      db.from("heats").select("*", { count: "exact", head: true }),
      db.from("heats").select("*", { count: "exact", head: true }).not("venue_id", "is", null),
      db
        .from("heats")
        .select("*", { count: "exact", head: true })
        .not("published_avg_heat_score", "is", null),
      db.from("heat_entries").select("*", { count: "exact", head: true }),
      db.from("heat_entries").select("*", { count: "exact", head: true }).not("heat_total", "is", null),
      db.from("waves").select("*", { count: "exact", head: true }),
      db.from("events").select("*", { count: "exact", head: true }),
      db.from("surfers").select("*", { count: "exact", head: true }),
    ]);

  for (const r of [heats, heatsWithVenue, heatsWithAvgScore, entries, entriesWithTotal, waves, events, surfers]) {
    if (r.error) throw new Error(`coverage count failed: ${r.error.message}`);
  }

  return {
    heats: heats.count ?? 0,
    heatsWithVenue: heatsWithVenue.count ?? 0,
    heatsWithAvgScore: heatsWithAvgScore.count ?? 0,
    entries: entries.count ?? 0,
    entriesWithTotal: entriesWithTotal.count ?? 0,
    waves: waves.count ?? 0,
    events: events.count ?? 0,
    surfers: surfers.count ?? 0,
  };
});

export interface AboutData {
  trim: TrimShape;
  trimRun: Awaited<ReturnType<typeof getTrimModelRun>>;
  datumRun: DatumModelRun | null;
  coverage: Coverage;
  /** (1 - alpha)^n: the prior's remaining share after n heats, from the stored alpha. */
  priorShareAfter: (n: number) => number | null;
}

export const getAboutData = cache(async (threshold: number): Promise<AboutData> => {
  const [trim, trimRun, datumRun, coverage] = await Promise.all([
    getTrimShape(threshold),
    getTrimModelRun(),
    getDatumModelRun(),
    getCoverage(),
  ]);
  const alpha = num(trimRun?.alpha);
  return {
    trim,
    trimRun,
    datumRun,
    coverage,
    priorShareAfter: (n: number) => (alpha != null ? Math.pow(1 - alpha, n) : null),
  };
});
