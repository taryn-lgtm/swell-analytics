/**
 * controls.ts — positive and negative controls for every counted selector
 *
 * THE PROBLEM THIS SOLVES
 *   Nine times in this project, an absence produced by an instrument has been
 *   recorded as an absence in the world. CLAUDE.md states the rule that forbids
 *   it. Stating the rule has not worked: in the moment, a selector's output does
 *   not feel like an inference, it feels like an observation.
 *
 *   So the rule is made to fire on its own, before any counting happens.
 *
 * HOW
 *   docs/sources/controls.json pins each selector to a retained artefact where
 *   the thing is KNOWN PRESENT, with an exact count, and where useful to one
 *   where it is known absent. verifyControls() re-runs the real counting
 *   functions — the same ones the harness uses, not copies — and refuses to let
 *   the run proceed if any disagree.
 *
 *   present mismatch -> the selector has stopped matching. Every zero it
 *                       produces this run would be a false negative.
 *   absent  mismatch -> the selector is too loose. The interference counter
 *                       matched the inlined stylesheet and reported interference
 *                       on two pages that have none.
 *
 * WHAT A FAILURE MEANS
 *   NOT that WSL changed. It means the selector and the artefact disagree, and
 *   which one is wrong is a question for a human. The script stops and says so
 *   rather than guessing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT, classMarkerCount, fail, isRecord } from "./retain.ts";
import { attributionFailure, duplicateFailure, seriesTotalsFailure } from "./popup_guards.ts";

interface PopupPositive {
  artefact: string;
  heatId: string;
}
interface PopupNegative {
  artefact: string;
  claimedHeatId: string;
  actualHeatId: string;
}
interface PopupControls {
  positive: PopupPositive[];
  negative: PopupNegative[];
  duplicateSha: string | null;
}

interface SeriesControl {
  artefact: string;
  claimedHeatId: string;
  expectedTotals: Record<string, number>;
}

/** The popup_series_totals block. Absent block means no series controls. */
function loadSeriesControls(): { positive: SeriesControl[]; negative: SeriesControl[] } {
  const raw: unknown = JSON.parse(readFileSync(CONTROLS_PATH, "utf8"));
  const block = isRecord(raw) ? raw.popup_series_totals : undefined;
  if (!isRecord(block)) return { positive: [], negative: [] };
  const read = (v: unknown): SeriesControl[] =>
    (Array.isArray(v) ? v : [])
      .filter(isRecord)
      .filter((c) => typeof c.artefact === "string" && isRecord(c.expected_totals))
      .map((c) => ({
        artefact: c.artefact as string,
        claimedHeatId: String(c.claimed_heat_id ?? c.heat_id ?? ""),
        expectedTotals: Object.fromEntries(
          Object.entries(c.expected_totals as Record<string, unknown>).map(([k, v]) => [k, Number(v)]),
        ),
      }));
  return { positive: read(block.positive), negative: read(block.negative) };
}

/** The popup_attribution block. Absent block means no popup controls, not a
 *  failure — the file predates them. */
function loadPopupControls(): PopupControls {
  const raw: unknown = JSON.parse(readFileSync(CONTROLS_PATH, "utf8"));
  const block = isRecord(raw) ? raw.popup_attribution : undefined;
  if (!isRecord(block)) return { positive: [], negative: [], duplicateSha: null };

  const positive = (Array.isArray(block.positive) ? block.positive : [])
    .filter(isRecord)
    .filter((p) => typeof p.artefact === "string" && typeof p.heat_id === "string")
    .map((p) => ({ artefact: p.artefact as string, heatId: p.heat_id as string }));

  const negative = (Array.isArray(block.negative) ? block.negative : [])
    .filter(isRecord)
    .filter(
      (n) => typeof n.artefact === "string" && typeof n.claimed_heat_id === "string",
    )
    .map((n) => ({
      artefact: n.artefact as string,
      claimedHeatId: n.claimed_heat_id as string,
      actualHeatId: typeof n.actual_heat_id === "string" ? n.actual_heat_id : "unknown",
    }));

  const pair = isRecord(block.duplicate_pair) ? block.duplicate_pair : undefined;
  const duplicateSha = pair && typeof pair.sha256 === "string" ? pair.sha256 : null;

  return { positive, negative, duplicateSha };
}

const CONTROLS_PATH = join(REPO_ROOT, "docs/sources/controls.json");

type ControlKind = "class" | "attribute-distinct";

interface Side {
  artefact: string;
  expected?: number;
  note?: string;
}

interface Control {
  marker: string;
  kind: ControlKind;
  present?: Side;
  absent?: Side;
  guards?: string;
}

