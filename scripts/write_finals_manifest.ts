#!/usr/bin/env tsx
/**
 * write_finals_manifest.ts — give the WSL Finals a Tier 1 manifest, offline
 *
 * Reads bytes already on disk. Fetches nothing. Writes one JSON file.
 *
 * WHY THIS EXISTS
 *   `collect_event.ts` refused both Finals events with "no round nav found",
 *   which was correct — the Finals is a five-surfer single-day ladder and has
 *   no rounds to navigate. But the refusal left the event with no manifest, and
 *   `collect_heat_popups.ts` is manifest-driven, so Tier 2 had no way in.
 *
 *   Then on 19 August the popup links turned out to be there all along, under a
 *   class name the collector was not looking for (see DETAILS_LINK in
 *   collect_heat_popups.ts). So the only thing still standing between the Finals
 *   and its wave data is the missing manifest. This writes it.
 *
 * THE ONE THING IT MUST GET RIGHT
 *   The Finals page carries BOTH divisions — four men's heats and four women's
 *   in one document. The manifest names ONLY the men's four, and the collector
 *   now refuses any heat a round's manifest does not name. Two independent
 *   places have to agree before a women's heat could be collected into a men's
 *   CT corpus.
 *
 *   The division call is the shared one in lib/parse_finals.ts — the same code
 *   ingest_finals.ts uses for the heat entries, so the popups and the ladder
 *   cannot disagree about which heats are men's.
 *
 * Usage:
 *   npm run finals-manifest -- --season 2025
 *   then: npm run collect-popups -- --season 2025 --event 12
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import yaml from "js-yaml";
import { MANIFEST_DIR, RAW_DIR, REPO_ROOT, fail } from "./lib/retain.ts";
import { stripNonMarkup } from "./lib/parse_results.ts";
import { divisionsByHeat, heatOrder, popupLinksByHeat, titleMatchSeries } from "./lib/parse_finals.ts";

function main(): void {
  const argv = process.argv.slice(2);
  let season: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--season") season = Number(argv[++i]);
    else fail(`unrecognised argument: ${argv[i]}`);
  }
  if (season === null || !Number.isInteger(season)) fail("--season <year> is required");

  const specPath = join(REPO_ROOT, `docs/format-spec/seasons/${season}.yaml`);
  if (!existsSync(specPath)) fail(`no season spec at ${relative(REPO_ROOT, specPath)}`);
  const spec = yaml.load(readFileSync(specPath, "utf8")) as { events?: Record<string, unknown>[] };
  const ev = (spec.events ?? []).find((e) => e.format === "finals_five");
  if (!ev) fail(`no event with format: finals_five in ${relative(REPO_ROOT, specPath)}`);

  const eventNumber = Number(ev.number);
  const wslEventId = Number(ev.wsl_event_id);
  const name = String(ev.name);
  const resultsUrl = String(ev.results_url ?? "");
  const slugFromUrl = /\/ct\/\d+\/([a-z0-9-]+)\/results/.exec(resultsUrl)?.[1] ?? null;
  if (slugFromUrl === null) fail(`cannot read an event slug out of results_url: ${resultsUrl}`);

  const pageSlug = `${season}_ct_${wslEventId}_${slugFromUrl.replace(/-/g, "_")}_results`;
  const htmlPath = join(RAW_DIR, `${pageSlug}.html`);
  if (!existsSync(htmlPath)) {
    fail(
      `no retained results page at ${relative(REPO_ROOT, htmlPath)}.\n` +
        `  Collect it first:  npm run collect-page -- --url "${resultsUrl}" --slug ${pageSlug}`,
    );
  }
  const raw = readFileSync(htmlPath);
  const sha = createHash("sha256").update(raw).digest("hex");
  const markup = stripNonMarkup(raw.toString("utf8"));

  // ---- read the page ----------------------------------------------------
  const order = heatOrder(markup);
  const divisions = divisionsByHeat(markup);
  const popups = popupLinksByHeat(markup);

  const undecided = order.filter((h) => !divisions.has(h));
  if (undecided.length > 0) {
    fail(
      `no division could be established for heat(s) ${undecided.join(", ")}.\n` +
        `  This page carries both the men's and the women's Finals. Refusing to write a\n` +
        `  manifest that cannot say which is which.`,
    );
  }

  const mens = order.filter((h) => divisions.get(h) === "mens");
  const womens = order.filter((h) => divisions.get(h) === "womens");

  console.log(`\n${season} ${name} (WSL id ${wslEventId})`);
  console.log(`  page: ${relative(REPO_ROOT, htmlPath)}`);
  console.log(`  ${order.length} heats — ${mens.length} men's, ${womens.length} women's`);
  console.log(`  ${popups.size} heat-details popup link(s) on the page`);

  if (mens.length !== 4) {
    fail(`expected 4 men's matches, found ${mens.length}. Nothing written.`);
  }
  const noPopup = mens.filter((h) => !popups.has(h));
  if (noPopup.length > 0) {
    fail(
      `men's heat(s) ${noPopup.join(", ")} have no heat-details popup link.\n` +
        `  Every other men's heat does. Refusing to write a manifest that would report a\n` +
        `  complete collection after skipping them.`,
    );
  }
  // Belt and braces: the collector filters on heat_ids, so a women's id landing
  // in this list is the one mistake that would not announce itself.
  const leaked = mens.filter((h) => womens.includes(h));
  if (leaked.length > 0) fail(`heat(s) ${leaked.join(", ")} are in both divisions. Nothing written.`);

  for (const h of mens) console.log(`    men's heat ${h}  ->  ${popups.get(h)}`);

  // ---- the Title Match series (added 17 October 2026) --------------------
  // The four blocks above are the four MATCHES. The Title Match is a series,
  // and its heats after the first have no Details link on the page: they are
  // reached from inside heat 1's popup. Before this, the manifest named one
  // heat per match, so 2024 Title Match Heat 2 (102842) was refused by the
  // collector as "not named by this round's manifest" and never collected.
  const series = titleMatchSeries(markup, "mens");
  if (series.heats.length === 0) fail(`no men's Title Match replay links found. Nothing written.`);
  if (series.heats[0].wslHeatId !== mens[3]) {
    fail(`Title Match heat 1 per the replay links is ${series.heats[0].wslHeatId}; the fourth men's block is ${mens[3]}.`);
  }
  const followOn = series.heats.slice(1).map((h) => ({
    heat_id: h.wslHeatId,
    parent_heat_id: series.heats[0].wslHeatId,
    heat_number: h.heatNumber,
    expected_totals: Object.fromEntries(h.totals),
  }));
  const leakedSeries = followOn.filter((f) => womens.includes(f.heat_id));
  if (leakedSeries.length > 0) fail(`series heat(s) ${leakedSeries.map((f) => f.heat_id).join(", ")} are women's. Nothing written.`);
  console.log(`  men's Title Match: ${series.resultText ?? "no result text"} over ${series.heats.length} heat(s)`);
  for (const f of followOn) {
    console.log(`    series heat ${f.heat_number}: ${f.heat_id}, reached from ${f.parent_heat_id}'s popup`);
  }
  const heatIds = [...mens, ...followOn.map((f) => f.heat_id)];

  // ---- write ------------------------------------------------------------
  const manifest = {
    generated_at: new Date().toISOString(),
    generated_by: "scripts/write_finals_manifest.ts",
    generated_from: "bytes already on disk. No request was made to any host.",
    why: [
      "collect_event.ts refuses this page: the WSL Finals has no round navigation,",
      "which is a true statement about the page and not a bug. This manifest exists",
      "so the popup collector, which is manifest-driven, has a way in.",
      "It declares ONE pseudo-round with round_id null, meaning 'the results page",
      "itself, no roundId parameter', and it names only the MEN'S heats: the page",
      "carries both divisions and the collector refuses any heat not named here.",
    ].join(" "),
    season,
    event: {
      number: eventNumber,
      wsl_event_id: wslEventId,
      name,
      results_url: resultsUrl,
    },
    base_page: {
      slug: pageSlug,
      url: resultsUrl,
      file_path: relative(REPO_ROOT, htmlPath),
      sha256: sha,
      fetched_at: statSync(htmlPath).mtime.toISOString(),
      content_length: raw.length,
      retrieval: "script_own_ua",
    },
    divisions: {
      discriminator: "the full-heat-replay link immediately preceding each heat block",
      mens_heat_ids: heatIds,
      mens_title_match_series: {
        result_text: series.resultText,
        heat_ids: series.heats.map((h) => h.wslHeatId),
      },
      womens_heat_ids: womens,
      womens_note:
        "Listed so the count is auditable and so nobody re-derives it. NOT collected: " +
        "this project's scope is the men's Championship Tour.",
    },
    rounds: [
      {
        item_index: 0,
        discovered_via: "finals_ladder",
        round_id: null,
        round_name_displayed: "WSL Finals ladder",
        round_name_gtm: "WSL Finals ladder",
        heats_declared: heatIds.length,
        heats_observed: heatIds.length,
        heats_agree: true,
        heat_ids: heatIds,
        series_follow_on: followOn,
        counting_waves_present: false,
        artefact: {
          slug: pageSlug,
          file_path: relative(REPO_ROOT, htmlPath),
          sha256: sha,
        },
      },
    ],
  };

  mkdirSync(MANIFEST_DIR, { recursive: true });
  const out = join(MANIFEST_DIR, `${pageSlug}.json`);
  if (existsSync(out)) {
    const prior: unknown = JSON.parse(readFileSync(out, "utf8"));
    const by = (prior as { generated_by?: string }).generated_by;
    if (by !== "scripts/write_finals_manifest.ts") {
      fail(
        `${relative(REPO_ROOT, out)} already exists and was written by ${by ?? "something else"}.\n` +
          `  Refusing to overwrite another collector's manifest.`,
      );
    }
  }
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\n  -> ${relative(REPO_ROOT, out)}`);
  console.log(`\n  Now collect the men's popups (${heatIds.length}):`);
  console.log(`     npm run collect-popups -- --season ${season} --event ${eventNumber}\n`);
}

main();
