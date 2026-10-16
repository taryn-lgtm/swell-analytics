import { cache } from "react";
import { db } from "@/lib/db/server";
import { exactMean } from "@/lib/format";
import { num, TRIM_MIN_HEATS } from "@/lib/trim";
import { getTrimCurrent, type TrimCurrentRow } from "@/lib/queries/home";

/**
 * Data for `/surfers/[slug]` -- the three modules the M3 scope cap names:
 * "Trim timeline, heat log, condition splits" (PROJECT_PLAN.md).
 *
 * One career = one surfer's rows from `heat_entries`, joined out to
 * `heats` / `rounds` / `events` for labels and to `datum` / `trim` for the
 * model. Everything is read; nothing about surfing is computed here except
 * the four aggregates named below, each of which states its population.
 *
 * TRAPS THIS FILE IS WRITTEN AGAINST -- do not "simplify" past them:
 *   - trap 14: `waves.counted` is a stored flag. An interference penalty
 *     zeroes a counting ride without promoting the next one, so the pair is
 *     NEVER the best two. Read the flag.
 *   - trap 15: the heat-total decomposition is ordered BY SCORE, not by
 *     chronology. The counted scores are sorted descending for display and
 *     never matched positionally to ride order.
 *   - trap 8: `counting_rides`, `scoring_basis` and `max_heat_score` belong
 *     to the ROUND, not the event. They are read per round, never assumed
 *     to be "best two to 20.00".
 *   - trap 20: venue is `heats.venue_id`. `events.venue_id` is nominal and
 *     wrong for 34 heats across three events.
 *   - trap 23: conditions (700 heats) and venue (712) are DIFFERENT
 *     populations. The extra twelve are Abu Dhabi's. Each figure states
 *     the one it was computed over.
 *
 * Chronological order is `season_year, event_number, round_order,
 * heat_number` -- the same ordering string `trim_model_runs.ordering`
 * carries, so the heat log and the timeline cannot disagree about what
 * "next" means.
 */

/** One heat this surfer surfed, with its model row where one exists. */
export interface SurferHeat {
  heatEntryId: number;
  heatId: number;
  seasonYear: number;
  eventNumber: number;
  eventName: string;
  eventSlug: string;
  eventKind: string;
  roundOrder: number;
  roundName: string;
  countingRides: number | null;
  maxHeatScore: number | null;
  scoringBasis: string | null;
  heatNumber: number | null;
  /** Published finishing position within the heat. */
  position: number | null;
  /** null = did not score / did not surf. Renders as an em-dash, never 0. */
  heatTotal: number | null;
  progressionText: string | null;
  /** Published event finish; only the WSL Finals publishes one. */
  finishedPosition: number | null;
  /** The counting rides as published, ordered by score descending (trap 15). */
  countedScores: number[];
  /** Every ride loaded for this entry, counted or not. */
  ridesLoaded: number;
  wind: string | null;
  waveHeight: string | null;
  waveHeightMinFt: number | null;
  venueName: string | null;
  /** Position in this surfer's own career sequence, from `trim.seq`. */
  seq: number | null;
  /** Datum: the expected heat total for this round. */
  expected: number | null;
  /** actual - expected. */
  residual: number | null;
  trimBefore: number | null;
  trimAfter: number | null;
  priorWeight: number | null;
}

export interface ConditionSplit {
  /** The published label, verbatim -- "Offshore", "4-6'". */
  label: string;
  heats: number;
  /** Heats in this split that carry a heat total. */
  rated: number;
  meanHeatTotal: number | null;
  bestHeatTotal: number | null;
  /** Mean Datum residual. Descriptive: conditions are not a model input. */
  meanResidual: number | null;
  sortKey: number;
}

export interface SurferProfile {
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  /** The v_trim_current row -- the same figure `/` and `/rankings` show. */
  current: TrimCurrentRow | null;
  /** How many of the 73 rated surfers sit below the threshold, and of how many. */
  belowThreshold: number;
  ratedSurfers: number;
  /** Career heats, chronological. */
  heats: SurferHeat[];
  seasons: number[];
  eventsEntered: number;
  /** Heats whose entry carries a heat total; the timeline's population. */
  ratedHeats: number;
  heatsWon: number;
  bestHeat: SurferHeat | null;
  meanHeatTotal: number | null;
  /** Heats of this surfer's career that carry published conditions. */
  heatsWithConditions: number;
  heatsWithVenue: number;
  windSplits: ConditionSplit[];
  waveHeightSplits: ConditionSplit[];
  /** The seasons the champion field names this surfer for. */
  titleYears: number[];
}