/** Distinct values of an attribute, e.g. data-heat-id. */
function attributeDistinct(html: string, attr: string): number {
  const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new Set([...html.matchAll(new RegExp(`${escaped}="([^"]+)"`, "g"))].map((m) => m[1]))
    .size;
}

function count(html: string, marker: string, kind: ControlKind): number {
  return kind === "class" ? classMarkerCount(html, marker) : attributeDistinct(html, marker);
}

function parseSide(v: unknown): Side | undefined {
  if (!isRecord(v)) return undefined;
  if (typeof v.artefact !== "string") return undefined;
  return {
    artefact: v.artefact,
    expected: typeof v.expected === "number" ? v.expected : undefined,
    note: typeof v.note === "string" ? v.note : undefined,
  };
}

function loadControls(): Control[] {
  if (!existsSync(CONTROLS_PATH)) {
    fail(
      `no controls file at ${relative(REPO_ROOT, CONTROLS_PATH)}. Refusing to count ` +
        `anything with unverified selectors.`,
    );
  }
  const parsed: unknown = JSON.parse(readFileSync(CONTROLS_PATH, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.controls)) {
    fail(`${relative(REPO_ROOT, CONTROLS_PATH)} has no \`controls\` array`);
  }
  const out: Control[] = [];
  for (const c of parsed.controls) {
    if (!isRecord(c)) continue;
    const { marker, kind } = c;
    if (typeof marker !== "string") fail("a control has no marker");
    if (kind !== "class" && kind !== "attribute-distinct") {
      fail(`control "${marker}" has kind ${JSON.stringify(kind)}; expected class | attribute-distinct`);
    }
    out.push({
      marker,
      kind,
      present: parseSide(c.present),
      absent: parseSide(c.absent),
      guards: typeof c.guards === "string" ? c.guards : undefined,
    });
  }
  if (out.length === 0) fail("controls file holds no controls");
  return out;
}

const htmlCache = new Map<string, string>();

function readArtefact(rel: string): string | null {
  const cached = htmlCache.get(rel);
  if (cached !== undefined) return cached;
  const path = join(REPO_ROOT, rel);
  if (!existsSync(path)) return null;

  // A control artefact must still match its sidecar. A control checked against
  // modified bytes proves nothing.
  const raw = readFileSync(path);
  const sidecarPath = path.replace(/\.[^.]+$/, ".json");
  if (existsSync(sidecarPath)) {
    const parsed: unknown = JSON.parse(readFileSync(sidecarPath, "utf8"));
    if (isRecord(parsed) && typeof parsed.sha256 === "string") {
      const sha = createHash("sha256").update(raw).digest("hex");
      if (sha !== parsed.sha256) {
        fail(
          `control artefact ${rel} does not match its sidecar hash. It has been ` +
            `modified since capture, so it cannot serve as a control.`,
        );
      }
    }
  }
  const html = raw.toString("utf8");
  htmlCache.set(rel, html);
  return html;
}

export interface ControlResult {
  checked: number;
  skipped: string[];
}

/**
 * Verify every control. Fails the run on any mismatch.
 *
 * `quiet` prints only the summary line; a failure always prints in full.
 */
