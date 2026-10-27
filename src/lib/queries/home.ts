import { cache } from "react";
import { db } from "@/lib/db/server";
import type { Tables } from "@/lib/database.types";
import { num, trimHalfWidth95 } from "@/lib/trim";

/**
 * Data for `/` -- the three modules the plan's M3 cap names for the home
 * route: the Trim leaderboard, movers, and the latest event. Every figure a
 * module renders comes from a row fetched here; nothing is derived that the
 * database does not already hold, with the two exceptions stated inline
 * (a Trim delta, which is a subtraction of two stored values, and a rank,
 * which is the row's position in a sort by a stored value).
 *
 * All reads go through the publishable-key client and are governed by RLS
 * (migration 17). If a query returns zero rows the page says so; it never
 * substitutes.
 */

// ---------------------------------------------------------------------
// Trim leaderboard -- v_trim_current, the last row per surfer
// ---------------------------------------------------------------------

export interface TrimCurrentRow {
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  trim: number;
  nHeats: number;
  priorWeight: number;
  lastSeason: number | null;
  /** 95% half-width of the Trim figure; null if the model run lacks alpha or RMSE. */
  halfWidth: number | null;
  /** The surfer's last rated heat, so a 2024-25 figure is never read as current form. */
  lastHeat: { seasonYear: number; eventNumber: number; eventName: string; eventSlug: string; endDate: string | null } | null;
}

export const getTrimCurrent = cache(async (): Promise<TrimCurrentRow[]> => {
  const [{ data, error }, run, lastHeats] = await Promise.all([
    db
      .from("v_trim_current")
      .select("surfer_id, full_name, slug, country_code, trim, n_heats, prior_weight, last_season")
      .order("trim", { ascending: false }),
    getTrimModelRun(),
    getLastRatedHeats(),
  ]);
  if (error) throw new Error(`v_trim_current query failed: ${error.message}`);
  const alpha = num(run?.alpha);
  const sigma = num(run?.rmse_walkforward);

  const rows: TrimCurrentRow[] = [];
  for (const r of data) {
    const trim = num(r.trim);
    const nHeats = num(r.n_heats);
    const priorWeight = num(r.prior_weight);
    // The view's columns are nullable only because Postgres cannot prove
    // otherwise for a DISTINCT ON; a row missing any of these is a defect,
    // not a display case, so it is dropped loudly rather than shown as "—".
    if (
      r.surfer_id == null ||
      r.full_name == null ||
      r.slug == null ||
      trim == null ||
      nHeats == null ||
      priorWeight == null
    ) {
      console.error("v_trim_current row with a null key field", r);
      continue;
    }
    rows.push({
      surferId: r.surfer_id,
      fullName: r.full_name,
      slug: r.slug,
      countryCode: r.country_code,
      trim,
      nHeats,
      priorWeight,
      lastSeason: r.last_season,
      halfWidth: alpha != null && sigma != null ? trimHalfWidth95(nHeats, alpha, sigma) : null,
      lastHeat: lastHeats.get(r.surfer_id) ?? null,
    });
  }
  return rows;
});

/**
 * Each surfer's last rated heat under the latest model run: the trim row with
 * the highest seq, joined to its event. Paged, because PostgREST stops at
 * 1,000 rows without saying so.
 */
const getLastRatedHeats = cache(async () => {
  const run = await getTrimModelRun();
  const out = new Map<
    number,
    { seasonYear: number; eventNumber: number; eventName: string; eventSlug: string; endDate: string | null }
  >();
  if (!run) return out;
  const last = new Map<number, { seq: number; season: number; event: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("trim")
      .select("surfer_id, seq, season_year, event_number")
      .eq("model_run_id", run.id)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`trim (last heats) query failed: ${error.message}`);
    for (const t of data) {
      const cur = last.get(t.surfer_id);
      if (!cur || t.seq > cur.seq) last.set(t.surfer_id, { seq: t.seq, season: t.season_year, event: t.event_number });
    }
    if (data.length < 1000) break;
  }
  const { data: events, error } = await db.from("events").select("season_year, event_number, name, slug, end_date");
  if (error) throw new Error(`events (last heats) query failed: ${error.message}`);
  const byKey = new Map(events.map((e) => [`${e.season_year}-${e.event_number}`, e]));
  for (const [surferId, l] of last) {
    const e = byKey.get(`${l.season}-${l.event}`);
    if (!e) {
      console.error(`last rated heat for surfer ${surferId} points at a missing event ${l.season}-${l.event}`);
      continue;
    }
    out.set(surferId, {
      seasonYear: l.season,
      eventNumber: l.event,
      eventName: e.name,
      eventSlug: e.slug,
      endDate: e.end_date,
    });
  }
  return out;
});

export type TrimModelRun = Tables<"trim_model_runs">;

/** The model run the leaderboard's figures were computed under -- one row. */
export const getTrimModelRun = cache(async (): Promise<TrimModelRun | null> => {
  const { data, error } = await db
    .from("trim_model_runs")
    .select("*")
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw new Error(`trim_model_runs query failed: ${error.message}`);
  return data[0] ?? null;
});

