#!/usr/bin/env tsx
/**
 * collect_page.ts — retain any one WSL page, properly
 *
 * Runs on Taryn's machine only. robots.txt names Claude's agents under
 * Disallow: /, so Claude may write this and may not run it.
 *
 * WHY A GENERIC ONE
 *   collect_event.ts knows about `/results` and its round pages, which is right
 *   — it discovers rounds, writes a manifest and enforces the three-page shape.
 *   But several single pages sit outside that model and have each been blocked
 *   on having no way to fetch them:
 *
 *     /events/<year>/ct?all=1        the season calendar. Never collected, and
 *                                    already carries a data_gaps row: it is why
 *                                    events.start_date, end_date and venue_id
 *                                    are null, AND it is the only place the
 *                                    men's event id for the 2025 Gold Coast Pro
 *                                    can be read (the spec's 325 resolves to the
 *                                    WOMEN'S event — see the 19 August finding).
 *
 *     /events/.../finals.../bracket  the WSL Finals bracket. The results page
 *                                    shows the Title Match as ONE heat, while
 *                                    rulebook 1.06(e)(iv) says the Final Match
 *                                    is best of three. Exactly one heat id is
 *                                    missing from each Finals results page
 *                                    (108301 in 2025, 102842 in 2024), so the
 *                                    page is evidently not showing every heat.
 *                                    The bracket tab is the cheapest way to find
 *                                    out how many there really were.
 *
 *   Rather than bend collect_event.ts around them, this retains one page under
 *   the same contract: bytes to disk with a sidecar before anything parses it,
 *   the project's own user-agent, sha256 recorded, and a reuse check so a
 *   re-run costs nothing.
 *
 * IT PARSES NOTHING. Retention only. What the page means is a separate job for
 * a separate script, which is the ordering this project keeps to everywhere.
 *
 * Usage:
 *   npm run collect-page -- --url "https://www.worldsurfleague.com/events/2025/ct?all=1" --slug 2025_ct_calendar
 *   npm run collect-page -- --url "..." --slug ... --note "why this page"
 *   npm run collect-page -- --url "..." --slug ... --refetch
 */

import { relative } from "node:path";
import { RAW_DIR, REPO_ROOT, fail, retrieve } from "./lib/retain.ts";

const SCRIPT_NAME = "scripts/collect_page.ts";
const USER_AGENT =
  "wsl-analytics-research/0.1 (single page retention; +https://github.com/taryn-lgtm/swell-analytics)";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let url: string | null = null;
  let slug: string | null = null;
  let note = "";
  let refetch = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") url = argv[++i] ?? null;
    else if (a === "--slug") slug = argv[++i] ?? null;
    else if (a === "--note") note = argv[++i] ?? "";
    else if (a === "--refetch") refetch = true;
    else fail(`unrecognised argument: ${a}`);
  }

  if (url === null) fail('--url "<full url>" is required');
  if (slug === null) fail("--slug <filename stem, no extension> is required");

  // The single authoritative source is a locked decision. A generic fetcher is
  // exactly the place that quietly stops being true, so it is enforced rather
  // than assumed.
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return fail(`--url is not a URL: ${url}`);
  }
  if (!/(^|\.)worldsurfleague\.com$/.test(host)) {
    fail(
      `refusing to fetch ${host}.\n` +
        `  worldsurfleague.com is this project's single authoritative source, and that\n` +
        `  is a locked decision. A page from anywhere else needs its own retrieval\n` +
        `  class and its own reasoning, not this script.`,
    );
  }

  // Slug becomes a filename and a join key. Keep it boring.
  if (!/^[a-z0-9_]+$/.test(slug)) {
    fail(`--slug must be lowercase letters, digits and underscores only. Got: ${slug}`);
  }

  console.log(`\n  ${url}`);
  console.log(`  -> docs/sources/raw/${slug}.html`);

  const held = await retrieve(
    url,
    slug,
    { fetch: true, refetch, scriptName: SCRIPT_NAME, userAgent: USER_AGENT },
    note.length > 0
      ? note
      : "Retained by scripts/collect_page.ts. Single-page retention; nothing parsed.",
  );

  console.log(
    `\n  ${held.bytes} bytes  sha ${held.sha256.slice(0, 16)}…  retrieval=${held.retrieval ?? "script_own_ua"}`,
  );
  console.log(`  sidecar -> ${relative(REPO_ROOT, RAW_DIR)}/${slug}.json`);
  console.log(`\n  Nothing has been parsed. Register it with:  npm run register-artefacts\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
