#!/usr/bin/env bash
# =====================================================================
# generate_all_sql.sh — every retained artefact turned into reviewable SQL
# =====================================================================
#
# Generates only. Executes nothing, touches no database, needs no network.
# Rule 6: read what it writes, then run it yourself.
#
# THE ORDER IS THE POINT
#
#   1. Tier 1 seeds     seasons, events, rounds, heats, surfers, heat_entries
#   2. artefacts        every retained file registered by sha256
#   3. Tier 2 seeds     waves and heat conditions
#
#   and the order they must be APPLIED in is 2, 1, 3:
#
#     artefacts first  — every row in a Tier 1 seed carries an artefact_id and
#                        the seeds' preflight blocks abort without it
#     Tier 1 next      — Tier 2 waves join to heat_entries, which Tier 1 writes
#     Tier 2 last      — it only updates and inserts against rows already there
#
#   Generating in 1-2-3 and applying in 2-1-3 is not an inconsistency: the
#   generators read disk, the seeds read each other's output.
#
# PARTIAL EVENTS ARE FINE AND ARE NOT SKIPPED
#   An event with some of its popups retained loads the ones it has. The Tier 2
#   seed asserts every heat it names got its conditions, notices the shortfall
#   out loud, and does not pretend the event is complete.
#
# Usage:
#   bash scripts/generate_all_sql.sh
#   bash scripts/generate_all_sql.sh --tier1-only
# =====================================================================

cd "$(dirname "$0")/.." || exit 1

TIER1_ONLY=0
[ "$1" = "--tier1-only" ] && TIER1_ONLY=1

# tsx cannot run on the Cowork mount (node_modules/@esbuild is darwin-arm64 and
# the VM is Linux aarch64). Node's own type stripping needs no native binary and
# works in both places, so it is what this script uses.
RUN="node --experimental-strip-types"

mkdir -p logs
LOG="logs/generate_all_sql_$(date +%Y%m%d_%H%M%S).log"
say() { echo "$@" | tee -a "$LOG"; }

FAILED=()
REFUSED=()
T1=0; T2=0

say ""
say "====================================================================="
say " Generating SQL from retained artefacts — $(date '+%Y-%m-%d %H:%M:%S')"
say " Nothing is executed. Nothing touches the network."
say "====================================================================="

# ---- which events have what, read off disk ---------------------------
# Manifest filenames carry season and WSL event id, not the event NUMBER the
# generators take, so the number comes from the format spec. Reading it from the
# filename would need a mapping that does not exist and would be guessed.
events_for() {
  node -e "
    const fs=require('fs');
    const t=fs.readFileSync('docs/format-spec/seasons/$1.yaml','utf8');
    console.log((t.match(/^  - number:/gm)||[]).length);
  " 2>/dev/null
}

has_manifest() {  # season, event -> 0 if a Tier 1 manifest exists
  $RUN -e "
    const {loadEventManifest}=await import('./scripts/lib/manifest.ts');
    try { loadEventManifest($1,$2); process.exit(0) } catch { process.exit(1) }
  " --input-type=module 2>/dev/null
}

say ""
say "PHASE 1 — Tier 1 seeds (results pages to rows)"
say ""

for season in 2024 2025; do
  total=$(events_for "$season")
  for ev in $(seq 1 "$total"); do
    if ! ls docs/sources/manifests/${season}_ct_*_results.json >/dev/null 2>&1; then continue; fi
    printf "    %s e%-2s tier1 seed ... " "$season" "$ev" | tee -a "$LOG"
    if out=$($RUN scripts/ingest_event.ts --season "$season" --event "$ev" 2>&1); then
      echo "ok" | tee -a "$LOG"; T1=$((T1+1))
    else
      # No manifest is an expected skip, not a failure — events that refused
      # collection have no Tier 1 page to ingest.
      #
      # format: finals_five is also an expected skip, added 19 August 2026.
      # The Finals now HAS a manifest (write_finals_manifest.ts writes one so
      # the popup collector can reach it), so this generator picks it up and
      # ingest_event.ts refuses it — correctly, because it would write
      # kind='regular' and would not filter the women's ladder out of a page
      # that carries both. Phase 1b below runs the right generator instead.
      if echo "$out" | grep -qiE "no manifest|finals_five"; then
        echo "skipped (handled elsewhere)" | tee -a "$LOG"
      else
        echo "FAILED" | tee -a "$LOG"; echo "$out" >> "$LOG"; FAILED+=("$season e$ev tier1")
      fi
    fi
  done
