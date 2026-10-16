import { cache } from "react";
import { db } from "@/lib/db/server";
import { num } from "@/lib/trim";
import { getSeason } from "@/lib/queries/seasons";
import { getTrimCurrent, type TrimCurrentRow } from "@/lib/queries/home";

/**
 * Data for `/rankings` -- "cumulative and Final Five formats, plus a Trim
 * column" (PROJECT_PLAN.md, M3 scope cap).
 *
 * `season_rankings` holds no rows. What the database holds instead is
 * `event_entries`: one row per surfer per event, with the PUBLISHED points
 * and the PUBLISHED throwaway flag, both read off the retained final-rankings
 * page (artefacts 35 and 105) -- never derived from placings (CLAUDE.md trap
 * 3). The season total is therefore a sum of published figures with the
 * published throwaway left out. Reconciled 9 September 2026: 70 of 70
 * surfer-seasons match the retained page's season total to the point.
 *
 * Two things are derived here and nothing else:
 *   - a points rank, which is the row's position in a sort by total; where
 *     totals tie the rank is shared, because WSL's tiebreak is not in the
 *     database and the published rank is not loaded;
 *   - the Final Five, which is the five highest totals. Their final order is
 *     NOT derived: it is `heat_entries.finished_position` at the season's
 *     WSL Finals event, published per surfer. The champion is the explicit
 *     `seasons.world_champion_surfer_id`, never the points leader.
 *
 * A published-points row with `points` NULL is an entry that earned nothing
 * (not contested, or a wildcard whose result carries no ranking points); it
 * adds zero and is counted in `eventsNotCounted`.
 */

export interface RankingRow {
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  /** Sum of published points over counted events. */
  points: number;
  /** Shared rank by points (1, 2, 2, 4 ...). */
  pointsRank: number;
  /** True when another surfer holds the same total. */
  tied: boolean;
  /** Events at which the surfer's row carries published points that count. */
  eventsCounted: number;
  /** Points of the published throwaway event, or null if none is flagged. */
  thrownPoints: number | null;
  /** Rows present for this surfer whose points did not count (not contested, no points, throwaway). */
  eventsNotCounted: number;
  /** Published finishing position at the WSL Finals, for the five who surfed it. */
  finalsPlacing: number | null;
  /** The explicit champion field. */
  champion: boolean;
  /** Latest Trim per surfer from v_trim_current -- the same figure `/` shows. */
  trim: Pick<TrimCurrentRow, "trim" | "nHeats" | "priorWeight"> | null;
}

export interface SeasonRankings {
  seasonYear: number;
  /** Events whose points count towards the season, in calendar order. */
  countedEvents: { id: number; eventNumber: number; name: string; occursAfterCut: boolean }[];
  finalsEvent: { id: number; name: string; slug: string } | null;
  preCutEventCount: number | null;
  cutAfterEvent: number | null;
  cutSourceGrade: string | null;
  /** eras.throwaway_form / throwaway_eligibility for the season's era. */
  throwaway: { form: string | null; eligibility: string | null } | null;
  champion: { surferId: number; fullName: string; slug: string } | null;
  rows: RankingRow[];
  /** Surfers with a finished_position at the Finals who are not the five highest totals -- a discrepancy to show, never to hide. */
  finalsFieldDisagreement: string[];
  entryRowCount: number;
}

