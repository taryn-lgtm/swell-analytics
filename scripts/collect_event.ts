#!/usr/bin/env tsx
/**
 * collect_event.ts — Tier 1 collection harness for one Championship Tour event
 *
 * WHAT THIS IS
 *   The retention half of acquisition. It fetches an event's results pages and
 *   writes raw bytes to disk with a provenance sidecar BEFORE anything parses
 *   them. It does not produce database rows for competition data — that is the
 *   ingest layer's job, and it does not exist yet.
 *
 *   The only parsing done here is the minimum needed to (a) discover which
 *   rounds an event has and (b) count what landed, so retention can be checked
 *   against what the source itself declares.
 *
 * WHY ROUNDS ARE DISCOVERED, NOT ASSUMED
 *   The results URL returns ONE round. CLAUDE.md's acquisition estimate assumed
 *   seven rounds per pre-cut event. The retained Pipe 2025 page does not support
 *   that: its round nav carries three items, the third labelled "Bracket".
 *   Nothing here hardcodes a round count, a round name, or a round order. The
 *   nav is read, and if it cannot be read the script fails rather than guessing.
 *   Trap 6: round names are data, never an enum.
 *
 * WHAT IT ASSERTS (and fails on)
 *   - the round nav container exists and is the ROUND nav, not the men's/women's
 *     toggle nav, which reuses the same item class
 *   - the number of items parsed equals the nav's own data-num-items
 *   - the last item carries the `last` class, which is the page's own evidence
 *     that the nav is complete server-side and not truncated
 *   - every item's GTM blob says MCT / M. A women's round id would otherwise be
 *     collected silently under a men's event.
 *   - the GTM round_ids agrees with the roundId in the href
 *
 * WHAT IT DOES NOT DO
 *   - it does not write to the database, and it does not emit SQL. Registering
 *     retained pages in `artefacts` is scripts/register_artefacts.ts. Rule 6.
 *   - it does not follow ?heatId= (Tier 2, M2 depth, not M1)
 *   - it does not modify anything under docs/format-spec/
 *
 * PROVENANCE IS CARRIED, NOT FLATTENED
 *   A retained page may be a wire-level script capture or a Chrome "Save As",
 *   and those are not the same evidence. The reuse path reads `retrieval` and
 *   any `provenance_warning` from the sidecar and carries both into the
 *   manifest. Reusing a manual save is fine; reporting it as a script capture
 *   is not.
 *
 * Usage:
 *   tsx scripts/collect_event.ts --season 2025 --event 1
 *   tsx scripts/collect_event.ts --season 2025 --event 1 --no-fetch
 *   tsx scripts/collect_event.ts --season 2025 --event 1 --delay 5000
 *   tsx scripts/collect_event.ts --season 2025 --event 1 --explicit-first-round
 *   tsx scripts/collect_event.ts --season 2025 --event 1 --max-fetches 1
 *
 * --no-fetch re-reads the retained artefacts and touches no network. A sidecar
 * hash mismatch is a hard failure: it means an artefact changed after capture.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import yaml from "js-yaml";
import {
  MANIFEST_DIR,
  REPO_ROOT,
  type Artefact,
  type RetainOptions,
  classMarkerCount,
  decodeEntities,
  fail,
  isRecord,
  retrieve,
  sleep,
  stripTags,
} from "./lib/retain.ts";
import { verifyControls } from "./lib/controls.ts";

const SEASONS_DIR = join(REPO_ROOT, "docs/format-spec/seasons");
const RAW_DIR_LOCAL = join(REPO_ROOT, "docs/sources/raw");

const USER_AGENT =
  "wsl-analytics-research/0.1 (tier 1 event collection; +https://github.com/taryn-lgtm/swell-analytics)";
const SCRIPT_NAME = "scripts/collect_event.ts";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  season: number;
  event: number;
  fetch: boolean;
  refetch: boolean;
  explicitFirstRound: boolean;
  delayMs: number;
  maxFetches: number;
}

function parseArgs(argv: string[]): Args {
  let season: number | null = null;
  let event: number | null = null;
  let doFetch = true;
  let refetch = false;
  let explicitFirstRound = false;
  let delayMs = 3000;
  let maxFetches = Number.POSITIVE_INFINITY;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--season") season = Number(argv[++i]);
    else if (arg === "--event") event = Number(argv[++i]);
    else if (arg === "--delay") delayMs = Number(argv[++i]);
    else if (arg === "--max-fetches") maxFetches = Number(argv[++i]);
    else if (arg === "--no-fetch") doFetch = false;
    else if (arg === "--fetch") doFetch = true;
    else if (arg === "--refetch") refetch = true;
    else if (arg === "--explicit-first-round") explicitFirstRound = true;
    else fail(`unrecognised argument: ${arg}`);
  }

  if (season === null || !Number.isInteger(season)) {
    fail("--season <year> is required");
  }
  if (event === null || !Number.isInteger(event)) {
    fail("--event <event number> is required (the season event number, not the WSL event id)");
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    fail(`--delay must be a non-negative number of milliseconds, got ${delayMs}`);
  }
  return {
    season: season!,
    event: event!,
    fetch: doFetch,
    refetch,
    explicitFirstRound,
    delayMs,
    maxFetches,
  };
}

// ---------------------------------------------------------------------------
// Spec loading
//
// The event list, the WSL event id and the results URL are read from the season
// YAML. None of them is constructed here. Trap 1: event ids are not in event
// order in 2022, so the URL must come from the spec and never be derived.
// ---------------------------------------------------------------------------

interface SpecEvent {
  number: number;
  wsl_event_id: number;
  name: string;
  results_url: string;
}

function loadEvent(season: number, eventNumber: number): SpecEvent {
  const path = join(SEASONS_DIR, `${season}.yaml`);
  if (!existsSync(path)) {
    fail(`no season spec at ${relative(REPO_ROOT, path)}`);
  }
  const doc = yaml.load(readFileSync(path, "utf8"));
  if (!isRecord(doc)) fail(`${relative(REPO_ROOT, path)} did not parse to a mapping`);

  const events = doc.events;
  if (!Array.isArray(events)) {
    fail(`${relative(REPO_ROOT, path)} has no \`events\` list`);
  }

  const found = events.find(
    (e): e is Record<string, unknown> => isRecord(e) && e.number === eventNumber,
  );
  if (!found) {
    const numbers = events
      .filter(isRecord)
      .map((e) => String(e.number))
      .join(", ");
    fail(`season ${season} has no event number ${eventNumber}. Available: ${numbers}`);
  }

  const { wsl_event_id, name, results_url } = found;
  if (typeof wsl_event_id !== "number") {
    fail(`event ${eventNumber} has no numeric wsl_event_id in the spec`);
  }
  if (typeof name !== "string") {
    fail(`event ${eventNumber} has no name in the spec`);
  }
  if (typeof results_url !== "string" || results_url.length === 0) {
    fail(
      `event ${eventNumber} (${String(name)}) has no results_url in the spec. ` +
        `Add it to ${relative(REPO_ROOT, path)} — this script will not construct one.`,
    );
  }
  return { number: eventNumber, wsl_event_id, name, results_url };
}

/** `…/events/2025/ct/320/lexus-pipe-pro/results` -> `lexus-pipe-pro` */
function eventSlugFromUrl(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("results");
  if (idx < 1) fail(`cannot read an event slug from ${url}`);
  return parts[idx - 1];
}

