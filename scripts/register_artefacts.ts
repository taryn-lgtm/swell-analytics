#!/usr/bin/env tsx
/**
 * register_artefacts.ts — turn retained files on disk into reviewable SQL
 *
 * WHY THIS EXISTS
 *   On 8 August, four pages sat in docs/sources/raw/ with correct sidecars and
 *   zero rows in `artefacts`. Retention without registration is not a milder
 *   version of the v1 failure — it is the same shape. Bytes nobody can point a
 *   row at cannot satisfy M1 item 7.
 *
 * WHAT IT DOES
 *   Scans docs/sources/raw/*.json, re-hashes each artefact file against its
 *   sidecar, and emits one INSERT per retained artefact.
 *
 * WHAT IT REFUSES TO DO
 *   - guess `retrieval`. The column has a CHECK constraint with four legal
 *     values. If the sidecar does not record which one applies and the value
 *     cannot be read off `fetched_by` by an exact, listed rule, the artefact is
 *     reported as needing annotation and left out of the SQL. Never invent a
 *     value — write nothing and say so.
 *   - write to the database. Rule 6: Taryn executes production writes.
 *   - proceed past a hash mismatch. A file that no longer matches its sidecar
 *     is not evidence of anything.
 *
 * Usage:
 *   tsx scripts/register_artefacts.ts
 *   tsx scripts/register_artefacts.ts --out supabase/seeds/artefacts_backlog.sql
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(REPO_ROOT, "docs/sources/raw");
const DEFAULT_OUT = join(REPO_ROOT, "supabase/seeds/artefacts_retained.sql");
const SCRIPT_NAME = "scripts/register_artefacts.ts";

/**
 * The five values artefacts_retrieval_check permits.
 *
 * `script_browser_dom` was added by 00000000000009 (open decision 7, settled
 * 10 August). It is the agent=script, bytes=serialised-DOM cell of the 2x2 the
 * other values half-fill: manual_browser_save is agent=Taryn/bytes=DOM,
 * script_own_ua is agent=script/bytes=wire. Keep this list in step with the
 * CHECK constraint — it exists so the script fails loudly rather than emitting
 * SQL the database will reject.
 */
const LEGAL_RETRIEVAL = [
  "manual_browser_save",
  "script_own_ua",
  "script_browser_dom",
  "published_pdf",
  "third_party",
] as const;

/**
 * Exact, listed rules for reading `retrieval` off `fetched_by` when the sidecar
 * predates the field. Substring matches only, no fuzzy inference. Anything not
 * matched here is reported, not guessed.
 */
const FETCHED_BY_RULES: ReadonlyArray<{ needle: string; retrieval: string }> = [
  { needle: "scripts/reconstruct_season.ts", retrieval: "script_own_ua" },
  { needle: "scripts/collect_event.ts", retrieval: "script_own_ua" },
  { needle: "manual browser save", retrieval: "manual_browser_save" },
];