done

say ""
say "PHASE 1b — the WSL Finals ladder (its own page shape, its own generator)"
say ""
for season in 2024 2025; do
  printf "    %s finals seed ... " "$season" | tee -a "$LOG"
  if out=$($RUN scripts/ingest_finals.ts --season "$season" 2>&1); then
    echo "ok" | tee -a "$LOG"; T1=$((T1+1))
  else
    if echo "$out" | grep -qiE "no retained results page|no event with format"; then
      echo "skipped (not collected)" | tee -a "$LOG"
    else
      echo "FAILED" | tee -a "$LOG"; echo "$out" >> "$LOG"; FAILED+=("$season finals")
    fi
  fi
done

say ""
say "PHASE 2 — artefact registration"
say ""
if $RUN scripts/register_artefacts.ts >>"$LOG" 2>&1; then
  say "    ok -> supabase/seeds/artefacts_retained.sql"
else
  say "    FAILED (see log)"; FAILED+=("register-artefacts")
fi

if [ "$TIER1_ONLY" -eq 0 ]; then
  say ""
  say "PHASE 3 — Tier 2 seeds (popups to waves and conditions)"
  say ""
  for season in 2024 2025; do
    total=$(events_for "$season")
    for ev in $(seq 1 "$total"); do
      printf "    %s e%-2s tier2 seed ... " "$season" "$ev" | tee -a "$LOG"
      if out=$($RUN scripts/ingest_popups.ts --season "$season" --event "$ev" 2>&1); then
        n=$(echo "$out" | grep -oE "[0-9]+ heats · [0-9]+ rides" | head -1)
        echo "ok  ${n}" | tee -a "$LOG"; T2=$((T2+1))
      else
        if echo "$out" | grep -q "REFUSED:"; then
          # A principled refusal, not a crash. ingest_popups.ts writes a
          # refusal stub in place of the seed so a popups_*.sql loop stays
          # safe, and exits non-zero so this is never mistaken for a load.
          echo "REFUSED (stub written — see log)" | tee -a "$LOG"
          echo "$out" >> "$LOG"
          REFUSED+=("$season e$ev tier2")
        elif echo "$out" | grep -qiE "no popup manifest|no manifest"; then
          echo "skipped (no popups retained)" | tee -a "$LOG"
        else
          echo "FAILED" | tee -a "$LOG"; echo "$out" >> "$LOG"; FAILED+=("$season e$ev tier2")
        fi
      fi
    done
  done
fi

say ""
say "====================================================================="
say " $T1 Tier 1 seed(s), $T2 Tier 2 seed(s) written to supabase/seeds/"
if [ ${#REFUSED[@]} -gt 0 ]; then
  say ""
  say " ${#REFUSED[@]} REFUSED — a safe stub was written instead of a seed."
  say " These are known-blocked events, not failures. The stub runs and loads"
  say " nothing, so a popups_*.sql loop is safe to run end to end."
  for f in "${REFUSED[@]}"; do say "   - $f"; done
fi
if [ ${#FAILED[@]} -gt 0 ]; then
  say ""
  say " ${#FAILED[@]} GENERATOR FAILURE(S) — read the log, these are not skips:"
  for f in "${FAILED[@]}"; do say "   - $f"; done
fi
say ""
say " APPLY IN THIS ORDER — artefacts, then Tier 1, then Tier 2:"
say ""
say '   P="/opt/homebrew/opt/libpq/bin/psql"'
say '   set -a && source .env.local && set +a'
say '   $P "$SUPABASE_DB_URL_V2" -v ON_ERROR_STOP=1 -f supabase/seeds/artefacts_retained.sql'
say '   for f in supabase/seeds/ingest_*.sql; do echo "== $f"; $P "$SUPABASE_DB_URL_V2" -v ON_ERROR_STOP=1 -f "$f" || break; done'
say '   for f in supabase/seeds/finals_*.sql; do echo "== $f"; $P "$SUPABASE_DB_URL_V2" -v ON_ERROR_STOP=1 -f "$f" || break; done'
say '   for f in supabase/seeds/popups_*.sql; do echo "== $f"; $P "$SUPABASE_DB_URL_V2" -v ON_ERROR_STOP=1 -f "$f" || break; done'
say ""
say " Each loop stops at the first file that errors, so a failure cannot be"
say " scrolled past. Every seed is idempotent — re-running changes nothing."
say " log: $LOG"
say "====================================================================="

[ ${#FAILED[@]} -eq 0 ]