// ---------------------------------------------------------------------------
// Round-nav discovery
// ---------------------------------------------------------------------------

const ROUND_NAV_CLASS = "post-event-watch-round-nav__items";
const ITEM_CLASS = "post-event-watch-round-nav__item";
// The men's/women's division toggle. It reuses ITEM_CLASS, which is why
// parseRoundNav anchors on ROUND_NAV_CLASS to avoid it. Here we want it.
const TOGGLE_ITEMS_CLASS = "post-event-watch-round-nav__toggle-items";

/**
 * Return the inner HTML of the <div> whose opening tag starts at `openIdx`.
 * A depth scan over <div/</div>, which is correct for this page's well-formed
 * server-rendered markup and avoids taking a DOM dependency for one selector.
 */
function divInnerHtml(html: string, openIdx: number): string {
  const tagEnd = html.indexOf(">", openIdx);
  if (tagEnd === -1) fail("malformed markup: unterminated <div> in the round nav");

  let depth = 1;
  let i = tagEnd + 1;
  const start = i;
  const re = /<\/?div\b/gi;
  re.lastIndex = i;

  for (;;) {
    const m = re.exec(html);
    if (!m) fail("malformed markup: round nav <div> never closes");
    if (m[0].toLowerCase().startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
    i = re.lastIndex;
  }
}

interface GtmBlob {
  round_ids?: string;
  round_names?: string;
  round_numbers?: string;
  tour_codes?: string;
  tour_genders?: string;
  click_text?: string;
}

function parseGtm(chunk: string): GtmBlob | null {
  const m = /data-gtm-event="([^"]*)"/.exec(chunk);
  if (!m) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeEntities(m[1]));
  } catch {
    return null;
  }
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  return isRecord(obj) ? (obj as GtmBlob) : null;
}

interface NavRound {
  itemIndex: number;
  roundId: string;
  href: string;
  nameDisplayed: string | null;
  nameGtm: string | null;
  numberGtm: string | null;
  heatsDeclared: number | null;
  heatsDeclaredText: string | null;
  statusText: string | null;
  isLast: boolean;
}

interface NavResult {
  declaredNumItems: number | null;
  rounds: NavRound[];
  lastItemHasLastClass: boolean;
  tourCodes: string[];
  tourGenders: string[];
}

