import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/server";
import { getTrimCurrent } from "@/lib/queries/home";
import { getCompareDataset } from "@/lib/queries/compare";
import { wslResultsUrl } from "@/lib/wsl";

/**
 * Data for the two browse pages added in M5, `/events` and `/surfers`. The
 * WSL-analyst audit (17 October 2026, P1-5) found the 22 event pages and the
 * wildcards' surfer pages reachable only through other pages' tables.
 *
 * Everything is read; the only arithmetic is counting. The event winner is the
 * published placing 1 (event_entries) for regular events and the published
 * finishing position 1 (heat_entries.finished_position) for the WSL Finals,
 * the same two sources the event pages use.
 */

export interface EventIndexRow {
  id: number;
  seasonYear: number;
  eventNumber: number;
  name: string;
  /** The `<events.slug>-<year>` route parameter. */
  param: string;
  kind: string;
  startDate: string | null;
  endDate: string | null;
  /** The event's named venue; heats can be surfed elsewhere (trap 20). */
  venue: string | null;
  heats: number;
  winner: { name: string; slug: string } | null;
  /** WSL's own results page, the retained source for this event. */
  wslUrl: string | null;
}

export const getEventsIndex = cache(async (): Promise<EventIndexRow[]> => {
  const [eventsRes, venuesRes, winnersRes, ds] = await Promise.all([
    db
      .from("events")
      .select("id, season_year, event_number, name, slug, kind, start_date, end_date, venue_id, wsl_event_id")
      .order("season_year")
      .order("event_number"),
    db.from("venues").select("id, name"),
    db.from("event_entries").select("event_id, surfer_id").eq("event_placing", 1),
    getCompareDataset(),
  ]);
  if (eventsRes.error) throw new Error(`events query failed: ${eventsRes.error.message}`);
  if (venuesRes.error) throw new Error(`venues query failed: ${venuesRes.error.message}`);
  if (winnersRes.error) throw new Error(`event_entries (winners) query failed: ${winnersRes.error.message}`);

  // Finals winners: finished_position 1 on any heat entry of that event.
  const finalsIds = eventsRes.data.filter((e) => e.kind === "wsl_finals").map((e) => e.id);
  const finalsWinners = new Map<number, number>();
  if (finalsIds.length) {
    const { data, error } = await db
      .from("heat_entries")
      .select("surfer_id, heats!inner(rounds!inner(event_id))")
      .eq("finished_position", 1)
      .in("heats.rounds.event_id", finalsIds);
    if (error) throw new Error(`heat_entries (Finals winners) query failed: ${error.message}`);
    for (const r of data as unknown as { surfer_id: number; heats: { rounds: { event_id: number } } }[]) {
      finalsWinners.set(r.heats.rounds.event_id, r.surfer_id);
    }
  }

  const venueById = new Map(venuesRes.data.map((v) => [v.id, v.name]));
  const surferById = new Map(ds.surfers.map((s) => [s.id, s]));
  const regularWinner = new Map(winnersRes.data.map((w) => [w.event_id, w.surfer_id]));
  const heatsByEvent = new Map<number, Set<number>>();
  for (const h of ds.heats) {
    const set = heatsByEvent.get(h.e) ?? new Set<number>();
    set.add(h.h);
    heatsByEvent.set(h.e, set);
  }

  return eventsRes.data.map((e) => {
    const winnerId = e.kind === "wsl_finals" ? finalsWinners.get(e.id) : regularWinner.get(e.id);
    const w = winnerId != null ? surferById.get(winnerId) : undefined;
    return {
      id: e.id,
      seasonYear: e.season_year,
      eventNumber: e.event_number,
      name: e.name,
      param: `${e.slug}-${e.season_year}`,
      kind: e.kind,
      startDate: e.start_date,
      endDate: e.end_date,
      venue: e.venue_id != null ? (venueById.get(e.venue_id) ?? null) : null,
      heats: heatsByEvent.get(e.id)?.size ?? 0,
      winner: w ? { name: w.name, slug: w.slug } : null,
      wslUrl: wslResultsUrl(e),
    };
  });
});

export interface SurferIndexRow {
  id: number;
  name: string;
  slug: string;
  countryCode: string | null;
  seasons: number[];
  heats: number;
  events: number;
  trim: number | null;
  halfWidth: number | null;
  lastHeat: string | null;
}

export const getSurfersIndex = cache(async (): Promise<SurferIndexRow[]> => {
  const [ds, trim] = await Promise.all([getCompareDataset(), getTrimCurrent()]);
  const seasonOf = new Map(ds.events.map((e) => [e.id, e.seasonYear]));
  const trimById = new Map(trim.map((t) => [t.surferId, t]));
  return ds.surfers.map((s) => {
    const hs = ds.heats.filter((h) => h.s === s.id);
    const t = trimById.get(s.id);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      countryCode: s.countryCode,
      seasons: [...new Set(hs.map((h) => seasonOf.get(h.e) as number))].sort((a, b) => a - b),
      heats: hs.length,
      events: new Set(hs.map((h) => h.e)).size,
      trim: t?.trim ?? null,
      halfWidth: t?.halfWidth ?? null,
      lastHeat: t?.lastHeat ? `${t.lastHeat.eventName} ${t.lastHeat.seasonYear}` : null,
    };
  });
});
