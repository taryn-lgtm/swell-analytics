#!/usr/bin/env tsx
/**
 * collect_heat_popups.ts — Tier 2 collection via a real browser
 *
 * WHY A BROWSER AND NOT A FETCH
 *   Established 9 August 2026, docs/findings/2026-08-09_acquisition_routes.md:
 *   the Heat Details popup is CLIENT-RENDERED. There is no server endpoint that
 *   returns it. Four URL shapes were tested, including the exact five-parameter
 *   request captured from the site's own network traffic
 *   (`…&requestName=postEventWatchHeatDetailsPopup`), executed from inside the
 *   page with cookies and the XHR header. Every one returns the ordinary round
 *   page: no `Total waves`, no `Wind conditions`, no `wave-item` markup. The
 *   resource log shows only that one path is ever requested, so there is no
 *   hidden API either.
 *
 *   So the popup exists only after the page's JavaScript has run. Collecting it
 *   means driving a browser. This is not a workaround for a block — nothing is
 *   blocked. It is the only place the markup exists.
 *
 * WHAT IT DOES
 *   Opens each round page that lacks counting waves, clicks every heat's
 *   Details link, and writes the popup's serialised DOM to disk with a sidecar
 *   BEFORE anything parses it. Same retention contract as every other script.
 *
 * PROVENANCE — READ THIS
 *   A serialised DOM is NOT wire bytes. It is what the browser built after
 *   running the site's JavaScript, and it cannot be re-derived from an HTTP
 *   response. Every sidecar carries a provenance_warning saying so, exactly as
 *   the Chrome "Save As" captures do. Do not let these be described later as
 *   fetched pages.
 *
 *   `retrieval` is written as `script_browser_dom`, which is NOT one of the four
 *   values artefacts_retrieval_check permits. That is deliberate:
 *   register_artefacts.ts will refuse to register these until a migration adds
 *   the value, which forces the provenance decision to be made by a human
 *   rather than absorbed into an existing category that does not fit.
 *
 * SETUP
 *   npm i -D playwright && npx playwright install chromium
 *
 * Usage:
 *   tsx scripts/collect_heat_popups.ts --season 2025 --event 1 --max-heats 1
 *   tsx scripts/collect_heat_popups.ts --season 2025 --event 1
 *   tsx scripts/collect_heat_popups.ts --season 2025 --event 1 --headed
 *
 * Start with --max-heats 1 and look at what landed. That rule is in this file
 * because ignoring it cost 31 wasted requests on 9 August.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, Page } from "playwright";
import { MANIFEST_DIR, RAW_DIR, REPO_ROOT, fail, sleep } from "./lib/retain.ts";
import { loadEventManifest, type RoundFromManifest, type SeriesFollowOn } from "./lib/manifest.ts";
import { verifyControls } from "./lib/controls.ts";
import { attributionFailure, duplicateFailure, seriesTotalsFailure } from "./lib/popup_guards.ts";

const USER_AGENT =
  "wsl-analytics-research/0.1 (tier 2 heat details, headless chromium; +https://github.com/taryn-lgtm/swell-analytics)";
const SCRIPT_NAME = "scripts/collect_heat_popups.ts";
const RETRIEVAL = "script_browser_dom";

/** The popup container, and the markers that prove it rendered. */
/**
 * How many times to click a heat's Details link before giving up.
 *
 * Three, because the failures observed on 19 August were single transient
 * renders — a slow popup, a stale container — not persistent ones. A retry
 * budget is not a way past a guard: every attempt is checked identically and a
 * capture that names the wrong heat is refused on the third try as firmly as on
 * the first.
 */
const CAPTURE_ATTEMPTS = 3;

const POPUP_SELECTOR = ".popup-bd";
const STAT_SELECTOR = ".stat-bar__stat";
const WAVE_SELECTOR = ".wave-score";

interface Args {
  season: number;
  event: number;
  maxHeats: number;
  headed: boolean;
  delayMs: number;
  refetch: boolean;
  /** Heats the operator names to pass over, each logged by id. Never inferred. */
  skipHeats: string[];
}

function parseArgs(argv: string[]): Args {
  let season: number | null = null;
  let event: number | null = null;
  let maxHeats = Number.POSITIVE_INFINITY;
  let headed = false;
  let delayMs = 1500;
  let refetch = false;
  const skipHeats: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--season") season = Number(argv[++i]);
    else if (a === "--event") event = Number(argv[++i]);
    else if (a === "--max-heats") maxHeats = Number(argv[++i]);
    else if (a === "--delay") delayMs = Number(argv[++i]);
    else if (a === "--headed") headed = true;
    else if (a === "--refetch") refetch = true;
    // ADDED 8 October 2026. Some heats never render a popup (e.g. 2025 e8 heat
    // 106907, both totals NULL), and the capture loop stops on them, stranding
    // every heat after it. Naming a heat here passes over it LOUDLY: it is
    // printed at the point of skipping, the guards are untouched, and its
    // absence stays recorded in data_gaps.
    else if (a === "--skip-heat") skipHeats.push(String(argv[++i]));
    else fail(`unrecognised argument: ${a}`);
  }
  if (season === null || !Number.isInteger(season)) fail("--season <year> is required");
  if (event === null || !Number.isInteger(event)) fail("--event <event number> is required");
  return { season: season!, event: event!, maxHeats, headed, delayMs, refetch, skipHeats };
}

interface PopupRecord {
  heat_id: string;
  /** `null` on a single-page event with no round navigation — the WSL Finals. */
  round_id: string | null;
  round_name_gtm: string | null;
  source_url: string;
  file_path: string;
  sha256: string;
  captured_at: string;
  html_length: number;
  stats: number;
  wave_scores: number;
  athletes: number;
  interference_markers: number;
}