/** Heat totals are stored at 2 decimals, Trim residuals at 6. */
const TOTAL_DP = 2;
const RESIDUAL_DP = 6;

function buildSplits(
  heats: SurferHeat[],
  key: (h: SurferHeat) => string | null,
  sortKey: (h: SurferHeat) => number
): ConditionSplit[] {
  const groups = new Map<string, SurferHeat[]>();
  for (const h of heats) {
    const k = key(h);
    if (k == null) continue; // absence is stated by the coverage line, not as a bucket
    const g = groups.get(k) ?? [];
    g.push(h);
    groups.set(k, g);
  }
  const out: ConditionSplit[] = [];
  for (const [label, g] of groups) {
    const totals = g.map((h) => h.heatTotal).filter((v): v is number => v != null);
    const residuals = g.map((h) => h.residual).filter((v): v is number => v != null);
    out.push({
      label,
      heats: g.length,
      rated: totals.length,
      meanHeatTotal: exactMean(totals, TOTAL_DP),
      bestHeatTotal: totals.length ? Math.max(...totals) : null,
      meanResidual: exactMean(residuals, RESIDUAL_DP),
      sortKey: sortKey(g[0]),
    });
  }
  return out.sort((a, b) => a.sortKey - b.sortKey || a.label.localeCompare(b.label));
}