function fail(message: string): never {
  console.error(`\nerror: ${message}\n`);
  process.exit(2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

interface Row {
  sidecar: string;
  url: string | null;
  filePath: string;
  sha256: string;
  fetchedAt: string;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number;
  retrieval: string;
  notes: string | null;
}

interface Skipped {
  sidecar: string;
  reason: string;
}

/** The bytes a sidecar describes: an explicit artefact_file, else same stem. */
function resolveArtefactFile(stem: string, sidecar: Record<string, unknown>): string | null {
  const explicit = str(sidecar.artefact_file);
  if (explicit) {
    const p = join(RAW_DIR, explicit);
    return existsSync(p) ? p : null;
  }
  for (const ext of [".html", ".txt", ".md", ".pdf", ".xml"]) {
    const p = join(RAW_DIR, `${stem}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Either a retrieval value that the CHECK constraint will accept, or the reason
 * this sidecar cannot be registered.
 *
 * This returns rather than exits, deliberately. It used to call fail(), which is
 * process.exit(2) — so a single sidecar carrying an unrecognised value aborted
 * the whole run and emitted no SQL at all, including for the artefacts that were
 * perfectly registerable. Between 9 and 10 August three popup sidecars sat in
 * docs/sources/raw/ in exactly that state and the only reason the generated seed
 * still existed is that it predated them by eight hours. A per-sidecar problem
 * belongs in skipped[] with the other five, not in an exit code. The forcing
 * function is unharmed: a skipped artefact is still an unregistered artefact.
 */
type RetrievalResult =
  | { ok: true; retrieval: string }
  | { ok: false; reason: string };

function resolveRetrieval(sidecar: Record<string, unknown>): RetrievalResult {
  const explicit = str(sidecar.retrieval);
  if (explicit) {
    if (!LEGAL_RETRIEVAL.includes(explicit as (typeof LEGAL_RETRIEVAL)[number])) {
      return {
        ok: false,
        reason:
          `sidecar declares retrieval "${explicit}", which artefacts_retrieval_check ` +
          `would reject. Legal values: ${LEGAL_RETRIEVAL.join(" | ")}. Either add the ` +
          `value by migration or correct the sidecar. Not guessed here.`,
      };
    }
    return { ok: true, retrieval: explicit };
  }
  const fetchedBy = str(sidecar.fetched_by);
  if (fetchedBy) {
    for (const rule of FETCHED_BY_RULES) {
      if (fetchedBy.includes(rule.needle)) return { ok: true, retrieval: rule.retrieval };
    }
  }
  return {
    ok: false,
    reason:
      `retrieval not recorded and not derivable from fetched_by=` +
      `${JSON.stringify(fetchedBy ?? null)}. Add a "retrieval" field to the ` +
      `sidecar — one of ${LEGAL_RETRIEVAL.join(" | ")}. Not guessed.`,
  };
}

/** Everything in the sidecar that is not a column becomes the notes field. */
function buildNotes(sidecar: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const carry = [
    "provenance_warning",
    "scope_warning",
    "result",
    "consequence",
    "source_grade",
    "known_defect",
    "reliability_note",
    "why_not_fetched_server_side",
    "retrieval_note",
    "captured_for",
    "fetched_by",
  ];
  for (const key of carry) {
    const v = str(sidecar[key]);
    if (v) parts.push(`${key}: ${v}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function sqlString(v: string | null): string {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}

function main(): void {
  const argv = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = join(REPO_ROOT, argv[++i]);
    else fail(`unrecognised argument: ${argv[i]}`);
  }

  if (!existsSync(RAW_DIR)) fail(`no ${relative(REPO_ROOT, RAW_DIR)} directory`);

  const sidecars = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const rows: Row[] = [];
  const skipped: Skipped[] = [];

  for (const file of sidecars) {
    const stem = file.slice(0, -".json".length);
    const parsed: unknown = JSON.parse(readFileSync(join(RAW_DIR, file), "utf8"));
    if (!isRecord(parsed)) {
      skipped.push({ sidecar: file, reason: "sidecar did not parse to an object" });
      continue;
    }

    const artefactPath = resolveArtefactFile(stem, parsed);
    if (!artefactPath) {
      skipped.push({ sidecar: file, reason: "no artefact file found for this sidecar" });
      continue;
    }

    const raw = readFileSync(artefactPath);
    const sha256 = createHash("sha256").update(raw).digest("hex");
    const declared = str(parsed.sha256);
    if (declared && declared !== sha256) {
      fail(
        `${relative(REPO_ROOT, artefactPath)} does not match the sha256 in ${file}. ` +
          `The artefact has changed since capture. Registering it would put a false ` +
          `provenance record in the database. Stopping.`,
      );
    }

    const fetchedAt = str(parsed.fetched_at);
    if (!fetchedAt) {
      skipped.push({ sidecar: file, reason: "no fetched_at — artefacts.fetched_at is NOT NULL" });
      continue;
    }

    const resolved = resolveRetrieval(parsed);
    if (!resolved.ok) {
      skipped.push({ sidecar: file, reason: resolved.reason });
      continue;
    }
    const retrieval = resolved.retrieval;

    rows.push({
      sidecar: file,
      url: str(parsed.url),
      filePath: relative(REPO_ROOT, artefactPath),
      sha256,
      fetchedAt,
      httpStatus: num(parsed.http_status),
      contentType: str(parsed.content_type),
      contentLength: raw.length,
      retrieval,
      notes: buildNotes(parsed),
    });
  }

  // A sha collision across two paths would silently drop one under ON CONFLICT.
  const bySha = new Map<string, string[]>();
  for (const r of rows) {
    bySha.set(r.sha256, [...(bySha.get(r.sha256) ?? []), r.filePath]);
  }
  const collisions = [...bySha.entries()].filter(([, paths]) => paths.length > 1);

  const values = rows.map(
    (r) =>
      `  (${sqlString(r.url)},\n` +
      `   ${sqlString(r.filePath)},\n` +
      `   ${sqlString(r.sha256)},\n` +
      `   ${sqlString(r.fetchedAt)}::timestamptz,\n` +
      `   ${r.httpStatus === null ? "NULL" : r.httpStatus},\n` +
      `   ${sqlString(r.contentType)},\n` +
      `   ${r.contentLength},\n` +
      `   ${sqlString(r.retrieval)},\n` +
      `   ${sqlString(r.notes)})`,
  );

  const header =
    `-- Generated by ${SCRIPT_NAME} on ${new Date().toISOString()}.\n` +
    `-- Registers every retained artefact in docs/sources/raw/ that carries enough\n` +
    `-- provenance to be registered honestly.\n` +
    `--\n` +
    `-- Rule 6: review this, then run it yourself. Claude does not execute it.\n` +
    `-- Idempotent: artefacts is UNIQUE on sha256 and on file_path, so re-running\n` +
    `-- inserts nothing new.\n` +
    `--\n` +
    `-- Artefacts registered: ${rows.length}\n` +
    `-- Skipped, needing annotation: ${skipped.length}\n` +
    skipped.map((s) => `--   ${s.sidecar}: ${s.reason}`).join("\n") +
    (skipped.length > 0 ? "\n" : "") +
    `\n`;

  const body =
    rows.length === 0
      ? "-- Nothing to register.\n"
      : `INSERT INTO artefacts\n` +
        `  (url, file_path, sha256, fetched_at, http_status, content_type,\n` +
        `   content_length, retrieval, notes)\n` +
        `VALUES\n${values.join(",\n")}\n` +
        `ON CONFLICT DO NOTHING;\n`;

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, header + body);

  console.log(`\nscanned ${sidecars.length} sidecars in ${relative(REPO_ROOT, RAW_DIR)}\n`);
  for (const r of rows) {
    console.log(`  register  ${r.filePath}  [${r.retrieval}]  ${r.contentLength} bytes`);
  }
  for (const s of skipped) {
    console.log(`  SKIP      ${s.sidecar}\n            ${s.reason}`);
  }
  for (const [sha, paths] of collisions) {
    console.log(
      `\n  WARNING: sha256 ${sha.slice(0, 12)}… is shared by ${paths.length} files:\n` +
        paths.map((p) => `    ${p}`).join("\n") +
        `\n  ON CONFLICT will register only the first. Identical bytes under two names.`,
    );
  }
  console.log(`\n  ${rows.length} to register, ${skipped.length} skipped`);
  console.log(`  sql -> ${relative(REPO_ROOT, out)}  (review, then run — Rule 6)\n`);
}

main();
