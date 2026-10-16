/**
 * retain.ts — artefact retention, shared
 *
 * 2.0 principle 2: raw bytes to disk, content-hashed and timestamped, BEFORE
 * anything parses them. Re-parsing reads the retained file and never re-hits
 * the site.
 *
 * This lives in one place on purpose. Two hand-rolled retention paths drift,
 * and the one that drifts is the one that quietly stops writing sidecars.
 * collect_event.ts and collect_heats.ts both import from here.
 *
 * It does not fetch worldsurfleague.com on Claude's behalf and cannot — it runs
 * under the caller's own user-agent, from Taryn's machine. CLAUDE.md rule 7.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RAW_DIR = join(REPO_ROOT, "docs/sources/raw");
export const MANIFEST_DIR = join(REPO_ROOT, "docs/sources/manifests");

/** The value artefacts.retrieval carries for captures made by these scripts. */
export const RETRIEVAL_SCRIPT = "script_own_ua";

export function fail(message: string): never {
  console.error(`\nerror: ${message}\n`);
  process.exit(2);
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Artefact {
  slug: string;
  url: string;
  html: string;
  path: string;
  sha256: string;
  fetchedAt: string;
  httpStatus: number | null;
  contentType: string | null;
  bytes: number;
  reused: boolean;
  /** From the sidecar. null means the sidecar did not say — never guessed. */
  retrieval: string | null;
  provenanceWarning: string | null;
}

export interface RetainOptions {
  /** false re-reads what is held and never touches the network. */
  fetch: boolean;
  /** true ignores what is held and captures again. */
  refetch: boolean;
  scriptName: string;
  userAgent: string;
  /**
   * Extra request headers, recorded in the sidecar.
   *
   * Two responses to the same URL under different headers are two different
   * artefacts, and the sidecar must say which is which — otherwise a future
   * reader cannot tell whether an empty result was the URL or the request.
   * Callers sending headers must also vary the slug.
   */
  extraHeaders?: Record<string, string>;
}

export function readRetained(slug: string, url: string): Artefact | null {
  const htmlPath = join(RAW_DIR, `${slug}.html`);
  const sidecarPath = join(RAW_DIR, `${slug}.json`);
  if (!existsSync(htmlPath)) return null;

  const raw = readFileSync(htmlPath);
  const sha256 = createHash("sha256").update(raw).digest("hex");

  if (!existsSync(sidecarPath)) {
    fail(
      `retained ${slug}.html has no sidecar. An artefact without provenance is ` +
        `not an artefact — see scripts/write_manual_sidecar.ts`,
    );
  }
  const parsed: unknown = JSON.parse(readFileSync(sidecarPath, "utf8"));
  const sidecar: Record<string, unknown> = isRecord(parsed) ? parsed : {};

  if (typeof sidecar.sha256 === "string" && sidecar.sha256 !== sha256) {
    fail(
      `retained artefact ${slug}.html does not match its sidecar hash — ` +
        `it has been modified since capture. Do not proceed.`,
    );
  }

  return {
    slug,
    url: typeof sidecar.url === "string" ? sidecar.url : url,
    html: raw.toString("utf8"),
    path: htmlPath,
    sha256,
    fetchedAt: typeof sidecar.fetched_at === "string" ? sidecar.fetched_at : "unknown",
    httpStatus: typeof sidecar.http_status === "number" ? sidecar.http_status : null,
    contentType: typeof sidecar.content_type === "string" ? sidecar.content_type : null,
    bytes: raw.length,
    reused: true,
    retrieval: typeof sidecar.retrieval === "string" ? sidecar.retrieval : null,
    provenanceWarning:
      typeof sidecar.provenance_warning === "string" ? sidecar.provenance_warning : null,
  };
}

export async function retrieve(
  url: string,
  slug: string,
  opts: RetainOptions,
  note: string,
): Promise<Artefact> {
  if (!opts.refetch) {
    const held = readRetained(slug, url);
    if (held) {
      console.log(
        `  reuse   ${slug}.html  ${held.bytes} bytes  sha ${held.sha256.slice(0, 12)}…  retrieval=${held.retrieval ?? "UNRECORDED"}`,
      );
      if (held.provenanceWarning) {
        console.log(`          provenance warning on this artefact — carried into the manifest`);
      }
      return held;
    }
  }

  if (!opts.fetch) {
    fail(
      `--no-fetch given but no retained artefact at ` +
        `${relative(REPO_ROOT, join(RAW_DIR, `${slug}.html`))}`,
    );
  }

  const fetchedAt = new Date().toISOString();
  const headers: Record<string, string> = {
    "user-agent": opts.userAgent,
    ...(opts.extraHeaders ?? {}),
  };
  const res = await fetch(url, { headers });
  const raw = Buffer.from(await res.arrayBuffer());

  if (!res.ok) {
    fail(`GET ${url} returned HTTP ${res.status} (${raw.length} bytes). Nothing retained.`);
  }
  if (raw.length === 0) {
    fail(`GET ${url} returned HTTP ${res.status} with an empty body. Nothing retained.`);
  }

  mkdirSync(RAW_DIR, { recursive: true });
  const htmlPath = join(RAW_DIR, `${slug}.html`);
  const sidecarPath = join(RAW_DIR, `${slug}.json`);

  // Bytes first. Nothing downstream sees them until they are safely on disk.
  writeFileSync(htmlPath, raw);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  writeFileSync(
    sidecarPath,
    JSON.stringify(
      {
        url,
        fetched_at: fetchedAt,
        sha256,
        http_status: res.status,
        content_type: res.headers.get("content-type"),
        content_length_bytes: raw.length,
        content_encoding_on_wire: res.headers.get("content-encoding") ?? null,
        note:
          "Body as delivered to the HTTP client, after transport-level " +
          "decompression. sha256 is over the bytes of the .html file as written. " +
          note,
        fetched_by: opts.scriptName,
        user_agent: opts.userAgent,
        request_headers: opts.extraHeaders ?? null,
        retrieval: RETRIEVAL_SCRIPT,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `  retain  ${slug}.html  ${raw.length} bytes  sha ${sha256.slice(0, 12)}…  HTTP ${res.status}`,
  );

  return {
    slug,
    url,
    html: raw.toString("utf8"),
    path: htmlPath,
    sha256,
    fetchedAt,
    httpStatus: res.status,
    contentType: res.headers.get("content-type"),
    bytes: raw.length,
    reused: false,
    retrieval: RETRIEVAL_SCRIPT,
    provenanceWarning: null,
  };
}

// ---------------------------------------------------------------------------
// Markup counting helpers
// ---------------------------------------------------------------------------

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Count a marker only where it appears in a real class attribute.
 *
 * The stylesheet is inlined on every page, so a bare substring search finds
 * `.hot-heat-athlete--has-interference` in CSS and reports interference on
 * pages that have none. Added 8 August after exactly that false positive: the
 * seventh time in this project that a tool's output was nearly recorded as a
 * fact about the source.
 */
export function classMarkerCount(html: string, marker: string): number {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...html.matchAll(new RegExp(`class="[^"]*\\b${escaped}\\b[^"]*"`, "g"))].length;
}

/** The class names actually present, most frequent first. For pages nobody has seen yet. */
export function classInventory(html: string, limit: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      // Instance-specific classes carry ids; collapse them so the shape shows.
      const generic = cls.replace(/-\d+$/, "-N");
      if (generic.length === 0) continue;
      counts.set(generic, (counts.get(generic) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