/** Retain the popup DOM and its sidecar. Bytes to disk before any parse. */
function retainPopup(
  slug: string,
  html: string,
  meta: { sourceUrl: string; heatId: string; roundId: string | null; eventName: string },
): { path: string; sha256: string; capturedAt: string } {
  mkdirSync(RAW_DIR, { recursive: true });
  const htmlPath = join(RAW_DIR, `${slug}.html`);
  const sidecarPath = join(RAW_DIR, `${slug}.json`);
  const capturedAt = new Date().toISOString();

  writeFileSync(htmlPath, html, "utf8");
  const sha256 = createHash("sha256").update(Buffer.from(html, "utf8")).digest("hex");

  writeFileSync(
    sidecarPath,
    JSON.stringify(
      {
        url: meta.sourceUrl,
        fetched_at: capturedAt,
        sha256,
        http_status: null,
        content_type: null,
        content_length_bytes: Buffer.byteLength(html, "utf8"),
        fetched_by: SCRIPT_NAME,
        user_agent: USER_AGENT,
        retrieval: RETRIEVAL,
        capture_method:
          "Playwright chromium. Navigated to the round page, clicked the heat's " +
          "Details link, serialised the popup container's outerHTML.",
        provenance_warning:
          "NOT A WIRE-LEVEL ARTEFACT. These bytes are what the browser built after " +
          "running WSL's JavaScript. No HTTP response contains this markup — the " +
          "Heat Details popup is client-rendered and has no server endpoint. See " +
          "docs/findings/2026-08-09_acquisition_routes.md. It cannot be reproduced " +
          "by any fetch, only by re-running a browser.",
        heat: { wsl_heat_id: meta.heatId, wsl_round_id: meta.roundId, event: meta.eventName },
        note:
          "sha256 is over the UTF-8 bytes of the .html file as written, which is the " +
          "serialised DOM, not a response body.",
      },
      null,
      2,
    ) + "\n",
  );
  return { path: htmlPath, sha256, capturedAt };
}

/**
 * Dismiss the OneTrust consent banner, declining non-essential cookies.
 *
 * This must actually succeed, not merely be attempted. OneTrust renders a
 * full-viewport `.onetrust-pc-dark-filter` overlay that intercepts pointer
 * events, so while it is up every later click silently retries against the
 * overlay and eventually times out — which is what happened on the second run,
 * with 30 seconds of "subtree intercepts pointer events".
 *
 * Matched by OneTrust's own element ids rather than by button text: an earlier
 * attempt matched "Reject All" by role and opened the preference centre
 * instead, leaving the overlay up.
 */
async function dismissConsent(page: Page): Promise<void> {
  // The OneTrust SDK loads asynchronously, so immediately after
  // domcontentloaded there is nothing to click yet. Checking for the button at
  // that moment finds none, skips the click, and then waits for an overlay that
  // appears a second later and never goes away. Wait for the banner FIRST.
  const appeared = await page
    .waitForSelector("#onetrust-banner-sdk, #onetrust-pc-sdk, .onetrust-pc-dark-filter", {
      state: "visible",
      timeout: 20000,
    })
    .then(() => true)
    .catch(() => false);

  if (!appeared) return; // no consent UI on this load — nothing to decline

  const buttons = [
    "#onetrust-reject-all-handler", // banner — Reject All
    ".ot-pc-refuse-all-handler", // preference centre — Reject All
    ".onetrust-close-btn-handler", // last resort — close
  ];
  // A click that threw is not a click. Record the outcome, never assume it.
  let clicked: string | null = null;
  const attempts: string[] = [];
  for (const sel of buttons) {
    const el = page.locator(sel).first();
    const visible = await el
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      attempts.push(`${sel}: never became visible`);
      continue;
    }
    try {
      await el.click({ timeout: 8000 });
      clicked = sel;
      break;
    } catch (e) {
      attempts.push(`${sel}: visible but click failed — ${(e as Error).message.split("\n")[0]}`);
    }
  }

  if (clicked === null) {
    const controls = await page.evaluate((): string[] =>
      Array.from(document.querySelectorAll("#onetrust-consent-sdk button, #onetrust-consent-sdk a[id]"))
        .map((e) => `${e.id || "(no id)"}  "${(e.textContent ?? "").trim().slice(0, 40)}"`)
        .slice(0, 30),
    );
    fail(
      `the consent banner appeared but no decline control could be clicked.\n\n` +
        `  Attempts:\n${attempts.map((a) => `    ${a}`).join("\n")}\n\n` +
        `  Controls OneTrust rendered:\n${controls.map((c) => `    ${c}`).join("\n")}\n\n` +
        `  Add the right selector to dismissConsent().`,
    );
  }

  // Verify the overlay is really gone. If it is not, stop: every subsequent
  // click would land on it, and a timeout thirty seconds later is a far worse
  // error message than this one.
  //
  // Verified against the real post-decline DOM on 9 August: the three overlay
  // elements stay in the page with `display: none`, while their descendants
  // still compute as `display: block; visibility: visible`. So an element's own
  // computed style is not enough — checkVisibility() accounts for hidden
  // ancestors, which is what actually decides whether anything is clickable.
  const OVERLAYS = ["#onetrust-banner-sdk", "#onetrust-pc-sdk", ".onetrust-pc-dark-filter"];

  const clear = await page
    .waitForFunction(
      (sels: string[]): boolean =>
        sels.every((s) => {
          const el = document.querySelector(s);
          if (el === null) return true;
          return !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        }),
      OVERLAYS,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false);

  if (!clear) {
    const state = await page.evaluate(
      (sels: string[]): string[] =>
        sels.map((s) => {
          const el = document.querySelector(s);
          if (el === null) return `${s}: absent`;
          const cs = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            `${s}: display=${cs.display} visibility=${cs.visibility} opacity=${cs.opacity} ` +
            `rect=${Math.round(r.width)}x${Math.round(r.height)} ` +
            `checkVisibility=${el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })}`
          );
        }),
      OVERLAYS,
    );
    fail(
      `declined via ${clicked}, but a OneTrust overlay is still visible and will ` +
        `intercept every later click.\n\n` +
        `  State:\n${state.map((s) => `    ${s}`).join("\n")}\n\n` +
        `  Do NOT work around this by removing the element — a consent dialog that was\n` +
        `  never answered is not a dismissed one.`,
    );
  }
}

