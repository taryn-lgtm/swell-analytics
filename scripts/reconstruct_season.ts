#!/usr/bin/env tsx
/**
 * reconstruct_season.ts — season reconstruction audit
 *
 * Implements the acceptance gate defined in docs/archive/FORMAT_SPEC.md:
 * using only the rules in the season's spec files plus published results,
 * reproduce WSL's published final standings for every surfer.
 *
 * This is a standing audit check, not a one-off. It reads no database and
 * writes none. It never modifies anything under docs/format-spec/.
 *
 * Usage:
 *   tsx scripts/reconstruct_season.ts --season 2024 --stage 1
 *   tsx scripts/reconstruct_season.ts --season 2024 --stage 1 --no-fetch
 *
 * --no-fetch re-parses the retained artefact and never touches the network
 * (2.0 principle 2: re-parsing never requires re-scraping).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_DIR = join(REPO_ROOT, "docs/format-spec");
const RAW_DIR = join(REPO_ROOT, "docs/sources/raw");
const USER_AGENT =
  "wsl-analytics-research/0.1 (format-spec reconstruction test; +https://github.com/taryn-lgtm/swell-analytics)";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  season: number;
  stage: 1 | 2;
  fetch: boolean;
}

function parseArgs(argv: string[]): Args {
  let season: number | null = null;
  let stage: 1 | 2 = 1;
  let doFetch = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--season") season = Number(argv[++i]);
    else if (arg === "--stage") {
      const s = Number(argv[++i]);
      if (s !== 1 && s !== 2) fail(`--stage must be 1 or 2, got ${s}`);
      stage = s;
    } else if (arg === "--no-fetch") doFetch = false;
    else if (arg === "--fetch") doFetch = true;
    else fail(`unrecognised argument: ${arg}`);
  }

  if (season === null || !Number.isInteger(season)) {
    fail("--season <year> is required");
  }
  return { season: season!, stage, fetch: doFetch };
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Spec loading
//
// 2.0 principle 5: rules live in data, not in code. Every rule applied below is
// read from the YAML. Nothing about the throwaway, the points table, the cut
// position or the event list is hardcoded here.
// ---------------------------------------------------------------------------

interface SpecEvent {
  number: number;
  wsl_event_id: number;
  name: string;
  results_url: string;
  is_post_cut: boolean;
  throwaway_eligible: boolean;
  awards_ranking_points?: boolean;
  round_structure: string;
  format: string;
}

interface Spec {
  season: number;
  events: SpecEvent[];
  regularSeasonEvents: SpecEvent[];
  throwawayEligible: SpecEvent[];
  throwaway: {
    /** era_a.yaml: `counting_events`. No other form is implemented. */
    form: string;
    rule: string;
    eligible_events: string;
    incomplete_block?: string;
    tie_rule?: { on_equal_worst: string; source?: string };
    /** Season files may narrow the eligible set; read but not required here. */
    eligible_event_numbers?: number[];
  };
  /**
   * Derived from `throwaway.form`, not read from a field. Under
   * `counting_events` a season total counts a surfer's best (P - 1) eligible
   * results, where P is the number of throwaway-eligible events the season
   * holds. A surfer with fewer than (P - 1) eligible results drops nothing —
   * that is the `incomplete_block` clause, and it is a consequence of the
   * counting form rather than an exception to it.
   */
  keep: number;
  points: {
    placements: Record<number, number>;
    pipe_multiplier: { applies: boolean };
  };
  cut: { exists: boolean; after_event: number | null; source: string | null };
  rankingsUrl: string;
  raw: { era: Record<string, unknown>; season: Record<string, unknown> };
}