export const getSurferProfile = cache(async (slug: string): Promise<SurferProfile | null> => {
  const surfer = await db
    .from("surfers")
    .select("id, full_name, slug, country_code")
    .eq("slug", slug)
    .limit(1);
  if (surfer.error) throw new Error(`surfers query failed: ${surfer.error.message}`);
  if (surfer.data.length === 0) return null;
  const s = surfer.data[0];

  const [entriesRes, trimRes, datumRes, trimCurrent, seasonsRes] = await Promise.all([
    db
      .from("heat_entries")
      .select("id, heat_id, position, heat_total, progression_text, finished_position", {
        count: "exact",
      })
      .eq("surfer_id", s.id)
      .limit(2000),
    db
      .from("trim")
      .select("heat_entry_id, seq, residual, trim_before, trim_after, prior_weight", {
        count: "exact",
      })
      .eq("surfer_id", s.id)
      .limit(2000),
    db
      .from("datum")
      .select("heat_entry_id, expected_score", { count: "exact" })
      .eq("surfer_id", s.id)
      .limit(2000),
    getTrimCurrent(),
    db.from("seasons").select("year, world_champion_surfer_id").eq("world_champion_surfer_id", s.id),
  ]);
  if (entriesRes.error) throw new Error(`heat_entries query failed: ${entriesRes.error.message}`);
  if (trimRes.error) throw new Error(`trim query failed: ${trimRes.error.message}`);
  if (datumRes.error) throw new Error(`datum query failed: ${datumRes.error.message}`);
  if (seasonsRes.error) throw new Error(`seasons query failed: ${seasonsRes.error.message}`);

  // A page that silently renders a truncated career is worse than one that
  // fails: PostgREST caps at 1000 rows by default and says nothing.
  assertComplete("heat_entries", entriesRes.count, entriesRes.data.length, s.slug);
  assertComplete("trim", trimRes.count, trimRes.data.length, s.slug);
  assertComplete("datum", datumRes.count, datumRes.data.length, s.slug);

  const entries = entriesRes.data;
  if (entries.length === 0) {
    return emptyProfile(s, trimCurrent, seasonsRes.data.map((r) => r.year));
  }

  const heatIds = [...new Set(entries.map((e) => e.heat_id))];
  const heatsRes = await db
    .from("heats")
    .select(
      "id, round_id, heat_number, wind_conditions, wave_height_published, wave_height_min_ft, venue_id",
      { count: "exact" }
    )
    .in("id", heatIds)
    .limit(2000);
  if (heatsRes.error) throw new Error(`heats query failed: ${heatsRes.error.message}`);
  assertComplete("heats", heatsRes.count, heatsRes.data.length, s.slug);

  const roundIds = [...new Set(heatsRes.data.map((h) => h.round_id))];
  const venueIds = [...new Set(heatsRes.data.map((h) => h.venue_id).filter((v): v is number => v != null))];
  const [roundsRes, venuesRes, wavesRes] = await Promise.all([
    db
      .from("rounds")
      .select("id, event_id, round_order, name, counting_rides, max_heat_score, scoring_basis")
      .in("id", roundIds)
      .limit(2000),
    venueIds.length
      ? db.from("venues").select("id, name").in("id", venueIds).limit(200)
      : Promise.resolve({ data: [], error: null } as const),
    db
      .from("waves")
      .select("heat_entry_id, score, counted", { count: "exact" })
      .in("heat_entry_id", entries.map((e) => e.id))
      .limit(5000),
  ]);
  if (roundsRes.error) throw new Error(`rounds query failed: ${roundsRes.error.message}`);
  if (venuesRes.error) throw new Error(`venues query failed: ${venuesRes.error.message}`);
  if (wavesRes.error) throw new Error(`waves query failed: ${wavesRes.error.message}`);
  assertComplete("waves", wavesRes.count, wavesRes.data.length, s.slug);

  const eventIds = [...new Set(roundsRes.data.map((r) => r.event_id))];
  const eventsRes = await db
    .from("events")
    .select("id, season_year, event_number, name, slug, kind")
    .in("id", eventIds)
    .limit(200);
  if (eventsRes.error) throw new Error(`events query failed: ${eventsRes.error.message}`);

  const heatById = new Map(heatsRes.data.map((h) => [h.id, h]));
  const roundById = new Map(roundsRes.data.map((r) => [r.id, r]));
  const eventById = new Map(eventsRes.data.map((e) => [e.id, e]));
  const venueById = new Map(venuesRes.data.map((v) => [v.id, v]));
  const trimByEntry = new Map(trimRes.data.map((t) => [t.heat_entry_id, t]));
  const datumByEntry = new Map(datumRes.data.map((d) => [d.heat_entry_id, d]));

  const wavesByEntry = new Map<number, { score: number | null; counted: boolean }[]>();
  for (const w of wavesRes.data) {
    const g = wavesByEntry.get(w.heat_entry_id) ?? [];
    g.push({ score: num(w.score), counted: w.counted });
    wavesByEntry.set(w.heat_entry_id, g);
  }

  const heats: SurferHeat[] = [];
  for (const e of entries) {
    const h = heatById.get(e.heat_id);
    if (!h) {
      console.error(`heat_entry ${e.id} points at heat ${e.heat_id}, which did not come back`);
      continue;
    }
    const r = roundById.get(h.round_id);
    if (!r) {
      console.error(`heat ${h.id} points at round ${h.round_id}, which did not come back`);
      continue;
    }
    const ev = eventById.get(r.event_id);
    if (!ev) {
      console.error(`round ${r.id} points at event ${r.event_id}, which did not come back`);
      continue;
    }
    // Round names are data, never an enum (trap 6), and all 138 rounds carry
    // one. The column is nullable, so an unnamed round is a defect rather
    // than a display case: drop it loudly, as home.ts does for v_trim_current.
    if (r.name == null) {
      console.error(`round ${r.id} carries no name; its heat is left out of the log`);
      continue;
    }
    const rides = wavesByEntry.get(e.id) ?? [];
    const t = trimByEntry.get(e.id);
    const d = datumByEntry.get(e.id);
    const heatTotal = num(e.heat_total);
    const expected = d ? num(d.expected_score) : null;
    heats.push({
      heatEntryId: e.id,
      heatId: h.id,
      seasonYear: ev.season_year,
      eventNumber: ev.event_number,
      eventName: ev.name,
      eventSlug: ev.slug,
      eventKind: ev.kind,
      roundOrder: r.round_order,
      roundName: r.name,
      countingRides: r.counting_rides,
      maxHeatScore: num(r.max_heat_score),
      scoringBasis: r.scoring_basis,
      heatNumber: h.heat_number,
      position: e.position,
      heatTotal,
      progressionText: e.progression_text,
      finishedPosition: e.finished_position,
      // Sorted by score, not by ride order (trap 15).
      countedScores: rides
        .filter((w) => w.counted && w.score != null)
        .map((w) => w.score as number)
        .sort((a, b) => b - a),
      ridesLoaded: rides.length,
      wind: h.wind_conditions,
      waveHeight: h.wave_height_published,
      waveHeightMinFt: num(h.wave_height_min_ft),
      venueName: h.venue_id != null ? (venueById.get(h.venue_id)?.name ?? null) : null,
      seq: t?.seq ?? null,
      expected,
      residual: t ? num(t.residual) : null,
      trimBefore: t ? num(t.trim_before) : null,
      trimAfter: t ? num(t.trim_after) : null,
      priorWeight: t ? num(t.prior_weight) : null,
    });
  }

  heats.sort(
    (a, b) =>
      a.seasonYear - b.seasonYear ||
      a.eventNumber - b.eventNumber ||
      a.roundOrder - b.roundOrder ||
      (a.heatNumber ?? 0) - (b.heatNumber ?? 0)
  );

  // The stored career sequence and the stored ordering must agree. If they
  // do not, the timeline is drawing a different career from the heat log.
  const seqOrder = heats.filter((h) => h.seq != null).map((h) => h.seq as number);
  for (let i = 1; i < seqOrder.length; i++) {
    if (seqOrder[i] <= seqOrder[i - 1]) {
      console.error(
        `trim.seq disagrees with the chronological sort for ${s.slug}: ${seqOrder[i - 1]} then ${seqOrder[i]}`
      );
      break;
    }
  }

  const rated = heats.filter((h) => h.heatTotal != null);
  const totals = rated.map((h) => h.heatTotal as number);
  const best = rated.reduce<SurferHeat | null>(
    (acc, h) => (acc == null || (h.heatTotal as number) > (acc.heatTotal as number) ? h : acc),
    null
  );

  const current = trimCurrent.find((t) => t.surferId === s.id) ?? null;

  return {
    surferId: s.id,
    fullName: s.full_name,
    slug: s.slug,
    countryCode: s.country_code,
    current,
    belowThreshold: trimCurrent.filter((t) => t.nHeats < TRIM_MIN_HEATS).length,
    ratedSurfers: trimCurrent.length,
    heats,
    seasons: [...new Set(heats.map((h) => h.seasonYear))].sort((a, b) => a - b),
    eventsEntered: new Set(heats.map((h) => `${h.seasonYear}-${h.eventNumber}`)).size,
    ratedHeats: rated.length,
    heatsWon: heats.filter((h) => h.position === 1).length,
    bestHeat: best,
    meanHeatTotal: exactMean(totals, TOTAL_DP),
    heatsWithConditions: heats.filter((h) => h.wind != null).length,
    heatsWithVenue: heats.filter((h) => h.venueName != null).length,
    windSplits: buildSplits(heats, (h) => h.wind, () => 0).sort((a, b) => b.heats - a.heats),
    waveHeightSplits: buildSplits(heats, (h) => h.waveHeight, (h) => h.waveHeightMinFt ?? 0),
    titleYears: seasonsRes.data.map((r) => r.year).sort((a, b) => a - b),
  };
});