/** The spoiler toggle, read off the markup rather than off its label text. */
const SPOILER_TOGGLE = ".post-event-watch-filters__bar-item--scores";
/** The filter bar the spoiler toggle lives in. Absent on the WSL Finals. */
const FILTER_BAR = ".post-event-watch-filters";
/** A score the page has actually drawn. Used where there is no toggle to read. */
const RENDERED_SCORE = ".hot-heat-athlete__score";
const PAGE_ROOT = ".new-page--post-event";
const SHOW_SCORES_CLASS = "show-scores";
/**
 * The heat-details popup link.
 *
 * CHANGED 19 August 2026, and this is the important comment in this file.
 *
 * This used to be `.hot-heat__action-link-details`. That is ONE of four class
 * names WSL uses for the same link, and keying on it silently skipped whole
 * events. Counted over the 75 retained non-popup pages:
 *
 *     1340x  hot-heat__action-link hot-heat__action-link-details   ordinary CT
 *       27x  hot-heat__action-link                                 Surf Abu Dhabi
 *       16x  hot-heat__details-link                                WSL Finals
 *        2x  wavepool-hybrid-leaderboard-heat__details-link        Abu Dhabi leaderboard
 *
 * 45 popup links in the retained corpus were invisible to the class selector.
 * Two of them cost real data: Surf Abu Dhabi has 12 heats and no Tier 2 at all,
 * and the two WSL Finals events were written up as "the source publishes no
 * wave data" — a false claim about the world, produced by a selector returning
 * zero. A zero from an instrument is a fact about the instrument.
 *
 * All four shapes carry `data-request-name="postEventWatchHeatDetailsPopup"`.
 * Measured across the same 75 pages, the attribute never finds FEWER links than
 * the class did, on any page — so this is strictly a widening, and the 645
 * popups already collected are unaffected.
 *
 * Key off the attribute, not the class. The class is styling and will change
 * again; the attribute names the request the link makes.
 */
const DETAILS_LINK = '[data-request-name="postEventWatchHeatDetailsPopup"]';

async function openRound(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  await dismissConsent(page);

  // The Details links are in the DOM from the start but are NOT visible until
  // scores are shown, so wait for `attached`, not `visible`. Waiting for
  // visibility here times out against a page that is working fine — that is
  // what happened on the first run.
  await page.waitForSelector(DETAILS_LINK, { state: "attached", timeout: 30000 });

  // NOT EVERY PAGE HAS A SPOILER TOGGLE.
  //
  // ADDED 19 August 2026, after both WSL Finals runs failed here with
  // "locator.click: Timeout 10000ms exceeded" waiting for the scores filter.
  //
  // The Finals page carries NO filter bar at all — `post-event-watch-filters`
  // appears 0 times in its markup, against 17 on an ordinary event page — and
  // its scores are rendered unconditionally. There is nothing to click.
  //
  // The temptation is to skip the guard when the toggle is missing. That would
  // be trading a check for a shrug. The guard's actual job is to be sure the
  // popups will not retain blanks, so where the toggle does not exist that
  // question gets answered DIRECTLY instead: are scores on the page right now?
  // A rendered number is better evidence than a class name that implies one.
  const hasFilterBar = await page.evaluate(
    (sel: string): boolean => document.querySelector(sel) !== null,
    FILTER_BAR,
  );

  if (!hasFilterBar) {
    const scores = await page.evaluate((sel: string): number => {
      return [...document.querySelectorAll(sel)].filter(
        (el) => (el.textContent ?? "").trim().length > 0,
      ).length;
    }, RENDERED_SCORE);
    if (scores === 0) {
      fail(
        `this page has no scores filter bar (${FILTER_BAR}) AND no rendered score ` +
          `(${RENDERED_SCORE}). Refusing to collect: the popups would retain blanks.\n` +
          `  The artefact is not the problem — inspect the page before loosening this.`,
      );
    }
    console.log(`  no scores filter on this page; ${scores} score(s) already rendered`);
    await page.waitForSelector(DETAILS_LINK, { state: "visible", timeout: 15000 });
    return;
  }

  // Scores are hidden behind a spoiler toggle which adds `show-scores` to the
  // page root. Check the class, not the button label: the label text flips
  // between "Show results" and "Hide results" and both strings are always
  // present in the markup, one of them merely hidden.
  const state = await page.evaluate(
    ({ root, cls }: { root: string; cls: string }): boolean | null => {
      const el = document.querySelector(root);
      return el ? el.classList.contains(cls) : null;
    },
    { root: PAGE_ROOT, cls: SHOW_SCORES_CLASS },
  );

  if (state === null) {
    fail(
      `page root ${PAGE_ROOT} not found, so the spoiler state cannot be read. ` +
        `Refusing to collect: scores may be hidden and the popups would retain blanks.`,
    );
  }

  if (!state) {
    await page.locator(SPOILER_TOGGLE).first().click({ timeout: 10000 });
    await page.waitForFunction(
      ({ root, cls }: { root: string; cls: string }): boolean => {
        const el = document.querySelector(root);
        return el !== null && el.classList.contains(cls);
      },
      { root: PAGE_ROOT, cls: SHOW_SCORES_CLASS },
      { timeout: 10000 },
    );
  }
  await page.waitForSelector(DETAILS_LINK, { state: "visible", timeout: 15000 });
}

/**
 * Every popup for this event that is ON DISK, read back from its sidecar.
 *
 * The manifest's job is to say what was collected. Anything that makes it a
 * record of one RUN rather than of the DISK lets it under-report — which it did:
 * a `--max-heats 1` run took the event 1 manifest from 3 popups to 1 while four
 * files sat in raw/. Merging fixes the run-to-run case; this fixes the general
 * one, by making the index answerable from the artefacts themselves.
 *
 * Counts are recomputed from the retained bytes rather than carried, so a
 * manifest rebuilt from disk says the same thing as one written at capture time.
 */
