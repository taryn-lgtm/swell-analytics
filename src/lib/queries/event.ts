import { cache } from "react";
import { db } from "@/lib/db/server";
import { eventSlug } from "@/lib/slug";
import { num } from "@/lib/trim";
import { getMoversAtEvent, type Mover } from "@/lib/queries/home";

/**
 * Data for `/events/[slug]` -- PROJECT_PLAN.md's M3 cap: "draw, heat list,
 * Trim movement". Three modules, and no fourth.
 *
 * THE URL IS `<events.slug>-<season_year>`. Event slugs repeat across
 * seasons (lexus-pipe-pro is 2024 event 1 and 2025 event 1), so the slug
 * alone does not name an event. `eventSlug()` is applied to the stored
 * slug, not to the name, so the URL cannot drift from the row.
 *
 * TWO POPULATIONS, AND THEY ARE NOT THE SAME ONE:
 *   - `heat_entries` is who SURFED, read off the heat pages.
 *   - `event_entries` is who the season's FINAL RANKINGS page lists against
 *     the event (artefacts 35 and 105): 35 rows per regular event, with the
 *     published placing, points, participation and status. It includes
 *     surfers who did not surf (not contested, withdrawn) and omits most
 *     wildcards, because the rankings page does not list them.
 *   A surfer who surfed with no `event_entries` row is shown as "no entry
 *   row" -- never guessed to be a wildcard. Trap 3 is the reason: a guessed
 *   participation is how v1 awarded points nobody earned.
 *
 * THE WINNER (design decision F4). Regular events: the `event_entries` row
 * with `event_placing = 1`, which is the rankings page's published placing.
 * The WSL Finals has no `event_entries` rows -- it awards no ranking points
 * (trap 4) -- so its winner is `heat_entries.finished_position = 1`, as `/`
 * and `/rankings` already read it. Never derived from the final heat.
 *
 * Venue is `heats.venue_id` (trap 20); `events.venue_id` is shown only as
 * the listed venue. Counting rides are the stored `counted` flag in score
 * order (traps 14, 15). Round order is read, never generated: Abu Dhabi 2025
 * has no round 2 row, and the gap is left as a gap.
 */

export interface EventHeatEntry {
  heatEntryId: number;
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  position: number | null;
  heatTotal: number | null;
  /** The counting rides as published, in score order (trap 15). */
  countedScores: number[];
  progressionText: string | null;
  finishedPosition: number | null;
}

export interface EventHeat {
  heatId: number;
  heatNumber: number | null;
  venueName: string | null;
  waveHeight: string | null;
  wind: string | null;
  entries: EventHeatEntry[];
}

export interface EventRound {
  roundId: number;
  roundOrder: number;
  /** Rounds without a name are dropped loudly, as surfer.ts does. */
  name: string;
  countingRides: number | null;
  heats: EventHeat[];
}

export interface EventEntryRow {
  eventPlacing: number | null;
  points: number | null;
  pointsStatus: string;
  participation: string;
  status: string;
  statusNote: string | null;
  throwawayPublished: boolean | null;
}

export interface FieldRow {
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  /** Heats surfed at this event: rows in heat_entries. */
  heatsSurfed: number;
  /** The rankings page's row for this surfer at this event, or null. */
  entry: EventEntryRow | null;
  /** Published finishing position; only the WSL Finals publishes one. */
  finishedPosition: number | null;
}

export interface EventPage {
  id: number;
  param: string;
  name: string;
  kind: string;
  seasonYear: number;
  eventNumber: number;
  startDate: string | null;
  endDate: string | null;
  occursAfterCut: boolean;
  awardsRankingPoints: boolean;
  /** events.venue_id -- the NOMINAL venue (trap 20). */
  nominalVenueName: string | null;
  /** Heats per heats.venue_id name, sorted by name. */
  heatVenues: { name: string; heats: number }[];
  heatsWithoutVenue: number;
  heatCount: number;
  rounds: EventRound[];
  field: FieldRow[];
  /** Rows in event_entries for this event. */
  entryRowCount: number;
  surfedCount: number;
  winner: { surferId: number; fullName: string; slug: string; source: "event_placing" | "finished_position" } | null;
  seasonChampionId: number | null;
  movers: Mover[];
  /** Heat entries at this event, and how many carry a trim row. */
  heatEntryCount: number;
  heatEntriesWithoutTotal: number;
}