export const getSeasonRankings = cache(async (seasonYear: number): Promise<SeasonRankings | null> => {
  const season = await getSeason(seasonYear);
  if (!season) return null;

  const [events, era, trimCurrent] = await Promise.all([
    db
      .from("events")
      .select("id, event_number, name, slug, kind, awards_ranking_points, occurs_after_cut")
      .eq("season_year", seasonYear)
      .order("event_number", { ascending: true }),
    db.from("eras").select("throwaway_form, throwaway_eligibility").eq("code", season.era_code).limit(1),
    getTrimCurrent(),
  ]);
  if (events.error) throw new Error(`events query failed: ${events.error.message}`);
  if (era.error) throw new Error(`eras query failed: ${era.error.message}`);

  const countedEvents = events.data.filter((e) => e.awards_ranking_points);
  const countedIds = new Set(countedEvents.map((e) => e.id));
  const finals = events.data.filter((e) => e.kind === "wsl_finals");
  if (finals.length > 1) {
    console.error(`season ${seasonYear} carries ${finals.length} wsl_finals events`);
  }
  const finalsEvent = finals.length === 1 ? finals[0] : null;

  const entries = events.data.length
    ? await db
        .from("event_entries")
        .select("event_id, surfer_id, points, points_status, throwaway_published")
        .in("event_id", events.data.map((e) => e.id))
    : { data: [], error: null };
  if (entries.error) throw new Error(`event_entries query failed: ${entries.error.message}`);

  // Finals placings: finished_position on the Finals event's heat entries.
  let finalsPlacing = new Map<number, number>();
  if (finalsEvent) {
    const rounds = await db.from("rounds").select("id").eq("event_id", finalsEvent.id);
    if (rounds.error) throw new Error(`rounds query failed: ${rounds.error.message}`);
    const heats = rounds.data.length
      ? await db.from("heats").select("id").in("round_id", rounds.data.map((r) => r.id))
      : { data: [], error: null };
    if (heats.error) throw new Error(`heats query failed: ${heats.error.message}`);
    const he = heats.data.length
      ? await db
          .from("heat_entries")
          .select("surfer_id, finished_position")
          .in("heat_id", heats.data.map((h) => h.id))
          .not("finished_position", "is", null)
      : { data: [], error: null };
    if (he.error) throw new Error(`heat_entries query failed: ${he.error.message}`);
    finalsPlacing = new Map<number, number>();
    for (const x of he.data) {
      if (x.finished_position == null) continue;
      const prev = finalsPlacing.get(x.surfer_id);
      if (prev != null && prev !== x.finished_position) {
        console.error(`surfer ${x.surfer_id} carries two finished_positions at event ${finalsEvent.id}`, prev, x.finished_position);
      }
      finalsPlacing.set(x.surfer_id, x.finished_position);
    }
  }

  const surferIds = new Set<number>(entries.data.map((x) => x.surfer_id));
  for (const id of finalsPlacing.keys()) surferIds.add(id);
  if (season.world_champion_surfer_id != null) surferIds.add(season.world_champion_surfer_id);
  const surfers = surferIds.size
    ? await db.from("surfers").select("id, full_name, slug, country_code").in("id", [...surferIds])
    : { data: [], error: null };
  if (surfers.error) throw new Error(`surfers query failed: ${surfers.error.message}`);
  const surferById = new Map(surfers.data.map((s) => [s.id, s]));
  const trimBySurfer = new Map(trimCurrent.map((t) => [t.surferId, t]));

  type Acc = { points: number; counted: number; notCounted: number; thrown: number | null };
  const acc = new Map<number, Acc>();
  for (const x of entries.data) {
    const a = acc.get(x.surfer_id) ?? { points: 0, counted: 0, notCounted: 0, thrown: null };
    const pts = num(x.points);
    const counts = countedIds.has(x.event_id) && x.throwaway_published !== true && pts != null;
    if (counts) {
      a.points += pts;
      a.counted += 1;
    } else {
      a.notCounted += 1;
      if (x.throwaway_published === true) {
        if (a.thrown != null) console.error(`surfer ${x.surfer_id} carries two published throwaways in ${seasonYear}`);
        a.thrown = pts;
      }
    }
    acc.set(x.surfer_id, a);
  }

  const rows: RankingRow[] = [];
  for (const [surferId, a] of acc) {
    const s = surferById.get(surferId);
    if (!s) {
      console.error("event_entries row whose surfer is not in surfers", surferId);
      continue;
    }
    const t = trimBySurfer.get(surferId);
    rows.push({
      surferId,
      fullName: s.full_name,
      slug: s.slug,
      countryCode: s.country_code,
      points: a.points,
      pointsRank: 0,
      tied: false,
      eventsCounted: a.counted,
      thrownPoints: a.thrown,
      eventsNotCounted: a.notCounted,
      finalsPlacing: finalsPlacing.get(surferId) ?? null,
      champion: season.world_champion_surfer_id === surferId,
      trim: t ? { trim: t.trim, nHeats: t.nHeats, priorWeight: t.priorWeight } : null,
    });
  }
  rows.sort((a, b) => b.points - a.points || a.fullName.localeCompare(b.fullName));
  // Shared rank: rows with equal totals share the rank of the first of them.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i > 0 && rows[i - 1].points === r.points) {
      r.pointsRank = rows[i - 1].pointsRank;
      r.tied = true;
      rows[i - 1].tied = true;
    } else {
      r.pointsRank = i + 1;
    }
  }

  // The Finals field should be the five highest totals; if it is not, say so.
  const topFive = new Set(rows.slice(0, 5).map((r) => r.surferId));
  const finalsFieldDisagreement: string[] = [];
  for (const id of finalsPlacing.keys()) {
    if (!topFive.has(id)) finalsFieldDisagreement.push(surferById.get(id)?.full_name ?? String(id));
  }
  for (const r of rows.slice(0, 5)) {
    if (finalsPlacing.size > 0 && !finalsPlacing.has(r.surferId)) finalsFieldDisagreement.push(r.fullName);
  }

  const champ =
    season.world_champion_surfer_id != null ? surferById.get(season.world_champion_surfer_id) : undefined;

  return {
    seasonYear,
    countedEvents: countedEvents.map((e) => ({
      id: e.id,
      eventNumber: e.event_number,
      name: e.name,
      occursAfterCut: e.occurs_after_cut,
    })),
    finalsEvent: finalsEvent ? { id: finalsEvent.id, name: finalsEvent.name, slug: finalsEvent.slug } : null,
    preCutEventCount: season.pre_cut_event_count,
    cutAfterEvent: season.cut_after_event,
    cutSourceGrade: season.cut_source_grade,
    throwaway: era.data[0]
      ? { form: era.data[0].throwaway_form, eligibility: era.data[0].throwaway_eligibility }
      : null,
    champion: champ ? { surferId: champ.id, fullName: champ.full_name, slug: champ.slug } : null,
    rows,
    finalsFieldDisagreement,
    entryRowCount: entries.data.length,
  };
});

/**
 * The published final order: the Finals field by finished_position, then
 * everyone else by points. Rule 1.05(e), as the format spec records it;
 * applied here only where a finished_position is published, never assumed.
 */
export function finalFiveOrder(rows: RankingRow[]): RankingRow[] {
  const finalists = rows.filter((r) => r.finalsPlacing != null).sort((a, b) => a.finalsPlacing! - b.finalsPlacing!);
  const rest = rows.filter((r) => r.finalsPlacing == null);
  return [...finalists, ...rest];
}