export function recordsFromDisk(stem: string): PopupRecord[] {
  if (!existsSync(RAW_DIR)) return [];
  const prefix = `${stem}_heat_`;
  const out: PopupRecord[] = [];

  for (const f of readdirSync(RAW_DIR).sort()) {
    if (!f.startsWith(prefix) || !f.endsWith("_popup.json")) continue;
    const htmlPath = join(RAW_DIR, f.replace(/\.json$/, ".html"));
    if (!existsSync(htmlPath)) continue;

    let side: Record<string, unknown>;
    try {
      side = JSON.parse(readFileSync(join(RAW_DIR, f), "utf8")) as Record<string, unknown>;
    } catch {
      console.log(`  WARNING  ${f} is not readable JSON — omitted from the manifest.`);
      continue;
    }
    const heat = (side.heat ?? {}) as Record<string, unknown>;
    const heatId = typeof heat.wsl_heat_id === "string" ? heat.wsl_heat_id : null;
    if (heatId === null) continue;

    const html = readFileSync(htmlPath, "utf8");
    const classAttrs = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);

    // These must reproduce the CAPTURE-TIME counts exactly, or the same field
    // means two different things depending on how the row was produced.
    //
    // A first draft used a `\b`-bounded regex and returned stats=8 against a
    // popup whose capture said 4, and interference=1 against a capture that
    // said 10. `\b` treats `-` as a boundary, so `stat-bar__stat` matched
    // inside `stat-bar__stat-item` and inside its BEM-prefixed twin; and the
    // capture counts interference with `[class*='interference']`, a substring
    // match, not a class token. Both are now matched the way the browser
    // matched them, and both were checked against heat 104722 — captured
    // 19 August, counts reproduced 4 / 10 / 4 / 10.
    //
    // Substring matching is safe HERE and nowhere else: these files are the
    // popup container's outerHTML, with no inlined stylesheet. The 860 KB of
    // CSS that makes a substring search return phantom interference on a full
    // results page is not in these bytes. On a page artefact this would be the
    // controls.json false positive, restated.
    const tokenCount = (t: string): number =>
      classAttrs.filter((c) => c.split(/\s+/).includes(t)).length;
    const substringCount = (t: string): number => classAttrs.filter((c) => c.includes(t)).length;

    out.push({
      heat_id: heatId,
      round_id: typeof heat.wsl_round_id === "string" ? heat.wsl_round_id : "",
      round_name_gtm: null,
      source_url: typeof side.url === "string" ? side.url : "",
      file_path: relative(REPO_ROOT, htmlPath),
      sha256: typeof side.sha256 === "string" ? side.sha256 : "",
      captured_at: typeof side.fetched_at === "string" ? side.fetched_at : "",
      html_length: typeof side.content_length_bytes === "number" ? side.content_length_bytes : html.length,
      stats: tokenCount("stat-bar__stat"),
      wave_scores: tokenCount("wave-score"),
      athletes: tokenCount("hot-heat-athlete__name"),
      interference_markers: substringCount("interference"),
    });
  }
  return out;
}

/**
 * Close whatever popup is open and wait for it to leave the DOM.
 *
 * A popup left open is the thing every stale-capture failure has in common, so
 * clearing it is the actual remedy before a retry rather than simply waiting
 * longer. Best-effort throughout: if none of the close controls exist, Escape
 * is tried, and if the container never detaches the caller's own attribution
 * wait is what decides whether the next capture is acceptable.
 */
