#!/usr/bin/env tsx
/**
 * collect_heats.ts — SUPERSEDED 9 August 2026. Do not extend.
 *
 * ============================================================================
 * THIS SCRIPT CHASES A SERVER ENDPOINT THAT DOES NOT EXIST.
 *
 * The Heat Details popup is CLIENT-RENDERED. Verified 9 August from inside the
 * page itself: the five-parameter request captured from WSL's own network
 * traffic — including &requestName=postEventWatchHeatDetailsPopup, the correct
 * pbv, cookies and the XHR header — returns the ordinary round page. No
 * `Total waves`, no `Wind conditions`, no `wave-item` markup, byte-comparable
 * to the plain round URL. The resource log shows no other request path, so
 * there is no hidden API.
 *
 * USE scripts/collect_heat_popups.ts INSTEAD. It drives a real browser, which
 * is the only place that markup ever exists.
 *
 * Kept, not deleted, because it is the record of four eliminated routes and its
 * guards are what caught the mistake. docs/findings/2026-08-09_acquisition_routes.md
 * ============================================================================
 *
 * WHY THIS EXISTS
 *   Measured on Pipe 2025, 8 August: the bracket page carries heat totals and
 *   NO counting-wave pairs. 62 of that event's 110 athlete-heat records have a
 *   total and nothing behind it. M1 item 5 wants both counting waves for every
 *   completed heat, and WSL does publish them — behind ?heatId=. Recording a
 *   data_gaps row instead would be documenting around data that exists.
 *
 * WHAT IT COLLECTS
 *   Only heats that need it, by default: heats on round pages where
 *   collect_event.ts recorded `counting_waves_present: false`. The list-view
 *   rounds already carry their counting pairs and are not re-fetched.
 *
 * HEAT URLS ARE READ, NOT CONSTRUCTED
 *   The round pages publish a detail link per heat (31 on the Pipe bracket, one
 *   per distinct heat). This reads those hrefs out of the retained bytes. It
 *   does not assemble ?heatId= URLs from ids, because a constructed URL that
 *   happens to work is not evidence that it is the URL WSL publishes.
 *
 * FIRST-RUN BEHAVIOUR — DELIBERATELY EXPLORATORY
 *   No heat detail page has ever been retained by this project. This script
 *   therefore does NOT assert on selectors it has never seen. It retains, then
 *   reports a class inventory so the page's actual shape is established from
 *   the page. Absence of an expected marker is reported as a question, never as
 *   a fact about WSL. That rule is in this file because breaking it is the most
 *   repeated error in this project.
 *
 * ORDERING
 *   Refuses to run without an event manifest from collect_event.ts. Event pages
 *   before heat pages, always.
 *
 * Usage:
 *   tsx scripts/collect_heats.ts --season 2025 --event 1 --heat 104722
 *   tsx scripts/collect_heats.ts --season 2025 --event 1            # gaps only
 *   tsx scripts/collect_heats.ts --season 2025 --event 1 --all
 *   tsx scripts/collect_heats.ts --season 2025 --event 1 --heat 104722 --xhr
 *   tsx scripts/collect_heats.ts --season 2025 --event 1 --no-fetch
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  MANIFEST_DIR,
  REPO_ROOT,
  type Artefact,
  type RetainOptions,
  classInventory,
  classMarkerCount,
  fail,
  isRecord,
  retrieve,
  sleep,
} from "./lib/retain.ts";
import { verifyControls } from "./lib/controls.ts";
import { loadEventManifest, type RoundFromManifest } from "./lib/manifest.ts";

const USER_AGENT =
  "wsl-analytics-research/0.1 (tier 2 heat detail collection; +https://github.com/taryn-lgtm/swell-analytics)";
const SCRIPT_NAME = "scripts/collect_heats.ts";

/**
 * Markers worth counting on a heat page. Every one of these is REPORTED, never
 * asserted — a zero here is a fact about this list, not about WSL, until a
 * human has looked at the retained page.
 */
const MARKERS = [
  "hot-heat-athlete__counted-waves",
  "hot-heat-athlete__num-waves",
  "hot-heat-athlete__score",
  "hot-heat-athlete--has-interference",
  "hot-heat-athlete__interference",
  "hot-heat-athlete__abbreviated-advanced-to",
  "hot-heat-athlete",
] as const;

interface Args {
  season: number;
  event: number;
  heat: string | null;
  all: boolean;
  fetch: boolean;
  refetch: boolean;
  delayMs: number;
  xhr: boolean;
}