function parseRoundNav(html: string): NavResult {
  // The men's/women's toggle nav reuses ITEM_CLASS but sits inside
  // `…__toggle-items`. Anchor on the exact round-nav container class.
  const containerIdx = html.indexOf(`class="${ROUND_NAV_CLASS} `);
  if (containerIdx === -1) {
    fail(
      `no round nav found (looked for class="${ROUND_NAV_CLASS} "). ` +
        `Either the page shape changed or this is not a results page. ` +
        `The artefact is retained — inspect it before changing this selector.`,
    );
  }
  const divStart = html.lastIndexOf("<div", containerIdx);
  const inner = divInnerHtml(html, divStart);

  // data-num-items lives on the enclosing scroll-nav, just before the container.
  let declaredNumItems: number | null = null;
  const before = html.slice(Math.max(0, divStart - 1200), divStart);
  const numMatches = [...before.matchAll(/data-num-items="(\d+)"/g)];
  if (numMatches.length > 0) {
    declaredNumItems = Number(numMatches[numMatches.length - 1][1]);
  }

  const chunks = inner
    .split(new RegExp(`<div[^>]*class="${ITEM_CLASS}\\b`))
    .slice(1);

  const rounds: NavRound[] = [];
  const tourCodes = new Set<string>();
  const tourGenders = new Set<string>();
  let lastItemHasLastClass = false;

  chunks.forEach((chunk, i) => {
    const href = /href="([^"]*roundId=(\d+)[^"]*)"/.exec(chunk);
    if (!href) {
      fail(
        `round nav item ${i} has no roundId in its href. Not skipped — a nav ` +
          `item without a round is a parse failure, not an empty round.`,
      );
    }
    const idxAttr = /data-item-index="(\d+)"/.exec(chunk);
    const gtm = parseGtm(chunk);
    if (gtm?.tour_codes) tourCodes.add(gtm.tour_codes);
    if (gtm?.tour_genders) tourGenders.add(gtm.tour_genders);

    const nameSpan = /<span class="round-name">([\s\S]*?)<\/span>/.exec(chunk);
    const heatsSpan = /<span class="round-heats">([\s\S]*?)<\/span>/.exec(chunk);
    const statusSpan = /<span class="round-status[^"]*">([\s\S]*?)<\/span>/.exec(chunk);

    const heatsText = heatsSpan ? stripTags(heatsSpan[1]) : null;
    const heatsNum = heatsText ? /(\d+)/.exec(heatsText) : null;

    // The item's own class list runs to the first quote of this chunk.
    const classTail = chunk.slice(0, chunk.indexOf('"'));
    const isLast = /\blast\b/.test(classTail);
    if (isLast) lastItemHasLastClass = true;

    rounds.push({
      itemIndex: idxAttr ? Number(idxAttr[1]) : i,
      roundId: href[2],
      href: decodeEntities(href[1]),
      nameDisplayed: nameSpan ? stripTags(nameSpan[1]) : null,
      nameGtm: gtm?.round_names ?? gtm?.click_text ?? null,
      numberGtm: gtm?.round_numbers ?? null,
      heatsDeclared: heatsNum ? Number(heatsNum[1]) : null,
      heatsDeclaredText: heatsText,
      statusText: statusSpan ? stripTags(statusSpan[1]) : null,
      isLast,
    });
  });

  if (rounds.length === 0) {
    fail("round nav container found but it holds no items — refusing to treat that as an event with no rounds");
  }
  return {
    declaredNumItems,
    rounds,
    lastItemHasLastClass,
    tourCodes: [...tourCodes],
    tourGenders: [...tourGenders],
  };
}

/**
 * The men's/women's division toggle.
 *
 * EVERY CT results page is a joint event. Measured 26 August 2026 over the 22
 * retained base pages: 20 of 20 CT events carry this toggle with two items, one
 * per division; only the two WSL Finals pages do not. The URL without a
 * statEventId serves ONE division, and which one is the site's choice rather
 * than ours -- 19 of 20 default to the men's, and 2025 event 6 (Bonsoy Gold
 * Coast Pro) defaults to the women's.
 *
 * So every event collected before 26 August 2026 was collected by relying on an
 * undeclared default that happened to be right nineteen times. The MCT/M
 * assertion in assertNav caught the twentieth and refused it, which is why the
 * Gold Coast event is absent rather than wrong.
 *
 * The men's link is published, in an href, titled "Men's Heats". It is READ,
 * never derived. Note that the men's statEventId is, in all 20 observed pairs,
 * the lower and even member (4780/4781, 4782/4783, 4446/4447). That pattern is
 * NOT used here and must not be: it is an inference over 20 rows about an id
 * space we do not own, and the title is right there in the markup.
 */
interface DivisionItem {
  title: string;
  href: string;
  statEventId: string | null;
  servedByBareUrl: boolean;
}

interface DivisionChoice {
  url: string;
  statEventId: string | null;
  followedToggle: boolean;
  items: DivisionItem[];
}

const MENS_TITLE = /^men's heats$/i;