async function dismissPopup(page: Page): Promise<void> {
  const closer = page.locator(".popup-close, .popup .close, [class*='popup'] [class*='close']").first();
  if (await closer.count().then((n: number) => n > 0).catch(() => false)) {
    await closer.click({ timeout: 5000 }).catch(() => undefined);
  } else {
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  await page
    .waitForSelector(`${POPUP_SELECTOR} ${STAT_SELECTOR}`, { state: "detached", timeout: 8000 })
    .catch(() => undefined);
}

/**
 * Capture one SERIES heat: a WSL Finals Title Match heat after the first.
 * Added 17 October 2026.
 *
 * These heats have no Details link on the page. The only way in is the
 * "Heat N Details" tab inside heat 1's popup, so this opens the parent's popup,
 * clicks the tab, and waits for the popup to show THIS heat's published totals.
 *
 * Guard (a) is necessary but not sufficient here: heat 1's popup already links
 * heatId=<heat N>. So guard (c), seriesTotalsFailure, holds the capture to the
 * totals the results page publishes for heat N, and guard (b) also compares
 * against the parent's capture. All three run before anything reaches disk.
 */
async function captureSeriesHeat(
  page: Page,
  f: SeriesFollowOn,
  previous: { sha: string; heatId: string } | null,
): Promise<{ html: string; sha: string; counts: { stats: number; waves: number; athletes: number; interference: number } }> {
  let lastProblem = "not attempted";
  for (let attempt = 1; attempt <= CAPTURE_ATTEMPTS; attempt++) {
    await dismissPopup(page);
    if (attempt > 1) await sleep(1200);

    const parent = page.locator(`${DETAILS_LINK}[href*="heatId=${f.parent_heat_id}"]`).first();
    if ((await parent.count()) === 0) fail(`series heat ${f.heat_id}: no Details link for its parent heat ${f.parent_heat_id} on this page`);
    await parent.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => undefined);
    await parent.click({ timeout: 10000 }).catch(() => parent.evaluate((el: Element) => (el as HTMLElement).click()));

    const parentUp = await page
      .waitForFunction(
        ({ sel, id }: { sel: string; id: string }) =>
          Array.from(document.querySelectorAll(sel)).some(
            (n) => (n.textContent ?? "").includes("Total waves") && n.outerHTML.includes(`heatId=${id}`),
          ),
        { sel: POPUP_SELECTOR, id: f.parent_heat_id },
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!parentUp) {
      lastProblem = `parent heat ${f.parent_heat_id}'s popup did not render within 20s`;
      continue;
    }

    const tab = page.locator(`${POPUP_SELECTOR} a[href*="matchupTab=details-${f.heat_id}"]`).first();
    if ((await tab.count()) === 0) {
      lastProblem = `parent ${f.parent_heat_id}'s popup has no "Heat ${f.heat_number} Details" link to ${f.heat_id}`;
      continue;
    }
    await tab.click({ timeout: 10000 }).catch(() => tab.evaluate((el: Element) => (el as HTMLElement).click()));

    // Wait for the popup to SHOW this heat: its first total per surfer equals
    // the published one. Waiting on heatId alone returns at once (the parent
    // already names it) -- the 17 August race in a new place.
    const shown = await page
      .waitForFunction(
        ({ sel, expected }: { sel: string; expected: Record<string, number> }) =>
          Array.from(document.querySelectorAll(sel)).some((n) => {
            const html = n.outerHTML;
            if (!(n.textContent ?? "").includes("Total waves")) return false;
            return Object.entries(expected).every(([id, total]) => {
              const at = html.search(new RegExp(`hot-heat-athlete--athlete-id-${id}\\b`));
              if (at < 0) return false;
              const m = /class="hot-heat-athlete__score[^"]*">\s*([\d.]+)\s*</.exec(html.slice(at));
              return m !== null && Math.abs(Number(m[1]) - total) < 0.001;
            });
          }),
        { sel: POPUP_SELECTOR, expected: f.expected_totals },
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      lastProblem = `no popup showing heat ${f.heat_id}'s published totals rendered within 20s`;
      continue;
    }

    const html = await page.evaluate(
      ({ sel, expected }: { sel: string; expected: Record<string, number> }): string => {
        const ok = Array.from(document.querySelectorAll(sel)).filter((n) => {
          const h = n.outerHTML;
          return (n.textContent ?? "").includes("Total waves") &&
            Object.keys(expected).every((id) => h.includes(`hot-heat-athlete--athlete-id-${id}`));
        });
        return ok.length > 0 ? ok[ok.length - 1].outerHTML : "";
      },
      { sel: POPUP_SELECTOR, expected: f.expected_totals },
    );
    if (html.length === 0) {
      lastProblem = `popup matched but could not be serialised`;
      continue;
    }

    // Counted exactly as recordsFromDisk counts a retained file, so the
    // manifest says the same thing whichever path wrote the row.
    const classAttrs = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
    const tokens = (t: string): number => classAttrs.filter((c) => c.split(/\s+/).includes(t)).length;
    const counts = {
      stats: tokens("stat-bar__stat"),
      waves: tokens("wave-score"),
      athletes: tokens("hot-heat-athlete__name"),
      interference: classAttrs.filter((c) => c.includes("interference")).length,
    };
    if (counts.waves === 0) {
      lastProblem = `popup rendered but carries zero .wave-score elements`;
      continue;
    }
    const a = attributionFailure(html, f.heat_id);
    if (a !== null) {
      lastProblem = a;
      continue;
    }
    const c = seriesTotalsFailure(html, f.expected_totals);
    if (c !== null) {
      lastProblem = c;
      continue;
    }
    const sha = createHash("sha256").update(Buffer.from(html, "utf8")).digest("hex");
    const b = duplicateFailure(sha, f.heat_id, previous);
    if (b !== null) {
      lastProblem = b;
      continue;
    }
    return { html, sha, counts };
  }
  return fail(
    `series heat ${f.heat_id}: ${lastProblem}\n\n` +
      `  Failed on all ${CAPTURE_ATTEMPTS} attempts. Nothing retained. Do NOT relax a guard to get past this.`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  verifyControls();

  const ev = loadEventManifest(args.season, args.event);
  console.log(`\n${args.season} CT event ${args.event} — ${ev.name} (WSL id ${ev.wslEventId})`);

  // Only pages that exist in their own right — rounds 4-7 are served by the
  // bracket page and must not be reopened.
  //
  // CHANGED 19 August 2026. This used to also skip any round whose counting
  // pair is already in the Tier 1 markup:
  //
  //     .filter(r => !r.counting_waves_present && r.served_by_round_page === undefined)
  //
  // For a pre-cut event that left ONE round of 31 heats and silently skipped
  // rounds 1-2 — 16 heats of 47. Decision 12, closed 17 August, is that Tier 2
  // is needed "for M1 item 5 on rounds 3-7, AND for conditions on every round",
  // and the figure recorded everywhere since is 47 per pre-cut event. The
  // decision was taken and this filter was never brought forward, so a run that
  // reported success delivered 31 of 47 and left wave height, wind and the full
  // ride list null on the other 16.
  //
  // The counting pair is not the only thing the popup carries. Tier 1 gives
  // rounds 1-2 the pair ORDERED BY SCORE and nothing else; the popup gives the
  // chronological ride list, the conditions and the interference effects. A
  // round is not "done" because one of those four exists.
  const rounds: RoundFromManifest[] = ev.rounds.filter(
    (r) => r.served_by_round_page === undefined,
  );
  const withPair = rounds.filter((r) => r.counting_waves_present).length;
  if (rounds.length === 0) {
    console.log(`\n  no round has a page of its own. Nothing to collect.\n`);
    return;
  }
  console.log(
    `  ${rounds.length} round page(s) to visit` +
      (withPair > 0
        ? ` — ${withPair} of them already carry the counting pair in Tier 1 and are\n` +
          `  visited anyway, for conditions and the full ride list (decision 12).`
        : ""),
  );
  if (ev.collectionUrl === null) fail("manifest has no event results_url");

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    fail(
      `playwright is not installed. This script needs a real browser because the ` +
        `Heat Details popup is client-rendered.\n\n` +
        `  npm i -D playwright && npx playwright install chromium`,
    );
  }

  const browser: Browser = await playwright.chromium.launch({ headless: !args.headed });
  // The bracket layout is ~1800px wide and tall. At Playwright's default
  // 1280x720 the outer columns sit outside the viewport and clicks fail with
  // "element is outside of the viewport" even after scrollIntoViewIfNeeded.
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 2200, height: 1400 },
  });
  const page = await context.newPage();

  const records: PopupRecord[] = [];
  let runError: unknown = null;
  let captured = 0;
  // Spans rounds, not just the heat loop. A capture identical to the last one
  // is wrong wherever it happens, and a fresh page load is exactly when the
  // stale-popup race is least obvious.
  let previousCapture: { sha: string; heatId: string } | null = null;

  try {
    for (const round of rounds) {
      // collectionUrl, NOT resultsUrl: it carries the men's statEventId when the
      // event is a joint one. Building from the spec URL would drive the browser
      // to whichever division WSL defaults to -- the women's, on 2025 event 6.
      const url = new URL(ev.collectionUrl);
      // A null round_id means the page has no round navigation and serves every
      // heat itself — the WSL Finals. Setting roundId= to the string "null"
      // would fetch something, which is worse than fetching nothing.
      if (round.round_id !== null) url.searchParams.set("roundId", round.round_id);
      console.log(
        `\n  round ${round.round_id ?? "(none — single-page event)"} ` +
          `(${round.round_name_gtm ?? "?"}) — ${url.toString()}`,
      );
      await openRound(page, url.toString());

      const links = page.locator(DETAILS_LINK);
      const total = await links.count();
      // The bracket view renders each heat twice, so 31 heats surface as 62
      // links. One heat, one capture.
      const seen = new Set<string>();
      console.log(`  ${total} Details link(s) on this page`);

      for (let i = 0; i < total; i++) {
        if (captured >= args.maxHeats) {
          console.log(
            `\n  STOPPING: --max-heats ${args.maxHeats} reached. ` +
              `Inspect what landed, then re-run to continue.`,
          );
          break;
        }

        const link = links.nth(i);
        const href = (await link.getAttribute("href")) ?? "";
        const heatId = /[?&]heatId=(\d+)/.exec(href)?.[1] ?? null;
        if (heatId === null) {
          fail(`Details link ${i} has no heatId in its href (${href}). Not skipped — that is a parse failure.`);
        }

        if (seen.has(heatId)) continue;
        seen.add(heatId);

        if (args.skipHeats.includes(heatId)) {
          console.log(`  SKIP    heat ${heatId} — named by --skip-heat; not captured, still an open gap`);
          continue;
        }

        // A round MAY declare exactly which heats are its own. Ordinary events
        // leave this empty and everything on the page is collected, as before.
        // The Finals results page carries BOTH divisions — four men's heats and
        // four women's in one document — so its manifest names the men's four
        // and this refuses the rest. Collecting a women's heat into a men's CT
        // corpus is the failure this project exists to avoid.
        if (round.heat_ids.length > 0 && !round.heat_ids.includes(heatId)) {
          console.log(`  skip    heat ${heatId} — not named by this round's manifest`);
          continue;
        }

        const slug = `${ev.stem}_heat_${heatId}_popup`;
        if (!args.refetch && existsSync(join(RAW_DIR, `${slug}.html`))) {
          console.log(`  reuse   heat ${heatId} — already retained`);
          continue;
        }

        // ---- capture, with retries -----------------------------------
        //
        // ADDED 19 August 2026. The guards below are unchanged; what changed is
        // that a guard firing no longer ends the whole event.
        //
        // The first bulk run over 22 events showed roughly one transient
        // failure per event — 2024 Pipe timed out waiting for the Elimination
        // Round's first popup after 12 clean captures, and 2024 Sunset Beach
        // stopped at 46 of 47 when heat 99198 serialised byte-identical to
        // 99196. Both were the attribution machinery working: nothing wrong was
        // written. But each cost an entire event, and a 22-event run that ends
        // half the events early converges only over repeated passes.
        //
        // So the click-and-capture is retried, and ONLY the retry is new. A
        // capture that fails a guard is still refused; it is simply attempted
        // again with the popup properly cleared first, which is the actual
        // remedy for a stale-DOM race. If every attempt fails, the script fails
        // exactly as it did before, with the last reason.
        //
        // Deliberately NOT done: loosening any guard, widening the wait, or
        // accepting a capture that names the wrong heat. The bug being worked
        // around is a slow render, not a wrong assertion.
        let html = "";
        let sha = "";
        let counts = { stats: 0, waves: 0, athletes: 0, interference: 0 };
        let lastProblem: string | null = null;

        for (let attempt = 1; attempt <= CAPTURE_ATTEMPTS; attempt++) {
          lastProblem = null;

          // From the second attempt on, clear the field before re-clicking: a
          // popup left open is precisely what the previous attempt tripped over.
          if (attempt > 1) {
            await dismissPopup(page);
            await sleep(1200);
          }

          await link.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => undefined);
          try {
            await link.click({ timeout: 10000 });
          } catch {
            // The anchor carries a JS handler, so a DOM click dispatches it just
            // as a user click would. This bypasses Playwright's viewport
            // actionability check, which the bracket's wide layout defeats.
            // Safe here only because the capture is verified below.
            await link.evaluate((el: Element) => (el as HTMLElement).click());
          }

          // Wait for THIS heat's popup, not for any popup. The previous
          // capture's container is still in the DOM and already satisfies
          // `${POPUP_SELECTOR} ${STAT_SELECTOR}`, so that wait returned
          // instantly from the second heat onward and the serialisation below
          // took the old popup. Two of three captures were misattributed before
          // this was found — docs/findings/2026-08-17_tier2_popup_misattribution.md.
          const appeared = await page
            .waitForFunction(
              ({ sel, id }: { sel: string; id: string }) => {
                const nodes: Element[] = Array.from(document.querySelectorAll(sel));
                const pop = nodes
                  .reverse()
                  .find((n: Element) => (n.textContent ?? "").includes("Total waves"));
                return pop !== undefined && pop.outerHTML.includes(`heatId=${id}`);
              },
              { sel: POPUP_SELECTOR, id: heatId },
              { timeout: 20000 },
            )
            .then(() => true)
            .catch(() => false);

          if (!appeared) {
            lastProblem = `no popup naming heat ${heatId} rendered within 20s`;
            continue;
          }

          html = await page.evaluate((sel: string): string => {
            const nodes: Element[] = Array.from(document.querySelectorAll(sel));
            const pop = nodes.reverse().find((n: Element) => (n.textContent ?? "").includes("Total waves"));
            return pop ? pop.outerHTML : "";
          }, POPUP_SELECTOR);

          if (html.length === 0) {
            lastProblem = `popup selector matched but no container carried "Total waves"`;
            continue;
          }

          counts = await page.evaluate(
            ({ popSel, statSel, waveSel }: { popSel: string; statSel: string; waveSel: string }) => {
              const nodes: Element[] = Array.from(document.querySelectorAll(popSel));
              const pop = nodes.reverse().find((n: Element) => (n.textContent ?? "").includes("Total waves"));
              if (!pop) return { stats: 0, waves: 0, athletes: 0, interference: 0 };
              return {
                stats: pop.querySelectorAll(statSel).length,
                waves: pop.querySelectorAll(waveSel).length,
                athletes: pop.querySelectorAll(".hot-heat-athlete__name").length,
                interference: pop.querySelectorAll("[class*='interference']").length,
              };
            },
            { popSel: POPUP_SELECTOR, statSel: STAT_SELECTOR, waveSel: WAVE_SELECTOR },
          );

          // A popup with no wave scores is an empty capture, not a heat with no
          // rides. Refuse it rather than retain something that reads as data.
          if (counts.waves === 0) {
            lastProblem =
              `popup rendered but carries zero .wave-score elements — most likely the ` +
              `spoiler toggle is still hiding results`;
            continue;
          }

          // Attribution guards. Both run before anything reaches disk, because a
          // misattributed popup is indistinguishable from a good one once
          // retained: the hash is honest, the sidecar is well formed, and the
          // filename is the only thing that says which heat it is.
          const attributionBad = attributionFailure(html, heatId);
          if (attributionBad !== null) {
            lastProblem = attributionBad;
            continue;
          }

          sha = createHash("sha256").update(Buffer.from(html, "utf8")).digest("hex");
          const duplicateBad = duplicateFailure(sha, heatId, previousCapture);
          if (duplicateBad !== null) {
            lastProblem = duplicateBad;
            continue;
          }

          if (attempt > 1) {
            console.log(`  retry   heat ${heatId} — captured on attempt ${attempt}`);
          }
          break;
        }

        if (lastProblem !== null) {
          fail(
            `heat ${heatId}: ${lastProblem}\n\n` +
              `  Failed on all ${CAPTURE_ATTEMPTS} attempts. Nothing retained.\n` +
              `  The guards are working — do NOT relax them to get past this. Everything\n` +
              `  already retained is kept, so re-running resumes from here.`,
          );
        }

        previousCapture = { sha, heatId };

        const held = retainPopup(slug, html, {
          sourceUrl: url.toString(),
          heatId,
          roundId: round.round_id,
          eventName: ev.name,
        });
        captured += 1;

        console.log(
          `  retain  heat ${heatId}  ${Buffer.byteLength(html, "utf8")} bytes  ` +
            `sha ${held.sha256.slice(0, 12)}…  stats=${counts.stats} waves=${counts.waves} ` +
            `athletes=${counts.athletes}${counts.interference > 0 ? ` intf=${counts.interference}` : ""}`,
        );

        records.push({
          heat_id: heatId,
          round_id: round.round_id,
          round_name_gtm: round.round_name_gtm,
          source_url: url.toString(),
          file_path: relative(REPO_ROOT, held.path),
          sha256: held.sha256,
          captured_at: held.capturedAt,
          html_length: Buffer.byteLength(html, "utf8"),
          stats: counts.stats,
          wave_scores: counts.waves,
          athletes: counts.athletes,
          interference_markers: counts.interference,
        });

        await dismissPopup(page);
        if (args.delayMs > 0) await sleep(args.delayMs);
      }

      // ---- series heats reached from inside another heat's popup ------
      for (const f of round.series_follow_on) {
        if (captured >= args.maxHeats) break;
        if (args.skipHeats.includes(f.heat_id)) {
          console.log(`  SKIP    series heat ${f.heat_id} — named by --skip-heat; still an open gap`);
          continue;
        }
        const slug = `${ev.stem}_heat_${f.heat_id}_popup`;
        if (!args.refetch && existsSync(join(RAW_DIR, `${slug}.html`))) {
          console.log(`  reuse   series heat ${f.heat_id} — already retained`);
          continue;
        }
        // Compare against the parent's retained capture too: a stale parent
        // popup is the specific wrong answer here.
        const parentPath = join(RAW_DIR, `${ev.stem}_heat_${f.parent_heat_id}_popup.html`);
        const parentSha = existsSync(parentPath)
          ? createHash("sha256").update(readFileSync(parentPath)).digest("hex")
          : null;
        const prev = parentSha !== null ? { sha: parentSha, heatId: f.parent_heat_id } : previousCapture;
        const got = await captureSeriesHeat(page, f, prev);
        previousCapture = { sha: got.sha, heatId: f.heat_id };

        const held = retainPopup(slug, got.html, {
          sourceUrl: url.toString(),
          heatId: f.heat_id,
          roundId: round.round_id,
          eventName: ev.name,
        });
        captured += 1;
        console.log(
          `  retain  series heat ${f.heat_number} (${f.heat_id})  ${Buffer.byteLength(got.html, "utf8")} bytes  ` +
            `sha ${held.sha256.slice(0, 12)}…  waves=${got.counts.waves} athletes=${got.counts.athletes}`,
        );
        records.push({
          heat_id: f.heat_id,
          round_id: round.round_id,
          round_name_gtm: round.round_name_gtm,
          source_url: url.toString(),
          file_path: relative(REPO_ROOT, held.path),
          sha256: held.sha256,
          captured_at: held.capturedAt,
          html_length: Buffer.byteLength(got.html, "utf8"),
          stats: got.counts.stats,
          wave_scores: got.counts.waves,
          athletes: got.counts.athletes,
          interference_markers: got.counts.interference,
        });
        await dismissPopup(page);
      }
      if (captured >= args.maxHeats) break;
    }
  } catch (err) {
    // THE MANIFEST IS WRITTEN EVEN WHEN THE RUN FAILS. Added 19 August 2026.
    //
    // The write below used to sit after this block, so any throw inside the
    // loop skipped it and the run left popups on disk with NO index. That has
    // now happened four times — 2024 e1, 2025 e5, 2025 e8, and Surf Abu Dhabi,
    // which captured all 12 of its popups and then wrote nothing, so
    // ingest_popups.ts reported "no popup manifest" over a complete event.
    //
    // The bytes were always the real record; the manifest is an index, and an
    // index that only appears on success under-reports exactly when it matters.
    // The error is kept and re-raised after the write, so a failed run still
    // fails — it just stops taking its own evidence down with it.
    runError = err;
  } finally {
    await browser.close();
  }

  mkdirSync(MANIFEST_DIR, { recursive: true });
  const out = join(MANIFEST_DIR, `${ev.stem}_popups.json`);

  // MERGE, never overwrite. Added 19 August 2026.
  //
  // This wrote only the current run's records. Any run that captured a subset —
  // `--max-heats`, a resumed run, an interrupted one — therefore dropped every
  // earlier capture out of the index while the files stayed on disk. Observed:
  // a `--max-heats 1` run took the event 1 manifest from 3 popups to 1 while
  // four sat in docs/sources/raw/.
  //
  // The manifest is the index a later reader trusts to say what was collected.
  // An index that shrinks when you add to the set is worse than no index: the
  // retained bytes are fine and the record of them is wrong, which is the
  // shape this project treats as most dangerous.
  let priorPopups: PopupRecord[] = [];
  let priorRounds: string[] = [];
  if (existsSync(out)) {
    let prior: { popups?: unknown; rounds_visited?: unknown };
    try {
      prior = JSON.parse(readFileSync(out, "utf8")) as typeof prior;
    } catch {
      return fail(
        `${relative(REPO_ROOT, out)} exists but is not readable JSON.\n` +
          `  Refusing to overwrite it — move it aside and re-run if it is genuinely rubbish.`,
      );
    }
    priorPopups = Array.isArray(prior.popups) ? (prior.popups as PopupRecord[]) : [];
    priorRounds = Array.isArray(prior.rounds_visited) ? (prior.rounds_visited as string[]) : [];
  }

  // Disk is the floor: the manifest can never claim fewer popups than exist.
  // Then the prior manifest (it carries round_name_gtm, which the sidecar does
  // not), then this run, which is freshest.
  const onDisk = recordsFromDisk(ev.stem);
  const byHeat = new Map<string, PopupRecord>();
  for (const r of onDisk) byHeat.set(r.heat_id, r);
  for (const r of priorPopups) if (byHeat.has(r.heat_id)) byHeat.set(r.heat_id, r);
  for (const r of records) byHeat.set(r.heat_id, r); // this run wins on a re-capture

  // A manifest entry with no file behind it is a claim about a retained artefact
  // that is not retained. Loud, never silently dropped or kept.
  const diskIds = new Set(onDisk.map((r) => r.heat_id));
  const orphans = priorPopups.filter((r) => !diskIds.has(r.heat_id)).map((r) => r.heat_id);
  if (orphans.length > 0) {
    console.log(
      `\n  WARNING: the manifest named ${orphans.length} popup(s) with no file on disk\n` +
        `  — ${orphans.join(", ")}. Dropped from the rewritten manifest. Something\n` +
        `  deleted retained bytes; find out what before collecting more.`,
    );
  }
  const recovered = onDisk.length - priorPopups.filter((r) => diskIds.has(r.heat_id)).length - records.length;
  if (recovered > 0) {
    console.log(`\n  ${recovered} popup(s) on disk were missing from the manifest and have been restored.`);
  }
  const merged = [...byHeat.values()].sort((a, b) => a.heat_id.localeCompare(b.heat_id));
  const roundsVisited = [
    ...new Set([...priorRounds, ...rounds.map((r) => r.round_id ?? "(no round nav)")]),
  ].sort();

  writeFileSync(
    out,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        generated_by: SCRIPT_NAME,
        user_agent: USER_AGENT,
        season: args.season,
        event: { number: args.event, name: ev.name, wsl_event_id: ev.wslEventId },
        capture_method: "Playwright chromium, popup DOM after click",
        provenance_warning:
          "Serialised DOM, not wire bytes. No HTTP response contains this markup.",
        rounds_visited: roundsVisited,
        retained_this_run: records.length,
        popups: merged,
        totals: {
          popups: merged.length,
          wave_scores: merged.reduce((n, r) => n + r.wave_scores, 0),
          with_interference: merged.filter((r) => r.interference_markers > 0).length,
        },
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\n  ${records.length} popup(s) retained this run`);
  console.log(`  ${merged.length} popup(s) in the manifest -> ${relative(REPO_ROOT, out)}`);
  console.log(
    `\n  These carry retrieval="${RETRIEVAL}". Migration 00000000000009 added that\n` +
      `  value on 10 August 2026, so register_artefacts.ts will register them.\n` +
      `  A DOM capture is not a fetch and has its own value rather than being filed\n` +
      `  as one — that is the whole point of the migration.\n\n` +
      `  Next: npx tsx scripts/verify_popup_attribution.ts\n` +
      `        npx tsx scripts/lib/parse_popup.test.ts\n`,
  );

  if (runError !== null) {
    console.error(
      `\n  THE RUN FAILED. The manifest above was rebuilt from what is on disk before\n` +
        `  this error was re-raised, so nothing captured has been lost. Re-running skips\n` +
        `  everything already retained.\n`,
    );
    throw runError;
  }
}

// Run only when this file is the entry point. Importing it for
// recordsFromDisk() must not launch a browser — rebuild_popup_manifest.ts is
// offline by definition and a side-effecting import would defeat that.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