function parseArgs(argv: string[]): Args {
  let season: number | null = null;
  let event: number | null = null;
  let heat: string | null = null;
  let all = false;
  let doFetch = true;
  let refetch = false;
  let delayMs = 3000;
  let xhr = true;   // the site's own Details request is a jQuery AJAX call

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--season") season = Number(argv[++i]);
    else if (arg === "--event") event = Number(argv[++i]);
    else if (arg === "--heat") heat = String(argv[++i]);
    else if (arg === "--delay") delayMs = Number(argv[++i]);
    else if (arg === "--xhr") xhr = true;
    else if (arg === "--no-xhr") xhr = false;
    else if (arg === "--all") all = true;
    else if (arg === "--gaps-only") all = false;
    else if (arg === "--no-fetch") doFetch = false;
    else if (arg === "--fetch") doFetch = true;
    else if (arg === "--refetch") refetch = true;
    else fail(`unrecognised argument: ${arg}`);
  }
  if (season === null || !Number.isInteger(season)) fail("--season <year> is required");
  if (event === null || !Number.isInteger(event)) fail("--event <event number> is required");
  if (!Number.isFinite(delayMs) || delayMs < 0) fail(`--delay must be >= 0, got ${delayMs}`);
  return { season: season!, event: event!, heat, all, fetch: doFetch, refetch, delayMs, xhr };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * The parameter that turns the results URL into the Heat Details fragment.
 *
 * Captured 9 August from the site's own network traffic, by opening the bracket
 * page in Taryn's browser and clicking a Details link (rule 7b). The request the
 * page makes is:
 *
 *   GET …/results?heatId=104722&roundId=24741
 *       &rnd=<epoch-ms>&pbv=<build-hash>
 *       &requestName=postEventWatchHeatDetailsPopup
 *
 * `requestName` is the whole difference. Without it the server returns the full
 * bracket page — which is why four earlier route tests all came back with 31
 * heats and no counting waves. The value is the same string already sitting in
 * the markup as `data-request-name`, so it is read from the anchor rather than
 * hardcoded.
 *
 * `rnd` is a cache-buster. `pbv` is a build hash that will go stale, so it is
 * deliberately NOT sent; if the response comes back as the full page the guard
 * in main() catches it and says so.
 */
function detailsUrl(href: string, requestName: string, pbv: string | null): string {
  const url = new URL(href, "https://www.worldsurfleague.com");
  url.searchParams.set("rnd", String(Date.now()));
  if (pbv !== null) url.searchParams.set("pbv", pbv);
  url.searchParams.set("requestName", requestName);
  return url.toString();
}

/**
 * `pbv` in the live request is the site's package build version, and the page
 * carries it: `'packageBuildVersion' : 'f02bac66…-11791'`. Read it rather than
 * hardcode it — it changes on every WSL deploy, and a stale hardcoded value
 * would fail in a way that looks like the route having disappeared.
 *
 * Returns null if absent. The caller reports that rather than inventing one.
 */
