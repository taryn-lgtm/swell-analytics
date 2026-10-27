/**
 * manifest.ts — read an event manifest written by collect_event.ts
 *
 * Shared so there is exactly one parser. The retention module exists for the
 * same reason: two copies drift, and the copy that drifts is the one that
 * silently stops checking something.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { MANIFEST_DIR, REPO_ROOT, fail, isRecord } from "./retain.ts";

export interface RoundFromManifest {
  /**
   * `null` means "the results page itself, with no roundId parameter".
   * The WSL Finals is one page with no round navigation, so it has one
   * pseudo-round and no id to pass. Every ordinary event still carries a
   * string here.
   */
  round_id: string | null;
  round_name_gtm: string | null;
  counting_waves_present: boolean;
  heat_ids: string[];
  file_path: string;
  /** Set when this round's heats are served by another round's page. */
  served_by_round_page?: string;
  /**
   * Heats with no Details link of their own, reached from inside another
   * heat's popup: the WSL Finals Title Match heats after the first. Each names
   * the heat whose popup links to it and the totals the results page publishes
   * for it, which the collector holds the capture to.
   */
  series_follow_on: SeriesFollowOn[];
}

export interface SeriesFollowOn {
  heat_id: string;
  parent_heat_id: string;
  heat_number: number;
  /** WSL athlete id -> heat total, as the series block on the results page publishes them. */
  expected_totals: Record<string, number>;
}

export interface EventFromManifest {
  stem: string;
  name: string;
  wslEventId: number;
  season: number;
  eventNumber: number;
  resultsUrl: string | null;
  /**
   * The URL Tier 2 must actually drive the browser to.
   *
   * Every CT event is a joint men's/women's event and the spec's results_url
   * carries no statEventId, so the site picks a division. Building round URLs
   * from results_url therefore sends the popup collector to whichever division
   * WSL defaults to -- the men's on 19 of 20 events, the WOMEN'S on 2025 event 6.
   *
   * collect_event.ts writes the chosen men's URL into the manifest as
   * division.url. Manifests written before 26 August 2026 have no division
   * block; those fall back to results_url, which is what they were collected
   * with, so nothing already retained changes meaning.
   */
  collectionUrl: string | null;
  rounds: RoundFromManifest[];
}

/**
 * The men's-division URL recorded by collect_event.ts, or null when the
 * manifest predates the division block or the event carries no toggle.
 */
function divisionUrl(parsed: Record<string, unknown>): string | null {
  const d = parsed.division;
  if (!isRecord(d)) return null;
  if (d.joint_event !== true) return null;
  return typeof d.url === "string" ? d.url : null;
}

export function loadEventManifest(season: number, eventNumber: number): EventFromManifest {
  if (!existsSync(MANIFEST_DIR)) {
    fail(`no manifests directory. Run collect_event.ts first — event pages before heat pages.`);
  }
  const candidates = readdirSync(MANIFEST_DIR).filter(
    (f) => f.endsWith(".json") && !f.endsWith("_heats.json") && !f.endsWith("_popups.json"),
  );

  for (const file of candidates) {
    const parsed: unknown = JSON.parse(readFileSync(join(MANIFEST_DIR, file), "utf8"));
    if (!isRecord(parsed)) continue;
    if (parsed.season !== season) continue;
    const ev = parsed.event;
    if (!isRecord(ev) || ev.number !== eventNumber) continue;

    const roundsRaw = parsed.rounds;
    if (!Array.isArray(roundsRaw)) fail(`${file} has no rounds array`);

    const rounds: RoundFromManifest[] = [];
    for (const r of roundsRaw) {
      if (!isRecord(r)) continue;
      const art = r.artefact;
      if (!isRecord(art) || typeof art.file_path !== "string") {
        fail(`${file}: a round record has no artefact.file_path`);
      }
      rounds.push({
        round_id: r.round_id === null ? null : String(r.round_id),
        round_name_gtm: typeof r.round_name_gtm === "string" ? r.round_name_gtm : null,
        counting_waves_present: r.counting_waves_present === true,
        heat_ids: Array.isArray(r.heat_ids) ? r.heat_ids.map(String) : [],
        file_path: art.file_path,
        served_by_round_page:
          typeof r.served_by_round_page === "string" ? r.served_by_round_page : undefined,
        series_follow_on: Array.isArray(r.series_follow_on)
          ? r.series_follow_on.filter(isRecord).map((s) => ({
              heat_id: String(s.heat_id),
              parent_heat_id: String(s.parent_heat_id),
              heat_number: Number(s.heat_number),
              expected_totals: isRecord(s.expected_totals)
                ? Object.fromEntries(Object.entries(s.expected_totals).map(([k, v]) => [k, Number(v)]))
                : {},
            }))
          : [],
      });
    }

    return {
      stem: file.replace(/\.json$/, ""),
      name: typeof ev.name === "string" ? ev.name : "unknown",
      wslEventId: typeof ev.wsl_event_id === "number" ? ev.wsl_event_id : 0,
      season,
      eventNumber,
      resultsUrl: typeof ev.results_url === "string" ? ev.results_url : null,
      collectionUrl: divisionUrl(parsed) ?? (typeof ev.results_url === "string" ? ev.results_url : null),
      rounds,
    };
  }

  fail(
    `no manifest for season ${season} event ${eventNumber} in ` +
      `${relative(REPO_ROOT, MANIFEST_DIR)}. Run: ` +
      `tsx scripts/collect_event.ts --season ${season} --event ${eventNumber}`,
  );
}
