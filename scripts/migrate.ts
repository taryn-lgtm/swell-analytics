/**
 * Applies SQL migration files to Supabase via the Management API.
 * Requires SUPABASE_ACCESS_TOKEN in .env.local (personal access token from
 * supabase.com/dashboard/account/tokens — NOT the service role key).
 *
 * Migrations are tracked in a public.schema_migrations ledger so already-applied
 * files are skipped. This prevents re-running superseded migrations (which would
 * regress the analytics views) on a folder that isn't a clean linear history.
 *
 * Usage:
 *   npm run migrate                 # apply any migrations not yet in the ledger
 *   npm run migrate -- --baseline   # record ALL current migrations as applied
 *                                   #   WITHOUT running them (adopt the ledger on
 *                                   #   an already-migrated database)
 *   npm run migrate -- --file=supabase/migrations/20260420000003_analytics_views_v3.sql
 *   npm run migrate -- --file=... --force   # re-run even if already in ledger
 *
 * Files in supabase/migrations/_archive/ are never considered.
 */
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`;

function loadEnv(envPath: string): void {
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf-8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = val; // .env.local always wins over shell env
  }
}

/**
 * Run SQL via the Management API. Returns the result rows (empty array for DDL).
 */
async function runSql<T = unknown>(
  projectRef: string,
  token: string,
  sql: string
): Promise<T[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const json: unknown = await res.json();
  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    "error" in json &&
    (json as { error?: unknown }).error
  ) {
    throw new Error(String((json as { error?: unknown }).error));
  }
  return (Array.isArray(json) ? json : []) as T[];
}

async function getAppliedVersions(projectRef: string, token: string): Promise<Set<string>> {
  const rows = await runSql<{ version: string }>(
    projectRef,
    token,
    "SELECT version FROM public.schema_migrations;"
  );
  return new Set(rows.map((r) => r.version));
}

async function recordApplied(projectRef: string, token: string, version: string): Promise<void> {
  // version is a migration filename (alphanumerics, underscores, dots) — safe to inline.
  await runSql(
    projectRef,
    token,
    `INSERT INTO public.schema_migrations (version) VALUES ('${version}')
       ON CONFLICT (version) DO NOTHING;`
  );
}

async function main(): Promise<void> {
  loadEnv(join(ROOT, ".env.local"));

  const token = process.env.SUPABASE_ACCESS_TOKEN;

  // TARGET SELECTION — read this before changing it.
  //
  // Until 29 July 2026 this script derived the project ref from
  // NEXT_PUBLIC_SUPABASE_URL, which is the v1 project. v1 is QUARANTINED and must
  // never be migrated again. The 2.0 build lives in a separate project.
  //
  // Default target is now v2. Passing --v1 is possible but must be deliberate,
  // and the script will refuse without --i-mean-it.
  const targetV1 = process.argv.includes("--v1");
  const url = targetV1
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL_V2;

  if (targetV1 && !process.argv.includes("--i-mean-it")) {
    console.error("❌  --v1 targets the QUARANTINED v1 project.");
    console.error("   v1 is not to be migrated. See CLAUDE.md 'What is quarantined'.");
    console.error("   If this is genuinely intended, add --i-mean-it.");
    process.exit(1);
  }
  if (!targetV1 && !url) {
    console.error("❌  NEXT_PUBLIC_SUPABASE_URL_V2 is not set in .env.local.");
    console.error("   That is the 2.0 project. v1 is quarantined and is not the default target.");
    process.exit(1);
  }

  if (!token) {
    console.error("❌  SUPABASE_ACCESS_TOKEN is not set.");
    console.error("   Get one at: https://supabase.com/dashboard/account/tokens");
    console.error("   Then add to .env.local:  SUPABASE_ACCESS_TOKEN=sbp_xxxxx");
    process.exit(1);
  }
  if (!token.startsWith("sbp_")) {
    console.error(`❌  SUPABASE_ACCESS_TOKEN does not look like a PAT (got: ${token.slice(0, 10)}…).`);
    console.error("   It should start with sbp_  — check .env.local has your real token, not a placeholder.");
    process.exit(1);
  }
  if (!url) {
    console.error("❌  NEXT_PUBLIC_SUPABASE_URL is not set.");
    process.exit(1);
  }

  const projectRef = new URL(url).hostname.split(".")[0];
  console.log(`\n🎯  Target: ${projectRef}  (${targetV1 ? "v1 — QUARANTINED" : "v2"})\n`);
  const baseline = process.argv.includes("--baseline");
  const force = process.argv.includes("--force");

  // Resolve which file(s) to consider. _archive/ is excluded because readdirSync
  // (non-recursive) returns only top-level entries and the .sql filter drops the
  // _archive directory entry.
  const fileArg = process.argv.find((a) => a.startsWith("--file="))?.slice(7);
  let files: string[];

  if (fileArg) {
    files = [join(ROOT, fileArg)];
  } else {
    const migrationsDir = join(ROOT, "supabase/migrations");
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(migrationsDir, f));
  }

  // Ensure the ledger exists before we read or write it.
  await runSql(projectRef, token, LEDGER_DDL);
  const applied = await getAppliedVersions(projectRef, token);

  if (baseline) {
    console.log(`\n📒  Baseline mode — recording ${files.length} migration(s) as applied WITHOUT running them.\n`);
    for (const filePath of files) {
      const version = filePath.split("/").pop()!;
      if (applied.has(version)) {
        console.log(`  ⏭️   ${version} — already in ledger`);
        continue;
      }
      await recordApplied(projectRef, token, version);
      console.log(`  📝  ${version} — recorded`);
    }
    console.log("\n✅  Ledger baselined. Future `npm run migrate` will skip these.\n");
    return;
  }

  console.log(`\n🚀  Migrating project ${projectRef}\n`);

  let ran = 0;
  for (const filePath of files) {
    const version = filePath.split("/").pop()!;
    if (applied.has(version) && !force) {
      console.log(`  ⏭️   ${version} — already applied`);
      continue;
    }
    process.stdout.write(`  ⏳  ${version} … `);
    try {
      const sql = readFileSync(filePath, "utf-8");
      await runSql(projectRef, token, sql);
      await recordApplied(projectRef, token, version);
      console.log("✅  done");
      ran++;
    } catch (err) {
      console.log("❌  failed");
      console.error(`     ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅  Migration complete — ${ran} applied, ${files.length - ran} skipped.\n`);
}

main();
