#!/usr/bin/env bash
# =====================================================================
# final_check.sh — one command, every check, offline then online
# =====================================================================
#
# Nothing here writes. The offline half reads files in docs/sources/, the
# online half runs supabase/checks/final_check.sql, which is SELECTs and a
# TEMP table. This script greps that file for write statements and refuses
# to run it if it finds any, so "read-only" is checked rather than promised.
#
#   bash scripts/final_check.sh              offline checks, then the database
#   bash scripts/final_check.sh --offline    skip the database entirely
#
# Exits non-zero if anything fails, so it can gate a commit.
# =====================================================================

cd "$(dirname "$0")/.." || exit 1
RUN="node --experimental-strip-types"
OFFLINE_ONLY=0
[ "$1" = "--offline" ] && OFFLINE_ONLY=1
FAILED=()

hr() { printf '\n=====================================================================\n'; }
step() { printf '\n--- %s\n' "$1"; }

hr
echo " FINAL CHECK — $(date '+%Y-%m-%d %H:%M:%S')"
echo " Nothing in this script writes to disk or to the database."
hr

# ---------------------------------------------------------------------
# 1. The parser, against pinned cases and its negative controls
# ---------------------------------------------------------------------
step "1/4  popup parser — pinned heats, every retained popup, negative controls"
if $RUN scripts/lib/parse_popup.test.ts 2>&1 | tail -12; then
  :
else
  FAILED+=("parse_popup.test.ts")
fi
[ "${PIPESTATUS[0]}" != "0" ] && FAILED+=("parse_popup.test.ts")

# ---------------------------------------------------------------------
# 2. Every retained popup names its own heat
# ---------------------------------------------------------------------
step "2/4  popup attribution — the collector's own guards, re-run over disk"
if ! $RUN scripts/verify_popup_attribution.ts 2>&1 | tail -8; then
  FAILED+=("verify_popup_attribution.ts")
fi
[ "${PIPESTATUS[0]}" != "0" ] && FAILED+=("verify_popup_attribution.ts")

# ---------------------------------------------------------------------
# 3. Disk against the manifests
# ---------------------------------------------------------------------
# The index has under-reported the bytes four times on this project — a run
# that failed wrote no manifest while its popups sat in raw/. The files are
# the record; this asserts the index still agrees with them.
step "3/4  retained popups on disk vs the popup manifests"
node -e '
const fs = require("fs");
const raw = fs.readdirSync("docs/sources/raw").filter(f => f.endsWith("_popup.html"));
const mdir = "docs/sources/manifests";
const mans = fs.readdirSync(mdir).filter(f => f.endsWith("_popups.json"));
let indexed = 0;
const seen = new Set();
for (const m of mans) {
  const j = JSON.parse(fs.readFileSync(mdir + "/" + m, "utf8"));
  for (const p of j.popups || []) { indexed++; seen.add(p.file_path.split("/").pop()); }
}
const orphans = raw.filter(f => !seen.has(f));
console.log("  " + raw.length + " popup file(s) on disk");
console.log("  " + indexed + " popup(s) across " + mans.length + " manifest(s)");
if (orphans.length > 0) {
  console.log("\n  " + orphans.length + " popup(s) on disk are in NO manifest:");
  for (const o of orphans.slice(0, 20)) console.log("     " + o);
  if (orphans.length > 20) console.log("     … and " + (orphans.length - 20) + " more");
  console.log("\n  These are real captures with real sidecars. Re-run collect-popups for");
  console.log("  the affected event to rebuild its index — nothing needs re-fetching.");
  process.exit(1);
}
console.log("  every popup on disk is indexed.");
' || FAILED+=("disk vs manifests")

# ---------------------------------------------------------------------
# 4. The database
# ---------------------------------------------------------------------
if [ "$OFFLINE_ONLY" -eq 1 ]; then
  step "4/4  database — SKIPPED (--offline)"
else
  step "4/4  database — every audit view, plus the controls proving each had something to check"
  CHECK_SQL="supabase/checks/final_check.sql"

  # Read-only, verified rather than asserted. Comments are stripped first so
  # the file may describe what it does not do.
  if sed 's/--.*$//' "$CHECK_SQL" | grep -qiE '\b(insert +into +(public\.)?(seasons|events|rounds|heats|heat_entries|waves|surfers|artefacts|data_gaps)|update +[a-z_]+ +set|delete +from|drop +|alter +|truncate +)'; then
    echo "  REFUSING TO RUN: $CHECK_SQL contains a write statement outside a comment."
    FAILED+=("final_check.sql is not read-only")
  else
    P="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"
    [ -x "$P" ] || P="$(command -v psql)"
    if [ -z "$P" ]; then
      echo "  psql not found. Set PSQL=/path/to/psql and re-run."
      FAILED+=("psql not found")
    elif [ ! -f .env.local ]; then
      echo "  .env.local not found, so SUPABASE_DB_URL_V2 cannot be read."
      FAILED+=(".env.local missing")
    else
      set -a; . ./.env.local; set +a

      # --- migration files on disk vs the ledger ----------------------
      # A view that does not exist reads as an absent check, and an absent
      # check is indistinguishable from a passing one unless something asks.
      # 00000000000008 deliberately leaves 5 and 7 unrecorded so `npm run
      # migrate` still runs them — which means "not applied" is a live state
      # this project expects to be in, and therefore one worth checking for.
      echo "  migration files on disk vs schema_migrations:"
      applied=$("$P" "$SUPABASE_DB_URL_V2" -At \
        -c "select version from schema_migrations order by version" 2>/dev/null | sort -u)
      ondisk=$(find supabase/migrations -maxdepth 1 -name '*.sql' -exec basename {} \; | sort -u)
      unapplied=$(comm -23 <(printf '%s\n' "$ondisk") <(printf '%s\n' "$applied"))
      if [ -n "$unapplied" ]; then
        echo "     NOT RECORDED AS APPLIED:"
        printf '%s\n' "$unapplied" | sed 's/^/       /'
        echo "     Run: npm run migrate"
        FAILED+=("unapplied migrations")
      else
        echo "     all $(printf '%s\n' "$ondisk" | wc -l | tr -d ' ') on disk are recorded as applied."
      fi

      "$P" "$SUPABASE_DB_URL_V2" -v ON_ERROR_STOP=1 -f "$CHECK_SQL" || FAILED+=("final_check.sql")
    fi
  fi
fi

hr
if [ ${#FAILED[@]} -eq 0 ]; then
  echo " ALL CHECKS PASSED"
  hr
  exit 0
fi
echo " ${#FAILED[@]} CHECK(S) FAILED:"
for f in "${FAILED[@]}"; do echo "   - $f"; done
hr
exit 1