function packageBuildVersion(html: string): string | null {
  const m = /['"]packageBuildVersion['"]\s*:\s*['"]([^'"]+)['"]/.exec(html);
  return m ? m[1] : null;
}

/**
 * Heat detail links as published on a retained round page, each paired with the
 * `data-request-name` from its own anchor.
 */
function heatLinks(roundHtml: string): Map<string, { href: string; requestName: string }> {
  const out = new Map<string, { href: string; requestName: string }>();
  const anchor = /<a\b[^>]*href="([^"]*[?&]heatId=(\d+)[^"]*)"[^>]*>/g;
  for (const m of roundHtml.matchAll(anchor)) {
    const heatId = m[2];
    if (out.has(heatId)) continue;
    const rn = /data-request-name="([^"]+)"/.exec(m[0]);
    if (!rn) {
      fail(
        `heat ${heatId}'s Details anchor carries no data-request-name. Without it the ` +
          `server returns the whole bracket page. Not guessed — inspect the retained round page.`,
      );
    }
    out.set(heatId, { href: m[1].replace(/&amp;/g, "&"), requestName: rn[1] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface HeatRecord {
  heat_id: string;
  round_id: string;
  round_name_gtm: string | null;
  url: string;
  file_path: string;
  sha256: string;
  fetched_at: string;
  http_status: number | null;
  content_length: number;
  markers: Record<string, number>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ev = loadEventManifest(args.season, args.event);
  // ?heatId= and ?roundId= are AJAX popup routes (data-request-name=
  // "postEventWatchHeatDetailsPopup", data-href="…&trigger=round"). A plain GET
  // is served the round page with the query string echoed into the analytics
  // blob — verified 9 August, see the round_24742 sidecar. --xhr sends the
  // header the site's own JS would send. This is the last untested route for
  // the counting-wave pairs of rounds 3-7, and it is CLAUDE.md's open question
  // from 26 July.
  const opts: RetainOptions = {
    fetch: args.fetch,
    refetch: args.refetch,
    scriptName: SCRIPT_NAME,
    userAgent: USER_AGENT,
    extraHeaders: args.xhr
      ? { "x-requested-with": "XMLHttpRequest", accept: "text/html, */*; q=0.01" }
      : undefined,
  };

  // Selectors are verified against known-present artefacts BEFORE anything is
  // counted. A broken selector must not be allowed to report zero.
  verifyControls();

  console.log(`\n${args.season} CT event ${args.event} — ${ev.name} (WSL id ${ev.wslEventId})`);
  console.log(`  manifest: ${ev.stem}.json`);
  console.log(args.fetch ? `  network: ON, ${args.delayMs}ms between fetches` : "  network: OFF (--no-fetch)");

  // Which rounds are in scope.
  const target = args.all ? ev.rounds : ev.rounds.filter((r) => !r.counting_waves_present);
  if (target.length === 0) {
    console.log(
      `\n  every round in this event already carries counting waves. Nothing to do.\n` +
        `  Use --all to collect heat detail pages anyway.\n`,
    );
    return;
  }

  // Heat URLs, read from the retained round pages.
  const queue: Array<{ heatId: string; url: string; round: RoundFromManifest }> = [];
  for (const round of target) {
    const path = join(REPO_ROOT, round.file_path);
    if (!existsSync(path)) fail(`retained round page missing: ${round.file_path}`);
    const roundHtml = readFileSync(path, "utf8");
    const pbv = packageBuildVersion(roundHtml);
    if (pbv === null) {
      console.log(
        `  note: round ${round.round_id}'s page carries no packageBuildVersion. ` +
          `Requesting without pbv — if the fragment does not come back, that is the ` +
          `first thing to suspect.`,
      );
    }
    const links = heatLinks(roundHtml);

    if (links.size !== round.heat_ids.length) {
      console.log(
        `\n  note: round ${round.round_id} lists ${round.heat_ids.length} heat ids but ` +
          `${links.size} detail links. Collecting only the ${links.size} with a published link.`,
      );
    }
    for (const [heatId, link] of links) {
      if (args.heat !== null && heatId !== args.heat) continue;
      // Rounds 3-7 share one page, so several round records point at the same
      // file and every heat on it is found once per round. One heat, one fetch.
      if (queue.some((q) => q.heatId === heatId)) continue;
      queue.push({ heatId, url: detailsUrl(link.href, link.requestName, pbv), round });
    }
  }

  if (queue.length === 0) {
    fail(
      args.heat !== null
        ? `heat ${args.heat} has no published detail link on the rounds in scope`
        : `no heat detail links found on the rounds in scope`,
    );
  }

  console.log(`\n  ${queue.length} heat page(s) to collect from ${target.length} round(s)\n`);

  const records: HeatRecord[] = [];
  let fetched = 0;
  let firstHtml: string | null = null;

  for (const item of queue) {
    // A different request is a different artefact. Never overwrite the plain
    // GET's bytes with the XHR response under the same name.
    const slug = `${ev.stem}_heat_${item.heatId}`;
    const art: Artefact = await retrieve(
      item.url,
      slug,
      opts,
      `Heat ${item.heatId} detail, round ${item.round.round_id} of ${ev.name}.`,
    );

    // GUARD — added 8 August, after 31 fetches returned 31 copies of the
    // bracket page. `?heatId=` is an AJAX popup route
    // (data-request-name="postEventWatchHeatDetailsPopup"); a plain GET is
    // served the round page with the query string merely echoed into the
    // analytics blob. A heat detail view describes ONE heat, so a response
    // carrying the whole round's heats is not one, whatever the URL says.
    const heatsHere = new Set([...art.html.matchAll(/data-heat-id="(\d+)"/g)].map((m) => m[1]));
    if (heatsHere.size > 1) {
      if (args.xhr) {
        // The XHR test has now returned its answer: no. Retained, reported,
        // and stopped cleanly — this is a completed experiment, not a crash.
        console.log(
          `\n  RESULT — X-Requested-With: XMLHttpRequest does NOT change the response.\n` +
            `  Heat ${item.heatId} still came back with ${heatsHere.size} distinct heats, ` +
            `${art.bytes} bytes.\n` +
            `  Retained at ${relative(REPO_ROOT, art.path)} with request_headers in the sidecar.\n\n` +
            `  Four routes are now tested and none yields counting waves for rounds 3-7:\n` +
            `    ?roundId= (rounds 4-7)   -> bracket page\n` +
            `    ?heatId=                 -> bracket page\n` +
            `    ?heatId= + XHR header    -> bracket page  (this run)\n` +
            `    ?showAll=1&trigger=round -> Main tab\n\n` +
            `  Compare this capture against the plain-GET one before recording anything.\n` +
            `  If they agree, the data_gaps row for rounds 3-7 is evidenced, not assumed.\n`,
        );
        process.exit(0);
      }
      fail(
        `the response for heat ${item.heatId} contains ${heatsHere.size} distinct heats, ` +
          `so it is not a heat detail view — it is the round page with the query string ` +
          `echoed back.\n\n` +
          `  Retained anyway at ${relative(REPO_ROOT, art.path)} as evidence.\n` +
          `  Stopped after ONE request rather than collecting the same page N times.\n\n` +
          `  The live request carries THREE things beyond heatId/roundId:\n` +
          `    requestName=postEventWatchHeatDetailsPopup   (from data-request-name)\n` +
          `    pbv=<packageBuildVersion>                    (read from the round page)\n` +
          `    X-Requested-With: XMLHttpRequest             (jQuery sends this)\n` +
          `  requestName alone was tested 9 Aug and is NOT sufficient. Check the URL and\n` +
          `  request_headers in the sidecar against the captured request before\n` +
          `  concluding anything about the route.`,
      );
    }

    if (firstHtml === null) firstHtml = art.html;
    if (!art.reused) {
      fetched += 1;
      if (args.delayMs > 0 && item !== queue[queue.length - 1]) await sleep(args.delayMs);
    }

    const markers: Record<string, number> = {};
    for (const m of MARKERS) markers[m] = classMarkerCount(art.html, m);

    records.push({
      heat_id: item.heatId,
      round_id: item.round.round_id,
      round_name_gtm: item.round.round_name_gtm,
      url: art.url,
      file_path: relative(REPO_ROOT, art.path),
      sha256: art.sha256,
      fetched_at: art.fetchedAt,
      http_status: art.httpStatus,
      content_length: art.bytes,
      markers,
    });
  }

  // Report. Counts only — no verdicts on a page shape nobody has confirmed.
  console.log(`\n  heat        ${MARKERS.map((m) => m.replace("hot-heat-athlete", "").replace(/^[_-]+/, "").slice(0, 9).padStart(10)).join("")}`);
  for (const r of records) {
    console.log(
      `  ${r.heat_id.padEnd(10)}  ${MARKERS.map((m) => String(r.markers[m]).padStart(10)).join("")}`,
    );
  }

  const totals = Object.fromEntries(
    MARKERS.map((m) => [m, records.reduce((n, r) => n + r.markers[m], 0)]),
  );

  console.log(`\n  fetches performed this run: ${fetched}`);
  const zero = MARKERS.filter((m) => totals[m] === 0);
  if (zero.length > 0) {
    console.log(
      `\n  ${zero.length} expected marker(s) absent across every page collected:\n` +
        zero.map((m) => `    ${m}`).join("\n") +
        `\n  This is a QUESTION about the selector list, not a finding about WSL.\n` +
        `  Read the retained page before recording any of it as absent from the source.`,
    );
  }

  if (firstHtml !== null) {
    console.log(`\n  class inventory of the first page retained (top 25, ids collapsed to -N):`);
    for (const [cls, n] of classInventory(firstHtml, 25)) {
      console.log(`    ${String(n).padStart(5)}  ${cls}`);
    }
  }

  mkdirSync(MANIFEST_DIR, { recursive: true });
  const out = join(MANIFEST_DIR, `${ev.stem}_heats.json`);
  writeFileSync(
    out,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        generated_by: SCRIPT_NAME,
        user_agent: USER_AGENT,
        season: args.season,
        event: { number: args.event, name: ev.name, wsl_event_id: ev.wslEventId },
        selection: args.heat !== null ? `single heat ${args.heat}` : args.all ? "all rounds" : "rounds without counting waves",
        rounds_in_scope: target.map((r) => r.round_id),
        heats: records,
        marker_totals: totals,
        markers_absent_everywhere: zero,
        caveat:
          "Marker counts describe this script's selector list. A zero is not " +
          "evidence that WSL does not publish the thing — read the retained page.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n  manifest -> ${relative(REPO_ROOT, out)}\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