function parseDivisionToggle(html: string): DivisionItem[] {
  const containerIdx = html.indexOf(`class="${TOGGLE_ITEMS_CLASS}`);
  if (containerIdx === -1) return [];
  const divStart = html.lastIndexOf("<div", containerIdx);
  const inner = divInnerHtml(html, divStart);

  const chunks = inner.split(new RegExp(`<div[^>]*class="${ITEM_CLASS}\\b`)).slice(1);
  const items: DivisionItem[] = [];
  chunks.forEach((chunk, i) => {
    const href = /href="([^"]*)"/.exec(chunk);
    const title = /title="([^"]*)"/.exec(chunk);
    if (!href || !title) {
      fail(
        `division toggle item ${i} has no href or no title. Not skipped -- the ` +
          `toggle is how a division is chosen, and a half-read toggle picks one ` +
          `silently, which is the failure this whole function exists to stop.`,
      );
    }
    const url = decodeEntities(href[1]);
    const stat = /statEventId=(\d+)/.exec(url);
    const classTail = chunk.slice(0, chunk.indexOf('"'));
    items.push({
      title: decodeEntities(title[1]).replace(/\u2019/g, "'").trim(),
      href: url,
      statEventId: stat ? stat[1] : null,
      servedByBareUrl: /\bselected\b/.test(classTail),
    });
  });
  return items;
}

/**
 * Returns the men's division URL, or null when the page carries no toggle at
 * all (the Finals). Fails rather than guessing if the toggle is not exactly one
 * "Men's Heats" item.
 */
function chooseMensDivision(html: string, pageUrl: string): DivisionChoice | null {
  const items = parseDivisionToggle(html);
  if (items.length === 0) return null;

  const mens = items.filter((it) => MENS_TITLE.test(it.title));
  if (mens.length !== 1) {
    fail(
      `division toggle holds ${items.length} item(s) ` +
        `[${items.map((i) => i.title).join(", ")}] and ${mens.length} titled ` +
        `"Men's Heats". Exactly one is required. The artefact is retained -- ` +
        `read it before loosening this.`,
    );
  }
  const chosen = mens[0];
  if (chosen.statEventId === null) {
    fail(`the "Men's Heats" toggle item carries no statEventId: ${chosen.href}`);
  }
  return {
    url: new URL(chosen.href, pageUrl).toString(),
    statEventId: chosen.statEventId,
    followedToggle: !chosen.servedByBareUrl,
    items,
  };
}

/**
 * Assertions. Each one exists because the alternative is a silent wrong answer.
 */