// ---------------------------------------------------------------------
// Latest event -- most recent by events.end_date
// ---------------------------------------------------------------------

export interface LatestEventHeatEntry {
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  /** Published placing in the heat (heat_entries.position). Never recomputed. */
  position: number | null;
  /** Published finishing position in the EVENT, where WSL publishes one. */
  finishedPosition: number | null;
  heatTotal: number | null;
}

export interface LatestEventHeat {
  heatId: number;
  heatNumber: number | null;
  roundOrder: number;
  roundName: string | null;
  venueName: string | null;
  entries: LatestEventHeatEntry[];
}

export interface LatestEvent {
  id: number;
  name: string;
  slug: string;
  kind: string;
  seasonYear: number;
  eventNumber: number;
  startDate: string | null;
  endDate: string | null;
  occursAfterCut: boolean;
  /** events.venue_id -- the NOMINAL venue (decision 33 / trap 20). */
  nominalVenueName: string | null;
  /** Distinct heats.venue_id names across the event; where the heats were surfed. */
  heatVenueNames: string[];
  heatsWithoutVenue: number;
  heatCount: number;
  roundCount: number;
  heats: LatestEventHeat[];
  /**
   * The published event winner: the entry carrying finished_position = 1.
   * Null when WSL's heat pages do not publish one -- true for all 20
   * regular events in V1 (design decision F4, open). A null here renders
   * as "not published", never as a derivation from the final heat.
   */
  publishedWinner: LatestEventHeatEntry | null;
  /** seasons.world_champion_surfer_id for the event's season -- the explicit field. */
  seasonChampion: { surferId: number; fullName: string; slug: string } | null;
}