export function verifyControls(quiet = true): ControlResult {
  const controls = loadControls();
  const failures: string[] = [];
  const skipped: string[] = [];
  let checked = 0;

  for (const c of controls) {
    if (c.present) {
      const html = readArtefact(c.present.artefact);
      if (html === null) {
        skipped.push(`${c.marker} (present): ${c.present.artefact} not on disk`);
      } else if (c.present.expected === undefined) {
        skipped.push(`${c.marker} (present): no expected count in the controls file`);
      } else {
        const got = count(html, c.marker, c.kind);
        checked += 1;
        if (got !== c.present.expected) {
          failures.push(
            `  ${c.marker}\n` +
              `    POSITIVE CONTROL FAILED — expected ${c.present.expected}, got ${got}\n` +
              `    artefact: ${c.present.artefact}\n` +
              (c.guards ? `    guards:   ${c.guards}\n` : "") +
              `    The selector has stopped matching. Every zero it produces this run\n` +
              `    would be a false negative. This is a fact about the selector, NOT\n` +
              `    about worldsurfleague.com.`,
          );
        }
      }
    }

    if (c.absent) {
      const html = readArtefact(c.absent.artefact);
      if (html === null) {
        skipped.push(`${c.marker} (absent): ${c.absent.artefact} not on disk`);
      } else {
        const got = count(html, c.marker, c.kind);
        checked += 1;
        if (got !== 0) {
          failures.push(
            `  ${c.marker}\n` +
              `    NEGATIVE CONTROL FAILED — expected 0, got ${got}\n` +
              `    artefact: ${c.absent.artefact}\n` +
              (c.absent.note ? `    why:      ${c.absent.note}\n` : "") +
              `    The selector is matching something it should not — most likely the\n` +
              `    inlined stylesheet rather than real markup. Every count it produces\n` +
              `    this run is inflated.`,
          );
        }
      }
    }
  }

  // Popup attribution controls. These exercise the guards the Tier 2 collector
  // actually calls, over the real output of the 17 August misattribution defect
  // rather than a fabricated wrong-id fixture. A guard tested only against an
  // imagined failure is the athleteBlockCount mistake again.
  const popup = loadPopupControls();
  for (const p of popup.positive) {
    const html = readArtefact(p.artefact);
    if (html === null) {
      skipped.push(`popup attribution (positive): ${p.artefact} not on disk`);
      continue;
    }
    checked += 1;
    const bad = attributionFailure(html, p.heatId);
    if (bad !== null) {
      failures.push(
        `  popup attribution — ${p.artefact}\n` +
          `    POSITIVE CONTROL FAILED — a known-good capture was rejected\n` +
          `    ${bad}\n` +
          `    Guard (a) is over-strict, or WSL has changed how the popup names its heat.`,
      );
    }
  }
  for (const n of popup.negative) {
    const html = readArtefact(n.artefact);
    if (html === null) {
      skipped.push(`popup attribution (negative): ${n.artefact} not on disk`);
      continue;
    }
    checked += 1;
    if (attributionFailure(html, n.claimedHeatId) === null) {
      failures.push(
        `  popup attribution — ${n.artefact}\n` +
          `    NEGATIVE CONTROL FAILED — guard (a) ACCEPTED a known-misattributed capture\n` +
          `    filed as heat ${n.claimedHeatId}, actually heat ${n.actualHeatId}\n` +
          `    The guard is not doing its job. Tier 2 collection is unsafe until it is.`,
      );
    }
  }
  if (popup.duplicateSha !== null) {
    checked += 1;
    const accepted = duplicateFailure(
      popup.duplicateSha,
      "105130",
      { sha: popup.duplicateSha, heatId: "105160" },
    );
    if (accepted === null) {
      failures.push(
        `  popup attribution — duplicate pair\n` +
          `    NEGATIVE CONTROL FAILED — guard (b) ACCEPTED a byte-identical repeat\n` +
          `    sha256 ${popup.duplicateSha.slice(0, 16)}… was filed under two heat ids.`,
      );
    }
  }

  // Series-heat totals (guard c). The negative is heat 1's popup filed as
  // heat 2: it must pass guard (a) -- that is the hole -- and fail guard (c).
  const series = loadSeriesControls();
  for (const p of series.positive) {
    const html = readArtefact(p.artefact);
    if (html === null) {
      skipped.push(`series totals (positive): ${p.artefact} not on disk`);
      continue;
    }
    checked += 1;
    const bad = seriesTotalsFailure(html, p.expectedTotals);
    if (bad !== null) {
      failures.push(
        `  series totals — ${p.artefact}\n` +
          `    POSITIVE CONTROL FAILED — a known-good capture was rejected\n    ${bad}`,
      );
    }
  }
  for (const n of series.negative) {
    const html = readArtefact(n.artefact);
    if (html === null) {
      skipped.push(`series totals (negative): ${n.artefact} not on disk`);
      continue;
    }
    checked += 1;
    if (seriesTotalsFailure(html, n.expectedTotals) === null) {
      failures.push(
        `  series totals — ${n.artefact}\n` +
          `    NEGATIVE CONTROL FAILED — guard (c) ACCEPTED heat 1's popup filed as heat ${n.claimedHeatId}.\n` +
          `    Series-heat collection is unsafe until it rejects this.`,
      );
    }
    if (attributionFailure(html, n.claimedHeatId) !== null) {
      failures.push(
        `  series totals — ${n.artefact}\n` +
          `    The negative control no longer passes guard (a), so it no longer shows the hole\n` +
          `    guard (c) exists for. Re-establish the control before trusting either guard.`,
      );
    }
  }

  if (failures.length > 0) {
    fail(
      `${failures.length} control(s) failed. Nothing has been counted and no manifest ` +
        `written.\n\n${failures.join("\n\n")}\n\n` +
        `  A control failure does not mean WSL changed. It means a selector and a\n` +
        `  retained artefact disagree, and which of the two is wrong is a question for\n` +
        `  a human. Fix the selector, or re-establish the expected count against the\n` +
        `  artefact and say so in docs/sources/controls.json.`,
    );
  }

  if (!quiet || skipped.length > 0) {
    console.log(`  controls: ${checked} passed${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}`);
    for (const s of skipped) console.log(`    skipped: ${s}`);
  } else {
    console.log(`  controls: ${checked} passed`);
  }
  return { checked, skipped };
}