function loadYaml(path: string): Record<string, unknown> {
  if (!existsSync(path)) fail(`spec file not found: ${relative(REPO_ROOT, path)}`);
  return yaml.load(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/**
 * Resolve a spec file across the layouts the format-spec directory has used.
 * Searched in order so a reorganisation of docs/format-spec does not silently
 * break the audit; the resolved path is printed so it is never ambiguous which
 * file was read.
 */
function resolveSpecFile(candidates: string[], what: string): string {
  for (const c of candidates) {
    const p = join(SPEC_DIR, c);
    if (existsSync(p)) return p;
  }
  fail(
    `could not locate ${what}; looked for ${candidates
      .map((c) => `docs/format-spec/${c}`)
      .join(", ")}`,
  );
}

function loadSpec(season: number): Spec {
  const seasonPath = resolveSpecFile(
    [`seasons/${season}.yaml`, `shared/seasons/${season}.yaml`],
    `the ${season} season spec`,
  );
  const seasonSpec = loadYaml(seasonPath);

  const inherits = seasonSpec.inherits as string | undefined;
  if (!inherits) fail(`${season}.yaml declares no 'inherits' block`);
  const eraPath = resolveSpecFile(
    [
      join(dirname(relative(SPEC_DIR, seasonPath)), `${inherits}.yaml`),
      `shared/${inherits}.yaml`,
      `${inherits}.yaml`,
    ],
    `the '${inherits}' era spec inherited by ${season}.yaml`,
  );
  const eraSpec = loadYaml(eraPath);
  console.log(
    `  spec files: ${relative(REPO_ROOT, seasonPath)} + ${relative(REPO_ROOT, eraPath)}`,
  );

  // Season-level keys override era-level keys, one level deep — which is how
  // 2024.yaml's `throwaway.eligible_event_numbers` sits on top of era_a's
  // `throwaway.applies/count/eligible_events/selection`.
  const throwaway = {
    ...(eraSpec.throwaway as Record<string, unknown>),
    ...(seasonSpec.throwaway as Record<string, unknown>),
  } as Spec["throwaway"];

  const points = eraSpec.points as Spec["points"];
  const events = (seasonSpec.events as SpecEvent[]) ?? [];
  if (events.length === 0) fail(`${season}.yaml lists no events`);

  // The throwaway form is derived here and nowhere else. Reading an unknown
  // form is a hard failure rather than a silent no-drop: `c953fed` retracted
  // `applies/count/selection` on 26 July 2026 and this script went on reading
  // them, so every run since printed `applies=undefined count=undefined` and
  // quietly applied no throwaway at all. An unrecognised form must stop the
  // run, not produce a number.
  const throwawayEligible = events.filter((e) => e.throwaway_eligible === true);
  const form = (throwaway as { form?: string }).form;
  if (form !== "counting_events") {
    fail(
      `throwaway.form is ${form === undefined ? "absent" : `'${form}'`}; ` +
        `this script implements 'counting_events' only. If the spec has ` +
        `changed form, change the script — do not edit the spec to fit it.`,
    );
  }
  const keep = throwawayEligible.length - 1;
  if (keep < 1) {
    fail(
      `counting_events needs at least 2 eligible events to define ` +
        `best (P - 1) of P; ${season} declares ${throwawayEligible.length}`,
    );
  }

  const rankingsUrl = (
    (seasonSpec.sources as Record<string, { url: string }>)?.final_rankings
  )?.url;
  if (!rankingsUrl) fail(`${season}.yaml has no sources.final_rankings.url`);

  return {
    season,
    events,
    regularSeasonEvents: events.filter((e) => e.awards_ranking_points !== false),
    throwawayEligible,
    throwaway,
    keep,
    points,
    cut: seasonSpec.cut as Spec["cut"],
    rankingsUrl,
    raw: { era: eraSpec, season: seasonSpec },
  };
}

// ---------------------------------------------------------------------------
// Artefact retrieval
//
// 2.0 principle 2: the raw artefact is written to disk, content-hashed and
// timestamped, BEFORE anything parses it. Parsing is a separate step that
// reads from disk.
// ---------------------------------------------------------------------------

interface Artefact {
  html: string;
  path: string;
  sha256: string;
  fetchedAt: string;
}

async function retrieve(
  url: string,
  slug: string,
  doFetch: boolean,
): Promise<Artefact> {
  const htmlPath = join(RAW_DIR, `${slug}.html`);
  const sidecarPath = join(RAW_DIR, `${slug}.json`);

  if (!doFetch) {
    if (!existsSync(htmlPath)) {
      fail(
        `--no-fetch given but no retained artefact at ${relative(REPO_ROOT, htmlPath)}`,
      );
    }
    const bytes = readFileSync(htmlPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const sidecar = existsSync(sidecarPath)
      ? JSON.parse(readFileSync(sidecarPath, "utf8"))
      : {};
    if (sidecar.sha256 && sidecar.sha256 !== sha256) {
      fail(
        `retained artefact ${slug}.html does not match its sidecar hash — ` +
          `artefact has been modified since capture`,
      );
    }
    console.log(`  reusing retained artefact ${slug}.html (sha256 ${sha256.slice(0, 12)}…)`);
    return {
      html: bytes.toString("utf8"),
      path: htmlPath,
      sha256,
      fetchedAt: sidecar.fetched_at ?? "unknown",
    };
  }

  const fetchedAt = new Date().toISOString();
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  const bytes = Buffer.from(await res.arrayBuffer());

  if (!res.ok) {
    fail(`fetch ${url} returned HTTP ${res.status} (${bytes.length} bytes)`);
  }

  // Write the artefact and its sidecar before returning. Nothing downstream
  // sees the bytes until they are safely on disk.
  writeFileSync(htmlPath, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(
    sidecarPath,
    JSON.stringify(
      {
        url,
        fetched_at: fetchedAt,
        sha256,
        http_status: res.status,
        content_type: res.headers.get("content-type"),
        content_length_bytes: bytes.length,
        content_encoding_on_wire: res.headers.get("content-encoding") ?? null,
        note:
          "Body as delivered to the HTTP client, after transport-level " +
          "decompression. sha256 is over the bytes of the .html file as written.",
        fetched_by: "scripts/reconstruct_season.ts",
        user_agent: USER_AGENT,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `  retained ${slug}.html — ${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}…`,
  );
  return { html: bytes.toString("utf8"), path: htmlPath, sha256, fetchedAt };
}

// ---------------------------------------------------------------------------
// Rankings table parser
//
// Read POSITIONALLY. Cells are never dropped, never filtered. A non-contested
// event renders as "-", which becomes `points: null` — distinct from a real 0.
// Two traps this parser exists to survive:
//   - a nested <span class="asterisk">*</span> inside the points cell, used to
//     mark replacement and withdrawal appearances
//   - "-" cells that still carry a placing in their tooltip: a post-cut
//     wildcard appearance, which produces a place but no ranking points
// ---------------------------------------------------------------------------

interface EventCell {
  columnIndex: number;
  eventNumber: number | null;
  points: number | null;
  place: number | null;
  pointsInTooltip: number | null;
  markedThrowaway: boolean;
  hasNoCountClass: boolean;
  statusNote: string | null;
  rawText: string;
}

interface SurferRow {
  publishedRank: number;
  name: string;
  country: string | null;
  finalsPlacing: number | null;
  cells: EventCell[];
  publishedTotal: number;
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * Tooltips are a JSON blob inside an HTML attribute, so they are
 * entity-encoded twice AND JSON-escaped: a closing tag arrives as
 * `&lt;\/span&gt;`. Without unescaping the `\/`, every regex anchored on a
 * closing tag silently matches nothing.
 */
function decodeTooltip(s: string): string {
  return decodeEntities(decodeEntities(s))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[,\s*]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Column-order -> event-number binding, taken from the header, never assumed. */
function bindColumnsToEvents(html: string, spec: Spec): (number | null)[] {
  const thead = section(html, "thead");
  const headers = [
    ...thead.matchAll(
      /<th\b[^>]*class="athlete-event-place[^"]*"[^>]*>([\s\S]*?)<\/th>/g,
    ),
  ].map((m) => {
    const tip = /data-tooltip="([\s\S]*?)"[\s>]/.exec(m[1]);
    return tip ? stripTags(decodeTooltip(tip[1])) : "";
  });

  const expected = spec.regularSeasonEvents;
  if (headers.length !== expected.length) {
    fail(
      `header has ${headers.length} event columns but ${spec.season}.yaml lists ` +
        `${expected.length} point-awarding events — spec and source disagree`,
    );
  }

  return headers.map((header, i) => {
    // Header carries the sponsored name ("Lexus Pipe Pro presented by YETI");
    // the spec carries the short name. Match on containment, in column order,
    // then assert the positions agree.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const h = norm(header);
    const match = expected.find(
      (e) => h.includes(norm(e.name)) || norm(e.name).includes(h),
    );
    if (!match) {
      fail(
        `event column ${i + 1} ("${header}") matches no event name in ` +
          `${spec.season}.yaml — cannot bind columns positionally`,
      );
    }
    if (match.number !== expected[i].number) {
      fail(
        `event column ${i + 1} ("${header}") binds to event ${match.number} but ` +
          `the spec lists event ${expected[i].number} in that position — ` +
          `column order and spec order diverge, refusing to guess`,
      );
    }
    return match.number;
  });
}

function section(html: string, tag: string): string {
  const start = html.indexOf(`<${tag}`);
  const end = html.indexOf(`</${tag}>`);
  if (start < 0 || end < 0) fail(`could not locate <${tag}> in artefact`);
  return html.slice(start, end);
}

function parseEventCell(
  raw: string,
  columnIndex: number,
  eventNumber: number | null,
): EventCell {
  const tipMatch = /data-tooltip="([\s\S]*?)"[\s>]/.exec(raw);
  const tip = tipMatch ? decodeTooltip(tipMatch[1]) : "";

  const placeMatch = /<span>(\d+)(?:st|nd|rd|th) Place<\/span>/.exec(tip);
  const tipPointsMatch = /<span>([\d,]+) Points<\/span>/.exec(tip);
  const noteMatch = /<span class="status-note">([\s\S]*?)<\/span>/.exec(tip);

  // Cell text with the asterisk marker span removed, so "265*" reads as 265
  // and "-*" reads as "-".
  const cellText = stripTags(raw.replace(/<span class="asterisk">[\s\S]*?<\/span>/g, ""));

  return {
    columnIndex,
    eventNumber,
    points: parseNumber(cellText),
    place: placeMatch ? Number(placeMatch[1]) : null,
    pointsInTooltip: tipPointsMatch ? parseNumber(tipPointsMatch[1]) : null,
    markedThrowaway: /<span>Throwaway<\/span>/.test(tip),
    hasNoCountClass: /class="[^"]*\bno-count\b[^"]*"/.test(raw),
    statusNote: noteMatch ? stripTags(noteMatch[1]) : null,
    rawText: cellText,
  };
}

function parseRankingsTable(html: string, spec: Spec): SurferRow[] {
  const binding = bindColumnsToEvents(html, spec);
  const tbody = section(html, "tbody");
  const rows = [...tbody.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  const parsed: SurferRow[] = [];

  for (const row of rows) {
    // Divider rows (the "Final 5 Cutoff" line) carry no athlete and are skipped
    // explicitly rather than by falling through a filter.
    if (/\bcut-off-row\b/.test(row)) continue;
    const nameMatch = /class="athlete-name"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    if (!nameMatch) continue;

    const cells = [
      ...row.matchAll(/<td\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g),
    ];
    const eventCells: EventCell[] = [];
    let rank: number | null = null;
    let finals: number | null = null;
    let total: number | null = null;

    for (const [, cls, val] of cells) {
      if (cls.includes("athlete-event-place")) {
        eventCells.push(
          parseEventCell(val, eventCells.length + 1, binding[eventCells.length] ?? null),
        );
      } else if (cls.includes("athlete-rank") && cls.includes("stat")) {
        rank = parseNumber(stripTags(val));
      } else if (cls.includes("athlete-finalist")) {
        finals = parseNumber(stripTags(val));
      } else if (cls.includes("athlete-points")) {
        total = parseNumber(stripTags(val));
      }
    }

    if (eventCells.length !== spec.regularSeasonEvents.length) {
      fail(
        `row for ${stripTags(nameMatch[1])} yielded ${eventCells.length} event ` +
          `cells, expected ${spec.regularSeasonEvents.length} — positional ` +
          `alignment cannot be trusted, refusing to continue`,
      );
    }
    if (rank === null || total === null) {
      fail(`row for ${stripTags(nameMatch[1])} has no parseable rank or total`);
    }

    const countryMatch = /class="athlete-country-name">([\s\S]*?)<\/span>/.exec(row);
    parsed.push({
      publishedRank: rank,
      name: stripTags(nameMatch[1]),
      country: countryMatch ? stripTags(countryMatch[1]) : null,
      finalsPlacing: finals,
      cells: eventCells,
      publishedTotal: total,
    });
  }

  if (parsed.length === 0) fail("parsed zero surfer rows from the artefact");
  return parsed;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

type Verdict =
  | "PRECUT_DROP"
  | "NO_DROP"
  | "AMBIGUOUS"
  | "CONTRADICTS"
  | "NOT_TESTABLE";

interface Reconciliation {
  row: SurferRow;
  verdict: Verdict;
  sum: number;
  eligibleCount: number;
  contestedCount: number;
  /** Events with a published placing but no points — post-cut wildcard runs. */
  unscoredAppearances: EventCell[];
  predictedDrop: EventCell | null;
  wslMarkedDrop: EventCell | null;
  dropValueTied: boolean;
  selectionAgrees: boolean | null;
  /** Total the spec AS WRITTEN produces, and whether it matches the published one. */
  specTotal: number | null;
  specReproduces: boolean;
  /** Total under the candidate "keep best (n - count) eligible results" rule. */
  altTotal: number | null;
  altReproduces: boolean;
  detail: string;
}

function reconcile(row: SurferRow, spec: Spec): Reconciliation {
  const eligibleNumbers = new Set(spec.throwawayEligible.map((e) => e.number));
  const scored = row.cells.filter((c) => c.points !== null);
  const eligible = scored.filter(
    (c) => c.eventNumber !== null && eligibleNumbers.has(c.eventNumber),
  );
  const sum = scored.reduce((a, c) => a + (c.points ?? 0), 0);

  const unscoredAppearances = row.cells.filter(
    (c) => c.points === null && c.place !== null,
  );
  const wslMarkedDrop = row.cells.find((c) => c.markedThrowaway) ?? null;

  // Predicted drop, from the spec only. Under `counting_events` a drop exists
  // only where the surfer holds MORE eligible results than the season counts:
  // dropCount = eligible - keep, floored at zero. The tie rule is era_a.yaml's
  // `tie_rule.on_equal_worst: earliest event`, applied by sorting equal points
  // by event number, so the event named is deterministic rather than an
  // artefact of cell order.
  const minEligible = eligible.length
    ? Math.min(...eligible.map((c) => c.points as number))
    : null;
  const tiedForMin = eligible.filter((c) => c.points === minEligible);
  const ascending = [...eligible].sort(
    (a, b) =>
      (a.points ?? 0) - (b.points ?? 0) ||
      (a.eventNumber ?? 0) - (b.eventNumber ?? 0),
  );
  const dropCount = Math.max(0, eligible.length - spec.keep);
  const predictedDrop = dropCount > 0 ? ascending[0] : null;

  const minOverall = scored.length
    ? Math.min(...scored.map((c) => c.points as number))
    : null;

  const hNoDrop = sum;
  const hPreCut = minEligible === null ? null : sum - minEligible;
  const hOverall = minOverall === null ? null : sum - minOverall;

  // The spec AS WRITTEN, which since 26 July 2026 is the counting form:
  // count the best `keep` eligible results, drop the excess. A surfer holding
  // `keep` or fewer eligible results drops nothing.
  const specDrops = ascending.slice(0, dropCount);
  const specTotal = sum - specDrops.reduce((a, c) => a + (c.points ?? 0), 0);

  // The retracted form, kept as the contrast case so the two remain
  // distinguishable in the output: an unconditional single drop of the worst
  // eligible result, applied even to an incomplete block. This is what
  // `PATCH_era_a_2026-07-26` superseded; it is evaluated, never written.
  const altDrops = eligible.length > 0 ? ascending.slice(0, 1) : [];
  const altTotal = sum - altDrops.reduce((a, c) => a + (c.points ?? 0), 0);

  const t = row.publishedTotal;
  let verdict: Verdict;
  let detail: string;

  if (scored.length === 0) {
    verdict = "NOT_TESTABLE";
    detail = "no scored events; nothing to reconcile";
  } else if (hPreCut !== null && t === hPreCut && hPreCut !== hNoDrop) {
    // A pre-cut drop reproduces the total, and doing nothing does not.
    if (hOverall !== null && hOverall !== hPreCut) {
      verdict = "PRECUT_DROP";
      detail = `sum ${fmt(sum)} - worst pre-cut ${fmt(minEligible!)} = ${fmt(t)}; drop-worst-overall would give ${fmt(hOverall)}`;
    } else {
      verdict = "AMBIGUOUS";
      detail = `sum ${fmt(sum)} - ${fmt(minEligible!)} = ${fmt(t)}, but the worst pre-cut result is also the worst overall, so this row cannot discriminate between the two rules`;
    }
  } else if (t === hNoDrop) {
    verdict = "NO_DROP";
    detail = `published total equals the raw sum of ${scored.length} scored event(s); no drop applied, but the spec as written predicts ${fmt(specTotal)}`;
  } else {
    verdict = "CONTRADICTS";
    detail = `published ${fmt(t)} matches no hypothesis — no drop ${fmt(hNoDrop)}, drop worst pre-cut ${hPreCut === null ? "n/a" : fmt(hPreCut)}, drop worst overall ${hOverall === null ? "n/a" : fmt(hOverall)}`;
  }

  const selectionAgrees =
    wslMarkedDrop === null || predictedDrop === null
      ? null
      : wslMarkedDrop.eventNumber === predictedDrop.eventNumber ||
        wslMarkedDrop.points === predictedDrop.points;

  return {
    row,
    verdict,
    sum,
    eligibleCount: eligible.length,
    contestedCount: scored.length,
    unscoredAppearances,
    predictedDrop,
    wslMarkedDrop,
    dropValueTied: tiedForMin.length > 1,
    selectionAgrees,
    specTotal,
    specReproduces: specTotal === row.publishedTotal,
    altTotal,
    altReproduces: altTotal === row.publishedTotal,
    detail,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-GB");
}

/** Rule 1.05(e): the top five ranking positions are reassigned by Finals placing. */
function reconstructRanks(
  results: Reconciliation[],
  spec: Spec,
): { expected: number; actual: number; name: string; note: string }[] {
  const finalsField = (spec.raw.era as { round_structures?: Record<string, { field?: number }> })
    .round_structures?.wsl_finals?.field;
  if (!finalsField) fail("era spec has no round_structures.wsl_finals.field");

  const byPoints = [...results].sort(
    (a, b) => b.row.publishedTotal - a.row.publishedTotal,
  );
  const finalists = byPoints.slice(0, finalsField);
  const rest = byPoints.slice(finalsField);

  const assigned: { name: string; rank: number; note: string }[] = [];
  for (const f of finalists) {
    const placing = f.row.finalsPlacing;
    if (placing === null) {
      assigned.push({
        name: f.row.name,
        rank: NaN,
        note: "in the top 5 on points but carries no Finals placing",
      });
      continue;
    }
    assigned.push({ name: f.row.name, rank: placing, note: "by Finals placing" });
  }
  rest.forEach((r, i) => {
    assigned.push({
      name: r.row.name,
      rank: finalsField + i + 1,
      note: "by points",
    });
  });

  return assigned.map((a) => {
    const row = results.find((r) => r.row.name === a.name)!.row;
    return {
      name: a.name,
      expected: a.rank,
      actual: row.publishedRank,
      note: a.note,
    };
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = loadSpec(args.season);

  console.log(`\n${spec.season} men's CT — reconstruction test, stage ${args.stage}`);
  console.log(
    `  spec: ${spec.events.length} events, ` +
      `${spec.regularSeasonEvents.length} awarding points, ` +
      `${spec.throwawayEligible.length} throwaway-eligible ` +
      `(cut after event ${spec.cut.after_event ?? "null"})`,
  );
  console.log(
    `  throwaway: form=${spec.throwaway.form} ` +
      `keep best ${spec.keep} of ${spec.throwawayEligible.length} eligible ` +
      `(${spec.throwaway.eligible_events}), ` +
      `tie on equal worst = ${spec.throwaway.tie_rule?.on_equal_worst ?? "unspecified"}`,
  );

  const artefact = await retrieve(
    spec.rankingsUrl,
    `${spec.season}_mct_final_rankings`,
    args.fetch,
  );

  if (args.stage !== 1) {
    fail("stage 2 not yet implemented");
  }

  const rows = parseRankingsTable(artefact.html, spec);
  const results = rows.map((r) => reconcile(r, spec));

  // ---- per-row table
  console.log(`\n  ${rows.length} surfer rows parsed\n`);
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(
    `  ${pad("rk", 3)} ${pad("surfer", 21)} ${pad("scored", 6)} ${pad("elig", 4)} ` +
      `${pad("sum", 8)} ${pad("published", 9)} ${pad("verdict", 12)} drop`,
  );
  for (const r of results) {
    const drop = r.wslMarkedDrop
      ? `e${r.wslMarkedDrop.eventNumber}=${fmt(r.wslMarkedDrop.points ?? 0)}` +
        (r.selectionAgrees === false ? " MISMATCH" : "") +
        (r.dropValueTied ? " (tied)" : "")
      : "none";
    console.log(
      `  ${pad(String(r.row.publishedRank), 3)} ${pad(r.row.name, 21)} ` +
        `${pad(String(r.contestedCount), 6)} ${pad(String(r.eligibleCount), 4)} ` +
        `${pad(fmt(r.sum), 8)} ${pad(fmt(r.row.publishedTotal), 9)} ` +
        `${pad(r.verdict, 12)} ${drop}`,
    );
  }

  // ---- verdict tallies
  const tally = new Map<Verdict, number>();
  for (const r of results) tally.set(r.verdict, (tally.get(r.verdict) ?? 0) + 1);
  console.log("\n  verdicts:");
  for (const [v, n] of [...tally].sort()) console.log(`    ${pad(v, 13)} ${n}`);

  // ---- selection-rule agreement (stronger than totals alone)
  const withMarker = results.filter((r) => r.wslMarkedDrop);
  const agree = withMarker.filter((r) => r.selectionAgrees === true);
  const disagree = withMarker.filter((r) => r.selectionAgrees === false);
  console.log(
    `\n  selection rule: ${agree.length}/${withMarker.length} rows where the ` +
      `spec's predicted drop matches the event WSL marked as Throwaway`,
  );
  for (const r of disagree) {
    console.log(
      `    MISMATCH ${r.row.name}: WSL marked event ${r.wslMarkedDrop!.eventNumber} ` +
        `(${fmt(r.wslMarkedDrop!.points ?? 0)}), spec predicts event ` +
        `${r.predictedDrop?.eventNumber} (${fmt(r.predictedDrop?.points ?? 0)})`,
    );
  }

  // ---- no-drop rows, diagnosed
  const noDrop = results.filter((r) => r.verdict === "NO_DROP");
  if (noDrop.length) {
    console.log(`\n  rows with no drop applied (${noDrop.length}):`);
    for (const r of noDrop) {
      const missing = spec.throwawayEligible
        .filter(
          (e) =>
            r.row.cells.find((c) => c.eventNumber === e.number)?.points === null,
        )
        .map((e) => e.number);
      console.log(
        `    ${r.row.name} — ${r.contestedCount} scored, ` +
          `${r.eligibleCount}/${spec.throwawayEligible.length} eligible events contested` +
          (missing.length ? `, missing eligible event(s) ${missing.join(", ")}` : ""),
      );
      const notes = r.row.cells
        .filter((c) => c.statusNote)
        .map((c) => `e${c.eventNumber}: ${c.statusNote}`);
      for (const n of notes) console.log(`      ${n}`);
    }
  }

  // ---- does the spec AS WRITTEN reproduce every published total?
  const specFails = results.filter((r) => !r.specReproduces);
  console.log(
    `\n  spec as written reproduces ${results.length - specFails.length}/${results.length} published totals`,
  );
  for (const r of specFails) {
    console.log(
      `    FAIL ${pad(r.row.name, 21)} spec predicts ${fmt(r.specTotal ?? 0)}, ` +
        `published ${fmt(r.row.publishedTotal)} ` +
        `(${r.eligibleCount}/${spec.throwawayEligible.length} eligible events contested)`,
    );
  }

  const altFails = results.filter((r) => !r.altReproduces);
  console.log(
    `  retracted rule "drop the worst eligible result unconditionally" reproduces ` +
      `${results.length - altFails.length}/${results.length} published totals ` +
      `(contrast case — superseded by PATCH_era_a_2026-07-26, never written to the spec)`,
  );
  for (const r of altFails) {
    console.log(
      `    FAIL ${pad(r.row.name, 21)} candidate predicts ${fmt(r.altTotal ?? 0)}, ` +
        `published ${fmt(r.row.publishedTotal)}`,
    );
  }

  // ---- the throwaway-eligibility hypothesis, tested rather than assumed
  console.log("\n  throwaway by completeness of the eligible block:");
  const full = results.filter(
    (r) => r.eligibleCount === spec.throwawayEligible.length,
  );
  const partial = results.filter(
    (r) => r.eligibleCount < spec.throwawayEligible.length,
  );
  const dropped = (rs: Reconciliation[]) => rs.filter((r) => r.wslMarkedDrop).length;
  console.log(
    `    all ${spec.throwawayEligible.length} eligible events contested: ` +
      `${dropped(full)}/${full.length} rows carry a drop`,
  );
  console.log(
    `    fewer than ${spec.throwawayEligible.length} contested: ` +
      `${dropped(partial)}/${partial.length} rows carry a drop`,
  );

  // ---- cut-eliminated cohort: the untested question in THROWAWAY_DERIVATION.md
  const incomplete = results.filter(
    (r) => r.contestedCount < spec.regularSeasonEvents.length,
  );
  console.log(
    `\n  surfers with fewer than ${spec.regularSeasonEvents.length} scored events ` +
      `(${incomplete.length} rows — the cohort recorded as untested):`,
  );
  const incTally = new Map<Verdict, number>();
  for (const r of incomplete)
    incTally.set(r.verdict, (incTally.get(r.verdict) ?? 0) + 1);
  for (const [v, n] of [...incTally].sort()) console.log(`    ${pad(v, 13)} ${n}`);

  // ---- placings without points
  const unscored = results.filter((r) => r.unscoredAppearances.length > 0);
  if (unscored.length) {
    const appearances = unscored.reduce(
      (a, r) => a + r.unscoredAppearances.length,
      0,
    );
    console.log(
      `\n  appearances with a published placing but no points ` +
        `(${appearances} across ${unscored.length} surfers):`,
    );
    for (const r of unscored) {
      for (const c of r.unscoredAppearances) {
        console.log(
          `    ${pad(r.row.name, 21)} event ${c.eventNumber}: ${c.place}th place, ` +
            `no points — ${c.statusNote ?? "no status note"}`,
        );
      }
    }
  }

  // ---- rank reconstruction
  console.log("\n  rank reconstruction (Rule 1.05(e) reallocation of the top five):");
  const ranks = reconstructRanks(results, spec);
  const rankFails = ranks.filter((r) => r.expected !== r.actual);
  if (rankFails.length === 0) {
    console.log(`    all ${ranks.length} rows match the published rank order`);
  } else {
    for (const f of rankFails) {
      console.log(
        `    MISMATCH ${f.name}: reconstructed ${f.expected}, published ${f.actual} (${f.note})`,
      );
    }
  }

  // ---- integrity cross-checks
  const tipDisagree = rows.flatMap((r) =>
    r.cells.filter(
      (c) =>
        c.points !== null &&
        c.pointsInTooltip !== null &&
        c.points !== c.pointsInTooltip,
    ).map((c) => `${r.name} event ${c.eventNumber}`),
  );
  const classDisagree = rows.flatMap((r) =>
    r.cells.filter((c) => c.markedThrowaway !== c.hasNoCountClass)
      .map((c) => `${r.name} event ${c.eventNumber}`),
  );
  console.log("\n  source integrity:");
  console.log(
    `    cell text vs tooltip points: ${tipDisagree.length} disagreements` +
      (tipDisagree.length ? ` — ${tipDisagree.join(", ")}` : ""),
  );
  console.log(
    `    "Throwaway" label vs no-count class: ${classDisagree.length} disagreements` +
      (classDisagree.length ? ` — ${classDisagree.join(", ")}` : ""),
  );

  // The gate is reconstruction from the spec, so any row the spec cannot
  // reproduce is a failure — including rows where the spec applies a drop that
  // WSL did not. "Published total equals the raw sum" is not a pass.
  const failed = results.filter((r) => !r.specReproduces);
  const pass = failed.length === 0 && rankFails.length === 0;
  console.log(
    `\n  STAGE 1: ${pass ? "PASS" : "FAIL"} — ${results.length} rows tested, ` +
      `${results.length - failed.length} reconciled, ${failed.length} failed, ` +
      `${rankFails.length} rank mismatch(es)\n`,
  );
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