export const getLatestEvent = cache(async (): Promise<LatestEvent | null> => {
  const ev = await db
    .from("events")
    .select("id, name, slug, kind, season_year, event_number, start_date, end_date, occurs_after_cut, venue_id")
    .not("end_date", "is", null)
    .order("end_date", { ascending: false })
    .limit(1);
  if (ev.error) throw new Error(`events query failed: ${ev.error.message}`);
  const e = ev.data[0];
  if (!e) return null;

  const [rounds, season] = await Promise.all([
    db
      .from("rounds")
      .select("id, round_order, name")
      .eq("event_id", e.id)
      .order("round_order", { ascending: true }),
    db
      .from("seasons")
      .select("world_champion_surfer_id")
      .eq("year", e.season_year)
      .limit(1),
  ]);
  if (rounds.error) throw new Error(`rounds query failed: ${rounds.error.message}`);
  if (season.error) throw new Error(`seasons query failed: ${season.error.message}`);

  const roundIds = rounds.data.map((r) => r.id);
  const heats = roundIds.length
    ? await db
        .from("heats")
        .select("id, round_id, heat_number, venue_id")
        .in("round_id", roundIds)
        .order("heat_number", { ascending: true })
    : { data: [], error: null };
  if (heats.error) throw new Error(`heats query failed: ${heats.error.message}`);

  const heatIds = heats.data.map((h) => h.id);
  const entries = heatIds.length
    ? await db
        .from("heat_entries")
        .select("heat_id, surfer_id, position, finished_position, heat_total")
        .in("heat_id", heatIds)
    : { data: [], error: null };
  if (entries.error) throw new Error(`heat_entries query failed: ${entries.error.message}`);

  const venueIds = new Set<number>();
  if (e.venue_id != null) venueIds.add(e.venue_id);
  for (const h of heats.data) if (h.venue_id != null) venueIds.add(h.venue_id);

  const surferIds = new Set<number>(entries.data.map((x) => x.surfer_id));
  const championId = season.data[0]?.world_champion_surfer_id ?? null;
  if (championId != null) surferIds.add(championId);

  const [venues, surfers] = await Promise.all([
    venueIds.size
      ? db.from("venues").select("id, name").in("id", [...venueIds])
      : Promise.resolve({ data: [], error: null }),
    surferIds.size
      ? db.from("surfers").select("id, full_name, slug, country_code").in("id", [...surferIds])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (venues.error) throw new Error(`venues query failed: ${venues.error.message}`);
  if (surfers.error) throw new Error(`surfers query failed: ${surfers.error.message}`);

  const venueName = new Map<number, string>(venues.data.map((v) => [v.id, v.name]));
  const surferById = new Map(surfers.data.map((s) => [s.id, s]));
  const roundById = new Map(rounds.data.map((r) => [r.id, r]));

  const toEntry = (x: (typeof entries.data)[number]): LatestEventHeatEntry | null => {
    const s = surferById.get(x.surfer_id);
    if (!s) {
      console.error("heat_entries row whose surfer is not in surfers", x);
      return null;
    }
    return {
      surferId: s.id,
      fullName: s.full_name,
      slug: s.slug,
      countryCode: s.country_code,
      position: x.position,
      finishedPosition: x.finished_position,
      heatTotal: num(x.heat_total),
    };
  };

  const heatRows: LatestEventHeat[] = heats.data.map((h) => {
    const r = roundById.get(h.round_id);
    const es = entries.data
      .filter((x) => x.heat_id === h.id)
      .map(toEntry)
      .filter((x): x is LatestEventHeatEntry => x != null)
      // Published placing order; unplaced entries sink, never re-ranked by total.
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    return {
      heatId: h.id,
      heatNumber: h.heat_number,
      roundOrder: r?.round_order ?? 0,
      roundName: r?.name ?? null,
      venueName: h.venue_id != null ? (venueName.get(h.venue_id) ?? null) : null,
      entries: es,
    };
  });
  heatRows.sort((a, b) => a.roundOrder - b.roundOrder || (a.heatNumber ?? 0) - (b.heatNumber ?? 0));

  const winners = entries.data.filter((x) => x.finished_position === 1);
  if (winners.length > 1) {
    // Two published first places would be a data defect, not a tie to resolve here.
    console.error(`event ${e.id} carries ${winners.length} entries with finished_position = 1`);
  }
  const publishedWinner = winners.length === 1 ? toEntry(winners[0]) : null;

  const champ = championId != null ? surferById.get(championId) : undefined;

  const heatVenueNames = [...new Set(heatRows.map((h) => h.venueName).filter((n): n is string => n != null))];

  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    kind: e.kind,
    seasonYear: e.season_year,
    eventNumber: e.event_number,
    startDate: e.start_date,
    endDate: e.end_date,
    occursAfterCut: e.occurs_after_cut,
    nominalVenueName: e.venue_id != null ? (venueName.get(e.venue_id) ?? null) : null,
    heatVenueNames,
    heatsWithoutVenue: heatRows.filter((h) => h.venueName == null).length,
    heatCount: heatRows.length,
    roundCount: rounds.data.length,
    heats: heatRows,
    publishedWinner,
    seasonChampion: champ ? { surferId: champ.id, fullName: champ.full_name, slug: champ.slug } : null,
  };
});

// ---------------------------------------------------------------------
// Movers -- Trim movement across the latest event
// ---------------------------------------------------------------------

export interface Mover {
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  /** trim_before of the surfer's first heat at the event. */
  trimBefore: number;
  /** trim_after of the surfer's last heat at the event. */
  trimAfter: number;
  /** trimAfter - trimBefore: the one derived figure on the page. */
  delta: number;
  heatsAtEvent: number;
  /** n_heats after the event, so the prior-weight caveat travels with the delta. */
  nHeats: number;
  priorWeight: number;
}

/**
 * The window is "the latest event": every surfer who surfed a heat there,
 * with the Trim they arrived on and the Trim they left with. Design
 * decision F7 (what defines a mover) is OPEN; this is the one window that
 * needs no parameter, and it ties the module to the event shown beside it.
 * trim carries season_year and event_number, so no join is needed.
 */
export const getMoversAtEvent = cache(
  async (seasonYear: number, eventNumber: number): Promise<Mover[]> => {
    // The latest run only: trim is append-only and a recompute adds a run.
    const run = await getTrimModelRun();
    const { data, error } = await db
      .from("trim")
      .select("surfer_id, seq, trim_before, trim_after, prior_weight")
      .eq("model_run_id", run?.id ?? -1)
      .eq("season_year", seasonYear)
      .eq("event_number", eventNumber)
      .order("seq", { ascending: true });
    if (error) throw new Error(`trim query failed: ${error.message}`);
    if (data.length === 0) return [];

    const bySurfer = new Map<number, typeof data>();
    for (const r of data) {
      const list = bySurfer.get(r.surfer_id) ?? [];
      list.push(r);
      bySurfer.set(r.surfer_id, list);
    }

    const surfers = await db
      .from("surfers")
      .select("id, full_name, slug, country_code")
      .in("id", [...bySurfer.keys()]);
    if (surfers.error) throw new Error(`surfers query failed: ${surfers.error.message}`);
    const surferById = new Map(surfers.data.map((s) => [s.id, s]));

    const movers: Mover[] = [];
    for (const [surferId, rows] of bySurfer) {
      const s = surferById.get(surferId);
      const first = rows[0];
      const last = rows[rows.length - 1];
      const trimBefore = num(first.trim_before);
      const trimAfter = num(last.trim_after);
      const priorWeight = num(last.prior_weight);
      if (!s || trimBefore == null || trimAfter == null || priorWeight == null) {
        console.error("trim rows unusable for movers", { surferId, first, last });
        continue;
      }
      movers.push({
        surferId,
        fullName: s.full_name,
        slug: s.slug,
        countryCode: s.country_code,
        trimBefore,
        trimAfter,
        delta: trimAfter - trimBefore,
        heatsAtEvent: rows.length,
        nHeats: last.seq,
        priorWeight,
      });
    }
    movers.sort((a, b) => b.delta - a.delta);
    return movers;
  }
);