function assertComplete(table: string, count: number | null, got: number, slug: string) {
  if (count != null && count !== got) {
    console.error(
      `${table} for ${slug}: server counted ${count} rows and returned ${got}. The page would render a truncated career.`
    );
  }
}

function emptyProfile(
  s: { id: number; full_name: string; slug: string; country_code: string | null },
  trimCurrent: TrimCurrentRow[],
  titleYears: number[]
): SurferProfile {
  return {
    surferId: s.id,
    fullName: s.full_name,
    slug: s.slug,
    countryCode: s.country_code,
    current: trimCurrent.find((t) => t.surferId === s.id) ?? null,
    belowThreshold: trimCurrent.filter((t) => t.nHeats < TRIM_MIN_HEATS).length,
    ratedSurfers: trimCurrent.length,
    heats: [],
    seasons: [],
    eventsEntered: 0,
    ratedHeats: 0,
    heatsWon: 0,
    bestHeat: null,
    meanHeatTotal: null,
    heatsWithConditions: 0,
    heatsWithVenue: 0,
    windSplits: [],
    waveHeightSplits: [],
    titleYears,
  };
}

/** Every surfer slug, for generateStaticParams. All 73 carry one. */
export const getAllSurferSlugs = cache(async (): Promise<string[]> => {
  const { data, error } = await db.from("surfers").select("slug").order("slug").limit(500);
  if (error) throw new Error(`surfers query failed: ${error.message}`);
  return data.map((r) => r.slug);
});
