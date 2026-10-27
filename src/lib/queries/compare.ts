import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/server";
import { num } from "@/lib/trim";
import { getTrimCurrent } from "@/lib/queries/home";

/**
 * Data for `/compare`: every heat entry and every regular-event result,
 * flattened into one compact dataset that the page ships to the browser.
 *
 * Why one dataset rather than a query per pair: 73 surfers make 2,628
 * pairs, too many to prerender and too slow to render per request (two
 * full careers is ~20 queries). The whole tour is 1,852 heat entries, so
 * shipping it once keeps the page static and makes picking a pair instant.
 * Every comparison is then computed in the browser from these rows by
 * src/lib/compare.ts, which is pure and unit-testable.
 *
 * Populations, stated because the page states them:
 *   - heats: every `heat_entries` row (1,852), WSL Finals included.
 *   - heat size: the number of entries in that heat, counted here. The
 *     tour holds 2- and 3-surfer heats only (548 and 252, 15 Oct 2026).
 *   - vs Datum: `datum.residual` (actual minus expected), present for the
 *     1,843 entries that carry a heat total.
 *   - venue: `heats.venue_id` (trap 20), never `events.venue_id`. 88 heats
 *     carry none and are counted as "venue not recorded".
 *   - placings: `event_entries` on regular events (700 rows). The WSL
 *     Finals publishes no event_entries; its heats still count as heats.
 */

export interface CompareSurfer {
  id: number;
  name: string;
  slug: string;
  countryCode: string | null;
  /** Latest Trim, the same figure `/` shows; null if unrated. */
  trim: number | null;
  /** 95% half-width of that Trim; null if unrated. */
  trimHalfWidth: number | null;
  /** Last rated heat, e.g. "Lexus Pipe Pro 2025"; null if unrated. */
  lastHeat: string | null;
}

export interface CompareEvent {
  id: number;
  seasonYear: number;
  eventNumber: number;
  name: string;
  slug: string;
  kind: string;
}

/** One heat entry. Short keys: the array is shipped to the browser. */
export interface CompareHeat {
  /** surfer id */
  s: number;
  /** heat id */
  h: number;
  /** event id */
  e: number;
  /** round order, for chronology */
  ro: number;
  /** round name, verbatim (trap 6) */
  rn: string;
  /** heat number within the round */
  hn: number | null;
  /** published position in the heat */
  p: number | null;
  /** heat total; null = no published total, never 0 */
  t: number | null;
  /** Datum residual (actual - expected); null where no heat total */
  r: number | null;
  /** surfers in this heat */
  n: number;
  /** venue id from heats.venue_id; null = not recorded */
  v: number | null;
}

export interface ComparePlacing {
  s: number;
  e: number;
  /** event_placing; null when the surfer did not compete */
  pl: number | null;
  /** event_entries.status, verbatim */
  st: string | null;
  /** event_entries.participation, verbatim */
  pa: string | null;
}

export interface CompareDataset {
  surfers: CompareSurfer[];
  events: CompareEvent[];
  venues: { id: number; name: string }[];
  heats: CompareHeat[];
  placings: ComparePlacing[];
  seasons: number[];
}

/**
 * PostgREST caps a response at 1,000 rows and says nothing. Page through.
 *
 * Each page is retried twice on error: on 15 October 2026 one build and
 * one verifier run each hit a Cloudflare 522 (upstream timeout) from
 * Supabase on a single request while the next attempt answered in ~0.1 s.
 * A retry never changes data; a persistent error still throws and fails the
 * build, which is the safe outcome.
 */
async function all<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    let res = await page(from, from + size - 1);
    for (let attempt = 1; res.error && attempt <= 2; attempt++) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      res = await page(from, from + size - 1);
    }
    const { data, error } = res;
    if (error) throw new Error(`${label} query failed: ${error.message.slice(0, 200)}`);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export const getCompareDataset = cache(async (): Promise<CompareDataset> => {
  const [surfers, events, venues, rounds, heats, entries, datum, placings, trimCurrent] =
    await Promise.all([
      all("surfers", (a, b) =>
        db.from("surfers").select("id, full_name, slug, country_code").order("id").range(a, b)
      ),
      all("events", (a, b) =>
        db.from("events").select("id, season_year, event_number, name, slug, kind").order("id").range(a, b)
      ),
      all("venues", (a, b) => db.from("venues").select("id, name").order("id").range(a, b)),
      all("rounds", (a, b) =>
        db.from("rounds").select("id, event_id, round_order, name").order("id").range(a, b)
      ),
      all("heats", (a, b) =>
        db.from("heats").select("id, round_id, heat_number, venue_id").order("id").range(a, b)
      ),
      all("heat_entries", (a, b) =>
        db.from("heat_entries").select("id, heat_id, surfer_id, position, heat_total").order("id").range(a, b)
      ),
      all("datum", (a, b) =>
        db.from("datum").select("heat_entry_id, residual").order("id").range(a, b)
      ),
      all("event_entries", (a, b) =>
        db
          .from("event_entries")
          .select("surfer_id, event_id, event_placing, status, participation")
          .order("id")
          .range(a, b)
      ),
      getTrimCurrent(),
    ]);

  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const heatById = new Map(heats.map((h) => [h.id, h]));
  const residualByEntry = new Map(datum.map((d) => [d.heat_entry_id, num(d.residual)]));
  const sizeByHeat = new Map<number, number>();
  for (const e of entries) sizeByHeat.set(e.heat_id, (sizeByHeat.get(e.heat_id) ?? 0) + 1);
  const trimBySurfer = new Map(trimCurrent.map((t) => [t.surferId, t]));

  const outHeats: CompareHeat[] = [];
  for (const e of entries) {
    const h = heatById.get(e.heat_id);
    const r = h ? roundById.get(h.round_id) : undefined;
    // Round names are data (trap 6); an unnamed round or a dangling id is a
    // defect, dropped loudly as surfer.ts does.
    if (!h || !r || r.name == null) {
      console.error(`compare: heat_entry ${e.id} has no heat, round or round name; left out`);
      continue;
    }
    outHeats.push({
      s: e.surfer_id,
      h: e.heat_id,
      e: r.event_id,
      ro: r.round_order,
      rn: r.name,
      hn: h.heat_number,
      p: e.position,
      t: num(e.heat_total),
      r: residualByEntry.get(e.id) ?? null,
      n: sizeByHeat.get(e.heat_id) ?? 0,
      v: h.venue_id,
    });
  }

  return {
    surfers: surfers
      .map((s) => ({
        id: s.id,
        name: s.full_name,
        slug: s.slug,
        countryCode: s.country_code,
        trim: trimBySurfer.get(s.id)?.trim ?? null,
        trimHalfWidth: trimBySurfer.get(s.id)?.halfWidth ?? null,
        lastHeat: (() => {
          const l = trimBySurfer.get(s.id)?.lastHeat;
          return l ? `${l.eventName} ${l.seasonYear}` : null;
        })(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    events: events.map((e) => ({
      id: e.id,
      seasonYear: e.season_year,
      eventNumber: e.event_number,
      name: e.name,
      slug: e.slug,
      kind: e.kind,
    })),
    venues: venues.map((v) => ({ id: v.id, name: v.name })),
    heats: outHeats,
    placings: placings.map((p) => ({
      s: p.surfer_id,
      e: p.event_id,
      pl: p.event_placing,
      st: p.status,
      pa: p.participation,
    })),
    seasons: [...new Set(events.map((e) => e.season_year))].sort((a, b) => a - b),
  };
});