function assertNav(nav: NavResult): string[] {
  const warnings: string[] = [];

  if (nav.declaredNumItems === null) {
    warnings.push("nav carried no data-num-items — item count could not be cross-checked");
  } else if (nav.declaredNumItems !== nav.rounds.length) {
    fail(
      `round nav declares data-num-items="${nav.declaredNumItems}" but ${nav.rounds.length} ` +
        `items parsed. A short parse is a failure, never a round that does not exist.`,
    );
  }

  if (!nav.lastItemHasLastClass) {
    fail(
      `no nav item carries the \`last\` class, so the nav itself may be truncated. ` +
        `Note this is only a claim about the NAV: even a complete nav is not the ` +
        `complete round list — see roundsFromHeats().`,
    );
  }

  const indices = nav.rounds.map((r) => r.itemIndex).sort((a, b) => a - b);
  indices.forEach((v, i) => {
    if (v !== i) fail(`nav item indices are not contiguous from 0: got [${indices.join(", ")}]`);
  });

  if (nav.tourCodes.length !== 1 || nav.tourCodes[0] !== "MCT") {
    fail(
      `expected every nav item to be MCT, got [${nav.tourCodes.join(", ")}]. ` +
        `The men's/women's toggle may have been followed.`,
    );
  }
  if (nav.tourGenders.length !== 1 || nav.tourGenders[0] !== "M") {
    fail(`expected every nav item to be tour_genders "M", got [${nav.tourGenders.join(", ")}]`);
  }

  for (const r of nav.rounds) {
    if (r.nameGtm === null) {
      warnings.push(`round ${r.roundId}: no round name in the GTM blob`);
    }
    if (r.nameDisplayed !== null && r.nameGtm !== null && r.nameDisplayed !== r.nameGtm) {
      // Not an error. Pipe 2025 renders "Bracket" over a GTM name of
      // "Round of 32". Both are recorded; neither is collapsed into the other.
      warnings.push(
        `round ${r.roundId}: displayed name "${r.nameDisplayed}" differs from GTM name "${r.nameGtm}" — both recorded, neither resolved`,
      );
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Counting what landed
//
// Not a parser. Two counts, used only to check retention against what the page
// itself declares. Heat contents are the ingest layer's problem.
// ---------------------------------------------------------------------------

function heatIds(html: string): string[] {
  return [...html.matchAll(/data-heat-id="(\d+)"/g)].map((m) => m[1]);
}

/**
 * Athlete records on the page. The list view and the bracket view use
 * different inner markup — the bracket carries no `__details` — so counting
 * `__details` reported 0 athletes on a page holding 124. Count the athlete
 * element itself, which both views share.
 */
function athleteBlockCount(html: string): number {
  // Goes through classMarkerCount so docs/sources/controls.json actually guards
  // this. A control that exercises a copy of the logic instead of the logic is
  // decoration: the first version of this function used its own regex, and the
  // control passed while the function was broken.
  return classMarkerCount(html, "hot-heat-athlete");
}

function selectedRoundId(html: string): string | null {
  const m = /data-round-id="(\d+)"/.exec(html);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Rounds hidden behind the bracket
//
// The nav is NOT the round list. On Pipe 2025 it carries three items while the
// event has seven rounds: the third nav item is a bracket view holding R32,
// R16, QF, SF and the Final together. Those four extra rounds have real WSL
// round ids and names, and the only place they appear is the per-heat GTM blob
// on each heat's Details link:
//
//   "round_names":"Final","round_numbers":"7","round_ids":"24745",
//   "heat_ids":"104750","athlete-ids":"3962,2656"
//
// So round discovery cannot stop at the nav. Every retained page is mined for
// round ids, and any id not yet retained is queued. Discovered 8 August, after
// the nav's `last` class was taken as evidence the round list was complete —
// it is evidence the NAV is complete, which is a different claim.
// ---------------------------------------------------------------------------

interface HeatAttribution {
  heatId: string;
  roundId: string | null;
  roundName: string | null;
  roundNumber: string | null;
  heatNumber: string | null;
  athleteIds: string[];
}

/** Heat-level GTM blobs. Single-quoted attribute, so no entity decoding needed. */
function heatAttributions(html: string): HeatAttribution[] {
  const out = new Map<string, HeatAttribution>();
  for (const m of html.matchAll(/data-gtm-event='(\{[^']*\})'/g)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    const heatId = parsed.heat_ids;
    if (typeof heatId !== "string" || heatId.length === 0) continue;
    if (out.has(heatId)) continue;
    const ids = parsed["athlete-ids"];
    out.set(heatId, {
      heatId,
      roundId: typeof parsed.round_ids === "string" ? parsed.round_ids : null,
      roundName: typeof parsed.round_names === "string" ? parsed.round_names : null,
      roundNumber: typeof parsed.round_numbers === "string" ? parsed.round_numbers : null,
      heatNumber: typeof parsed.heat_numbers === "string" ? parsed.heat_numbers : null,
      athleteIds: typeof ids === "string" && ids.length > 0 ? ids.split(",") : [],
    });
  }
  return [...out.values()];
}

interface DiscoveredRound {
  roundId: string;
  name: string | null;
  number: string | null;
  heatIdsAttributed: string[];
}

function roundsFromHeats(html: string): DiscoveredRound[] {
  const byRound = new Map<string, DiscoveredRound>();
  for (const h of heatAttributions(html)) {
    if (h.roundId === null) continue;
    const existing = byRound.get(h.roundId);
    if (existing) existing.heatIdsAttributed.push(h.heatId);
    else
      byRound.set(h.roundId, {
        roundId: h.roundId,
        name: h.roundName,
        number: h.roundNumber,
        heatIdsAttributed: [h.heatId],
      });
  }
  return [...byRound.values()].sort(
    (a, b) => Number(a.number ?? 0) - Number(b.number ?? 0),
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

interface RoundRecord {
  item_index: number;
  /** "nav" if the round nav listed it, "bracket-heat-blob" if only a heat did. */
  discovered_via: string;
  heats_attributed_here: string[];
  round_id: string;
  round_name_displayed: string | null;
  round_name_gtm: string | null;
  round_number_gtm: string | null;
  round_status_text: string | null;
  heats_declared: number | null;
  /** data-heat-id occurrences. The bracket view renders each heat twice. */
  heat_id_rows: number;
  heats_observed: number;
  heats_agree: boolean | null;
  spans_multiple_rounds: boolean;
  heat_ids: string[];
  athlete_blocks: number;
  /** M1 item 5 lives or dies on this one. */
  counted_waves: number;
  progression_strings: number;
  interference_markers: number;
  counting_waves_present: boolean;
  artefact: {
    slug: string;
    url: string;
    file_path: string;
    sha256: string;
    fetched_at: string;
    http_status: number | null;
    content_type: string | null;
    content_length: number;
    retrieval: string | null;
    provenance_warning: string | null;
  };
  served_by_base_page: boolean;
  /** Slug of the page that already held this round's heats, if any. */
  served_by_round_page?: string;
  fetched_this_run: boolean;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ev = loadEvent(args.season, args.event);
  const slug = eventSlugFromUrl(ev.results_url);
  const stem = `${args.season}_ct_${ev.wsl_event_id}_${slug.replace(/-/g, "_")}_results`;

  const opts: RetainOptions = {
    fetch: args.fetch,
    refetch: args.refetch,
    scriptName: SCRIPT_NAME,
    userAgent: USER_AGENT,
  };

  // Selectors are verified against known-present artefacts BEFORE anything is
  // counted. A broken selector must not be allowed to report zero.
  verifyControls();

  console.log(`\n${args.season} CT event ${ev.number} — ${ev.name} (WSL id ${ev.wsl_event_id})`);
  console.log(`  ${ev.results_url}`);
  console.log(args.fetch ? `  network: ON, ${args.delayMs}ms between fetches` : "  network: OFF (--no-fetch)");
  console.log("");

  // 1. Base results page. Retained before it is read.
  let base = await retrieve(ev.results_url, stem, opts, "Event results page, default round.");

  // 1b. Division. The spec's results_url carries no statEventId, so the site
  //     chooses a division for us. Read the toggle and follow the published
  //     men's link when the bare URL served the other one. BOTH pages are
  //     retained: what the site served, and what we asked for.
  let divisionUrl = ev.results_url;
  let divisionFetches = 0;
  const division = chooseMensDivision(base.html, base.url);
  if (division === null) {
    console.log("  division: no toggle on this page -- not a joint event");
  } else {
    console.log(
      "  division: " +
        division.items
          .map(
            (i) =>
              `${i.title}=statEventId:${i.statEventId ?? "?"}${i.servedByBareUrl ? " (served by the bare URL)" : ""}`,
          )
          .join("   "),
    );
    divisionUrl = division.url;
    if (division.followedToggle) {
      console.log(
        `  division: the bare URL served the other division. Following the ` +
          `published "Men's Heats" link, statEventId=${division.statEventId}. ` +
          `The page already retained is kept -- it is the evidence for this.`,
      );
      const womens = base;
      base = await retrieve(
        division.url,
        `${stem}_stat${division.statEventId}`,
        opts,
        `Event results page, men's division (statEventId=${division.statEventId}), default round. ` +
          `Reached from the division toggle on ${womens.slug}.`,
      );
      if (!base.reused) {
        divisionFetches = 1;
        if (args.fetch && args.delayMs > 0) await sleep(args.delayMs);
      }
    }
  }

  // 2. Discover rounds from the page itself.
  const nav = parseRoundNav(base.html);
  const warnings = assertNav(nav);
  const baseRoundId = selectedRoundId(base.html);

  console.log(`\n  round nav: ${nav.rounds.length} items (data-num-items=${nav.declaredNumItems ?? "absent"}), complete=${nav.lastItemHasLastClass}`);
  for (const r of nav.rounds) {
    console.log(
      `    [${r.itemIndex}] roundId=${r.roundId}  gtm="${r.nameGtm ?? "?"}"  shown="${r.nameDisplayed ?? "?"}"  ${r.heatsDeclaredText ?? "? heats"}  ${r.statusText ?? ""}`,
    );
  }
  if (baseRoundId) console.log(`  base page serves roundId=${baseRoundId}`);
  console.log("");

  // 3. Retain each round, following round ids discovered along the way.
  const records: RoundRecord[] = [];
  let fetchesThisRun = (base.reused ? 0 : 1) + divisionFetches;

  interface QueueItem {
    roundId: string;
    nav: NavRound | null;
    discovered: DiscoveredRound | null;
    via: string;
  }
  const queue: QueueItem[] = nav.rounds.map((r) => ({
    roundId: r.roundId,
    nav: r,
    discovered: null,
    via: "nav",
  }));
  const queued = new Set(queue.map((q) => q.roundId));

  const enqueueFrom = (html: string, sourceRoundId: string): void => {
    for (const d of roundsFromHeats(html)) {
      if (queued.has(d.roundId)) continue;
      queued.add(d.roundId);
      queue.push({ roundId: d.roundId, nav: null, discovered: d, via: "bracket-heat-blob" });
      console.log(
        `  found   roundId=${d.roundId} "${d.name ?? "?"}" (round ${d.number ?? "?"}, ` +
          `${d.heatIdsAttributed.length} heats) — not in the nav, seen on round ${sourceRoundId}`,
      );
    }
  };
  enqueueFrom(base.html, baseRoundId ?? "base");

  // Heats already held, and which retained page holds them. A round whose heats
  // are ALL already on a retained page needs no fetch of its own.
  //
  // Rounds 3-7 of a pre-cut event share ONE bracket page: ?roundId=24742 returns
  // byte-for-byte what ?roundId=24741 returns, bar the query string echoed into
  // the analytics blob. Discovered 8 August by fetching 24742 and diffing it —
  // common prefix 884,185 bytes of 1,480,528. Without this guard the harness
  // would fetch four identical copies of the bracket per event.
  const heatToPage = new Map<string, string>();

  for (let qi = 0; qi < queue.length; qi++) {
    const item = queue[qi];
    const r = item.nav;
    const servedByBase =
      !args.explicitFirstRound && baseRoundId !== null && baseRoundId === item.roundId;

    const attributed = item.discovered?.heatIdsAttributed ?? [];
    const holder =
      attributed.length > 0 && attributed.every((h) => heatToPage.has(h))
        ? heatToPage.get(attributed[0])
        : undefined;
    if (!servedByBase && holder !== undefined) {
      console.log(
        `  skip    roundId=${item.roundId} "${item.discovered?.name ?? "?"}" — all ` +
          `${attributed.length} of its heats are already on ${holder}. Not fetched.`,
      );
      const src = records.find((rec) => rec.artefact.slug === holder);
      records.push({
        item_index: qi,
        discovered_via: item.via,
        heats_attributed_here: attributed,
        round_id: item.roundId,
        round_name_displayed: null,
        round_name_gtm: item.discovered?.name ?? null,
        round_number_gtm: item.discovered?.number ?? null,
        round_status_text: null,
        heats_declared: attributed.length,
        heat_id_rows: attributed.length,
        heats_observed: attributed.length,
        heats_agree: true,
        spans_multiple_rounds: false,
        heat_ids: attributed,
        athlete_blocks: 0,
        counted_waves: 0,
        progression_strings: 0,
        interference_markers: 0,
        counting_waves_present: src?.counting_waves_present ?? false,
        artefact: src?.artefact ?? {
          slug: holder,
          url: "",
          file_path: "",
          sha256: "",
          fetched_at: "",
          http_status: null,
          content_type: null,
          content_length: 0,
          retrieval: null,
          provenance_warning: null,
        },
        served_by_base_page: false,
        served_by_round_page: holder,
        fetched_this_run: false,
      });
      continue;
    }

    let art: Artefact;
    if (servedByBase) {
      art = base;
      console.log(`  skip    roundId=${item.roundId} — served by the base page (data-round-id says so)`);
    } else {
      // divisionUrl, NOT ev.results_url: the spec URL carries no statEventId,
      // so rebuilding from it would send every round fetch back to whichever
      // division the site defaults to. On 2025 event 6 that is the women's.
      const url = new URL(divisionUrl);
      url.searchParams.set("roundId", item.roundId);
      const roundSlug = `${stem}_round_${item.roundId}`;
      const before = args.fetch;
      const label = r?.nameGtm ?? item.discovered?.name ?? null;
      const held = existsSync(join(RAW_DIR_LOCAL, `${roundSlug}.html`));
      if (!held && fetchesThisRun >= args.maxFetches) {
        console.log(
          `\n  STOPPING: --max-fetches ${args.maxFetches} reached with ` +
            `${queue.length - qi} round(s) still unretained. Nothing partial has been ` +
            `written to the manifest. Inspect what landed, then re-run to continue.\n`,
        );
        process.exit(0);
      }
      art = await retrieve(
        url.toString(),
        roundSlug,
        opts,
        `Round ${item.roundId}${label ? ` (${label})` : ""} of ${ev.name}.`,
      );
      if (!art.reused) {
        fetchesThisRun += 1;
        if (before && args.delayMs > 0) await sleep(args.delayMs);
      }
    }

    // A newly retained page may name rounds nothing has named yet.
    enqueueFrom(art.html, item.roundId);

    const rows = heatIds(art.html);
    const ids = [...new Set(rows)];
    const counted = classMarkerCount(art.html, "hot-heat-athlete__counted-waves");
    const athletes = athleteBlockCount(art.html);
    const declaredHeats = r?.heatsDeclared ?? item.discovered?.heatIdsAttributed.length ?? null;
    for (const h of ids) if (!heatToPage.has(h)) heatToPage.set(h, art.slug);

    records.push({
      item_index: r?.itemIndex ?? qi,
      discovered_via: item.via,
      heats_attributed_here: item.discovered?.heatIdsAttributed ?? [],
      round_id: item.roundId,
      round_name_displayed: r?.nameDisplayed ?? null,
      round_name_gtm: r?.nameGtm ?? item.discovered?.name ?? null,
      round_number_gtm: r?.numberGtm ?? item.discovered?.number ?? null,
      round_status_text: r?.statusText ?? null,
      heats_declared: r?.heatsDeclared ?? item.discovered?.heatIdsAttributed.length ?? null,
      heat_id_rows: rows.length,
      heats_observed: ids.length,
      // Compare DISTINCT heats against the declared count. The nav's count
      // describes one round; a bracket page delivers several, so more heats
      // than declared is a page that spans rounds, not a disagreement.
      heats_agree: declaredHeats === null ? null : declaredHeats === ids.length,
      spans_multiple_rounds: declaredHeats !== null && ids.length > declaredHeats,
      heat_ids: ids,
      athlete_blocks: athletes,
      counted_waves: counted,
      progression_strings: classMarkerCount(art.html, "hot-heat-athlete__abbreviated-advanced-to"),
      interference_markers: classMarkerCount(art.html, "hot-heat-athlete--has-interference"),
      counting_waves_present: counted > 0,
      artefact: {
        slug: art.slug,
        url: art.url,
        file_path: relative(REPO_ROOT, art.path),
        sha256: art.sha256,
        fetched_at: art.fetchedAt,
        http_status: art.httpStatus,
        content_type: art.contentType,
        content_length: art.bytes,
        retrieval: art.retrieval,
        provenance_warning: art.provenanceWarning,
      },
      served_by_base_page: servedByBase,
      fetched_this_run: !art.reused,
    });
  }

  // 4. Cross-check.
  const shortfalls = records.filter(
    (r) => r.heats_declared !== null && r.heats_observed < r.heats_declared,
  );
  const spanning = records.filter((r) => r.spans_multiple_rounds);
  // Rounds served by another page are not separate evidence — the page that
  // holds them already reported its own counting-wave state.
  const ownPages = records.filter((r) => r.served_by_round_page === undefined);
  const noCountingWaves = ownPages.filter((r) => !r.counting_waves_present);
  const allHeatIds = new Set(ownPages.flatMap((r) => r.heat_ids));
  const distinctPerPage = ownPages.reduce((n, r) => n + r.heat_ids.length, 0);
  const pagesRequired =
    records.filter((r) => !r.served_by_base_page && r.served_by_round_page === undefined).length + 1;

  console.log("\n  round                            declared  distinct  athletes  cnt-waves  prog  intf");
  for (const r of records) {
    const label = (r.round_name_gtm ?? r.round_name_displayed ?? r.round_id).padEnd(30);
    const flag = r.spans_multiple_rounds ? "  <-- spans rounds" : "";
    console.log(
      `  ${label} ${String(r.heats_declared ?? "?").padStart(8)}  ${String(r.heats_observed).padStart(8)}` +
        `  ${String(r.athlete_blocks).padStart(8)}  ${String(r.counted_waves).padStart(9)}` +
        `  ${String(r.progression_strings).padStart(4)}  ${String(r.interference_markers).padStart(4)}${flag}`,
    );
  }

  console.log(`\n  pages required for this event: ${pagesRequired}`);
  console.log(`  distinct heats in this event: ${allHeatIds.size}`);
  console.log(`  fetches performed this run: ${fetchesThisRun}`);

  if (allHeatIds.size !== distinctPerPage) {
    console.log(
      `  NOTE: ${distinctPerPage - allHeatIds.size} heat ids appear on more than one page. ` +
        `Recorded, not deduplicated — the ingest layer must decide which round owns a heat.`,
    );
  }
  for (const r of records) {
    if (r.heat_id_rows !== r.heat_ids.length) {
      console.log(
        `  note: round ${r.round_id} renders each heat ${(r.heat_id_rows / r.heat_ids.length).toFixed(1)}× ` +
          `on the page (${r.heat_id_rows} rows, ${r.heat_ids.length} distinct). Within-page duplication, not overlap.`,
      );
    }
  }
  for (const w of warnings) console.log(`  note: ${w}`);
  for (const r of spanning) {
    console.log(
      `  note: round ${r.round_id} declares ${r.heats_declared} heats but delivers ${r.heats_observed} — ` +
        `this page spans more than the round it is named after. Rounds beyond the first are unnamed here.`,
    );
  }
  for (const r of shortfalls) {
    console.log(
      `  SHORTFALL: round ${r.round_id} declares ${r.heats_declared} heats, only ${r.heats_observed} retained. ` +
        `A short page is a parse or capture failure, never a round with missing heats.`,
    );
  }
  for (const r of noCountingWaves) {
    console.log(
      `  M1 ITEM 5: round ${r.round_id} carries ${r.athlete_blocks} athlete records and ZERO counting-wave ` +
        `pairs. Heat totals only. These heats need ?heatId= (Tier 2) or a recorded data_gaps row.`,
    );
  }

  // 5. Manifest.
  mkdirSync(MANIFEST_DIR, { recursive: true });

  const manifestPath = join(MANIFEST_DIR, `${stem}.json`);
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        generated_by: SCRIPT_NAME,
        user_agent: USER_AGENT,
        season: args.season,
        event: ev,
        base_page: {
          slug: base.slug,
          url: base.url,
          file_path: relative(REPO_ROOT, base.path),
          sha256: base.sha256,
          fetched_at: base.fetchedAt,
          http_status: base.httpStatus,
          content_length: base.bytes,
          retrieval: base.retrieval,
          provenance_warning: base.provenanceWarning,
          serves_round_id: baseRoundId,
        },
        division:
          division === null
            ? { joint_event: false }
            : {
                joint_event: true,
                chosen_title: "Men's Heats",
                stat_event_id: division.statEventId,
                url: division.url,
                followed_toggle: division.followedToggle,
                items: division.items.map((i) => ({
                  title: i.title,
                  stat_event_id: i.statEventId,
                  served_by_bare_url: i.servedByBareUrl,
                })),
              },
        nav: {
          declared_num_items: nav.declaredNumItems,
          parsed_items: nav.rounds.length,
          last_item_has_last_class: nav.lastItemHasLastClass,
          tour_codes: nav.tourCodes,
          tour_genders: nav.tourGenders,
        },
        rounds: records,
        counts: {
          pages_required_per_event: pagesRequired,
          rounds_in_nav: nav.rounds.length,
          distinct_heat_ids: allHeatIds.size,
          athlete_blocks: records.reduce((n, r) => n + r.athlete_blocks, 0),
          counted_wave_pairs: records.reduce((n, r) => n + r.counted_waves, 0),
          interference_markers: records.reduce((n, r) => n + r.interference_markers, 0),
        },
        warnings,
        open: {
          pages_without_counting_waves: noCountingWaves.map((r) => ({
            round_id: r.round_id,
            round_name_gtm: r.round_name_gtm,
            heats: r.heats_observed,
            athlete_records_without_counting_waves: r.athlete_blocks,
            note:
              "Heat totals present, counting-wave pair absent. M1 item 5 is not " +
              "satisfied for these heats by Tier 1 alone.",
          })),
          pages_spanning_multiple_rounds: spanning.map((r) => ({
            round_id: r.round_id,
            declared: r.heats_declared,
            delivered: r.heats_observed,
          })),
          shortfalls: shortfalls.map((r) => ({
            round_id: r.round_id,
            declared: r.heats_declared,
            retained: r.heats_observed,
          })),
        },
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\n  manifest -> ${relative(REPO_ROOT, manifestPath)}`);
  console.log(`  next: tsx scripts/register_artefacts.ts   (emits reviewable SQL — Rule 6)\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