/** Codepoint order: the same order Postgres gives under COLLATE "C". */
export function byCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const getAllEventParams = cache(async (): Promise<string[]> => {
  const { data, error } = await db.from("events").select("slug, season_year").limit(500);
  if (error) throw new Error(`events query failed: ${error.message}`);
  return data.map((e) => eventSlug(e.slug, e.season_year));
});

export const getEventPage = cache(async (param: string): Promise<EventPage | null> => {
  const evRes = await db
    .from("events")
    .select(
      "id, name, slug, kind, season_year, event_number, start_date, end_date, occurs_after_cut, awards_ranking_points, venue_id"
    )
    .limit(500);
  if (evRes.error) throw new Error(`events query failed: ${evRes.error.message}`);
  const matches = evRes.data.filter((e) => eventSlug(e.slug, e.season_year) === param);
  if (matches.length > 1) {
    // Two events answering to one URL would make the page a coin toss.
    throw new Error(`${matches.length} events answer to /events/${param}`);
  }
  const e = matches[0];
  if (!e) return null;

  const [roundsRes, entriesRes, seasonRes, movers] = await Promise.all([
    db
      .from("rounds")
      .select("id, round_order, name, counting_rides")
      .eq("event_id", e.id)
      .order("round_order", { ascending: true }),
    db
      .from("event_entries")
      .select(
        "surfer_id, event_placing, points, points_status, participation, status, status_note, throwaway_published",
        { count: "exact" }
      )
      .eq("event_id", e.id)
      .limit(500),
    db.from("seasons").select("world_champion_surfer_id").eq("year", e.season_year).limit(1),
    getMoversAtEvent(e.season_year, e.event_number),
  ]);
  if (roundsRes.error) throw new Error(`rounds query failed: ${roundsRes.error.message}`);
  if (entriesRes.error) throw new Error(`event_entries query failed: ${entriesRes.error.message}`);
  if (seasonRes.error) throw new Error(`seasons query failed: ${seasonRes.error.message}`);
  assertComplete("event_entries", entriesRes.count, entriesRes.data.length, param);

  const roundIds = roundsRes.data.map((r) => r.id);
  const heatsRes = roundIds.length
    ? await db
        .from("heats")
        .select("id, round_id, heat_number, venue_id, wave_height_published, wind_conditions", {
          count: "exact",
        })
        .in("round_id", roundIds)
        .limit(1000)
    : { data: [], error: null, count: 0 };
  if (heatsRes.error) throw new Error(`heats query failed: ${heatsRes.error.message}`);
  assertComplete("heats", heatsRes.count, heatsRes.data.length, param);

  const heatIds = heatsRes.data.map((h) => h.id);
  const heRes = heatIds.length
    ? await db
        .from("heat_entries")
        .select("id, heat_id, surfer_id, position, heat_total, progression_text, finished_position", {
          count: "exact",
        })
        .in("heat_id", heatIds)
        .limit(1000)
    : { data: [], error: null, count: 0 };
  if (heRes.error) throw new Error(`heat_entries query failed: ${heRes.error.message}`);
  assertComplete("heat_entries", heRes.count, heRes.data.length, param);

  const venueIds = new Set<number>();
  if (e.venue_id != null) venueIds.add(e.venue_id);
  for (const h of heatsRes.data) if (h.venue_id != null) venueIds.add(h.venue_id);
  const surferIds = new Set<number>([
    ...heRes.data.map((x) => x.surfer_id),
    ...entriesRes.data.map((x) => x.surfer_id),
  ]);

  const [wavesRes, venuesRes, surfersRes] = await Promise.all([
    heRes.data.length
      ? db
          .from("waves")
          .select("heat_entry_id, score, counted", { count: "exact" })
          .in("heat_entry_id", heRes.data.map((x) => x.id))
          .eq("counted", true)
          .limit(2000)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    venueIds.size
      ? db.from("venues").select("id, name").in("id", [...venueIds])
      : Promise.resolve({ data: [], error: null }),
    surferIds.size
      ? db.from("surfers").select("id, full_name, slug, country_code").in("id", [...surferIds]).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (wavesRes.error) throw new Error(`waves query failed: ${wavesRes.error.message}`);
  if (venuesRes.error) throw new Error(`venues query failed: ${venuesRes.error.message}`);
  if (surfersRes.error) throw new Error(`surfers query failed: ${surfersRes.error.message}`);
  assertComplete("waves", wavesRes.count, wavesRes.data.length, param);

  const venueName = new Map<number, string>(venuesRes.data.map((v) => [v.id, v.name]));
  const surferById = new Map(surfersRes.data.map((s) => [s.id, s]));
  const countedByEntry = new Map<number, number[]>();
  for (const w of wavesRes.data) {
    const score = num(w.score);
    if (score == null) continue;
    const g = countedByEntry.get(w.heat_entry_id) ?? [];
    g.push(score);
    countedByEntry.set(w.heat_entry_id, g);
  }

  const entriesByHeat = new Map<number, EventHeatEntry[]>();
  for (const x of heRes.data) {
    const s = surferById.get(x.surfer_id);
    if (!s) {
      console.error("heat_entries row whose surfer is not in surfers", x);
      continue;
    }
    const g = entriesByHeat.get(x.heat_id) ?? [];
    g.push({
      heatEntryId: x.id,
      surferId: s.id,
      fullName: s.full_name,
      slug: s.slug,
      countryCode: s.country_code,
      position: x.position,
      heatTotal: num(x.heat_total),
      // Score order, not ride order (trap 15).
      countedScores: (countedByEntry.get(x.id) ?? []).sort((a, b) => b - a),
      progressionText: x.progression_text,
      finishedPosition: x.finished_position,
    });
    entriesByHeat.set(x.heat_id, g);
  }

  const rounds: EventRound[] = [];
  for (const r of roundsRes.data) {
    // Round names are data, never an enum (trap 6); an unnamed round is a defect.
    if (r.name == null) {
      console.error(`round ${r.id} carries no name; its heats are left off the event page`);
      continue;
    }
    const heats: EventHeat[] = heatsRes.data
      .filter((h) => h.round_id === r.id)
      .sort((a, b) => (a.heat_number ?? 0) - (b.heat_number ?? 0))
      .map((h) => ({
        heatId: h.id,
        heatNumber: h.heat_number,
        venueName: h.venue_id != null ? (venueName.get(h.venue_id) ?? null) : null,
        waveHeight: h.wave_height_published,
        wind: h.wind_conditions,
        // Published placing order; never re-ranked by total.
        entries: (entriesByHeat.get(h.id) ?? []).sort(
          (a, b) => (a.position ?? 99) - (b.position ?? 99) || byCodepoint(a.fullName, b.fullName)
        ),
      }));
    rounds.push({ roundId: r.id, roundOrder: r.round_order, name: r.name, countingRides: r.counting_rides, heats });
  }

  // ---- The field: everyone who surfed, and everyone the rankings list --
  const heatsSurfed = new Map<number, number>();
  const finished = new Map<number, number>();
  for (const x of heRes.data) {
    heatsSurfed.set(x.surfer_id, (heatsSurfed.get(x.surfer_id) ?? 0) + 1);
    if (x.finished_position != null) {
      const prev = finished.get(x.surfer_id);
      if (prev != null && prev !== x.finished_position) {
        console.error(`surfer ${x.surfer_id} carries two finished_positions at event ${e.id}`);
      }
      finished.set(x.surfer_id, x.finished_position);
    }
  }
  const entryBySurfer = new Map(entriesRes.data.map((x) => [x.surfer_id, x]));
  const field: FieldRow[] = [];
  for (const id of surferIds) {
    const s = surferById.get(id);
    if (!s) continue;
    const en = entryBySurfer.get(id);
    field.push({
      surferId: id,
      fullName: s.full_name,
      slug: s.slug,
      countryCode: s.country_code,
      heatsSurfed: heatsSurfed.get(id) ?? 0,
      entry: en
        ? {
            eventPlacing: en.event_placing,
            points: num(en.points),
            pointsStatus: en.points_status,
            participation: en.participation,
            status: en.status,
            statusNote: en.status_note,
            throwawayPublished: en.throwaway_published,
          }
        : null,
      finishedPosition: finished.get(id) ?? null,
    });
  }
  // Published placing first (or the Finals' finishing position), then the
  // surfers the rankings page does not list, then name.
  const rank = (f: FieldRow) => f.entry?.eventPlacing ?? f.finishedPosition ?? null;
  field.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra != null && rb != null && ra !== rb) return ra - rb;
    if (ra != null && rb == null) return -1;
    if (ra == null && rb != null) return 1;
    return byCodepoint(a.fullName, b.fullName);
  });

  // ---- Winner (F4) ------------------------------------------------------
  let winner: EventPage["winner"] = null;
  const placedFirst = entriesRes.data.filter((x) => x.event_placing === 1);
  const finishedFirst = heRes.data.filter((x) => x.finished_position === 1);
  if (placedFirst.length > 1) console.error(`event ${e.id}: ${placedFirst.length} entries with event_placing = 1`);
  if (placedFirst.length === 1) {
    const s = surferById.get(placedFirst[0].surfer_id);
    if (s) winner = { surferId: s.id, fullName: s.full_name, slug: s.slug, source: "event_placing" };
  } else if (placedFirst.length === 0 && new Set(finishedFirst.map((x) => x.surfer_id)).size === 1) {
    const s = surferById.get(finishedFirst[0].surfer_id);
    if (s) winner = { surferId: s.id, fullName: s.full_name, slug: s.slug, source: "finished_position" };
  }

  const venueCounts = new Map<string, number>();
  let heatsWithoutVenue = 0;
  for (const h of heatsRes.data) {
    const n = h.venue_id != null ? venueName.get(h.venue_id) : undefined;
    if (n == null) heatsWithoutVenue += 1;
    else venueCounts.set(n, (venueCounts.get(n) ?? 0) + 1);
  }

  return {
    id: e.id,
    param,
    name: e.name,
    kind: e.kind,
    seasonYear: e.season_year,
    eventNumber: e.event_number,
    startDate: e.start_date,
    endDate: e.end_date,
    occursAfterCut: e.occurs_after_cut,
    awardsRankingPoints: e.awards_ranking_points,
    nominalVenueName: e.venue_id != null ? (venueName.get(e.venue_id) ?? null) : null,
    heatVenues: [...venueCounts]
      .map(([name, heats]) => ({ name, heats }))
      .sort((a, b) => byCodepoint(a.name, b.name)),
    heatsWithoutVenue,
    heatCount: heatsRes.data.length,
    rounds,
    field,
    entryRowCount: entriesRes.data.length,
    surfedCount: heatsSurfed.size,
    winner,
    seasonChampionId: seasonRes.data[0]?.world_champion_surfer_id ?? null,
    movers,
    heatEntryCount: heRes.data.length,
    heatEntriesWithoutTotal: heRes.data.filter((x) => x.heat_total == null).length,
  };
});

function assertComplete(table: string, count: number | null, got: number, param: string) {
  if (count != null && count !== got) {
    console.error(
      `${table} for /events/${param}: server counted ${count} rows and returned ${got}. The page would render a truncated event.`
    );
  }
}
