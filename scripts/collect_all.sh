#!/usr/bin/env bash
# =====================================================================
# collect_all.sh — the whole M1 collection, unattended and resumable
# =====================================================================
#
# Runs on Taryn's machine only. robots.txt names Claude's agents under
# Disallow: / and the Cowork VM has no network, so Claude may write this and
# may not run it.
#
# TWO PHASES, IN THIS ORDER, AND THE ORDER MATTERS
#
#   Phase 1  Tier 1 — 3 pages per event, ~14s each. About five minutes for
#            everything. Writes the event manifest that Phase 2 reads, so it
#            cannot be skipped or reordered.
#   Phase 2  Tier 2 — ~47 heat popups per event, ~25s each. About twenty
#            minutes per event, so roughly seven hours in total.
#
# Doing Tier 1 for all 22 first means a 2024 page-shape problem surfaces in
# five minutes rather than four hours into an overnight run.
#
# RESUMABLE. Both collectors skip anything already retained, so re-running
# after an interruption costs only the events not yet done. Safe to stop with
# Ctrl-C and start again.
#
# NEVER ABORTS THE WHOLE RUN ON ONE EVENT. A failure is recorded and the loop
# continues — one odd event should not cost the other twenty-one. Every failure
# is listed at the end and the script exits non-zero if there were any.
#
# 2025 event 2 is Surf Abu Dhabi, a pool event with no bracket. Its shape is
# unmeasured and Tier 2 against it has never run. Expect it to be the one that
# misbehaves; that is information, not a problem.
#
# Usage:
#   bash scripts/collect_all.sh              # everything
#   bash scripts/collect_all.sh --tier1-only # just phase 1, ~5 minutes
#   bash scripts/collect_all.sh --season 2024
#
# Progress goes to the terminal AND to logs/collect_all_<timestamp>.log so a
# run you walked away from can still be read afterwards.
# =====================================================================

cd "$(dirname "$0")/.." || exit 1

TIER1_ONLY=0
ONLY_SEASON=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tier1-only) TIER1_ONLY=1; shift ;;
    --season) ONLY_SEASON="$2"; shift 2 ;;
    *) echo "unrecognised argument: $1"; exit 1 ;;
  esac
done

mkdir -p logs
LOG="logs/collect_all_$(date +%Y%m%d_%H%M%S).log"

say() { echo "$@" | tee -a "$LOG"; }

# Event counts come from the format spec, never from a number typed here — a
# hardcoded 10 or 12 goes stale the moment a spec is corrected.
count_events() {
  node -e "
    const fs=require('fs');
    const t=fs.readFileSync('docs/format-spec/seasons/$1.yaml','utf8');
    console.log((t.match(/^  - number:/gm)||[]).length);
  " 2>/dev/null
}

SEASONS="2024 2025"
[ -n "$ONLY_SEASON" ] && SEASONS="$ONLY_SEASON"

FAILURES=()
START=$(date +%s)

say ""
say "====================================================================="
say " WSL Tier 1 + Tier 2 collection — started $(date '+%Y-%m-%d %H:%M:%S')"
say " log: $LOG"
say "====================================================================="

# ---- phase 1 --------------------------------------------------------
say ""
say "PHASE 1 — Tier 1 result pages (fast, ~14s per event)"
say ""

for season in $SEASONS; do
  total=$(count_events "$season")
  if [ -z "$total" ] || [ "$total" -eq 0 ]; then
    say "  !! $season: could not read an event count from the format spec. Skipped."
    FAILURES+=("$season tier1: no event count in spec")
    continue
  fi
  say "  $season — $total events"
  for ev in $(seq 1 "$total"); do
    printf "    %s e%-2s tier1 ... " "$season" "$ev" | tee -a "$LOG"
    if npm run --silent collect -- --season "$season" --event "$ev" >>"$LOG" 2>&1; then
      echo "ok" | tee -a "$LOG"
    else
      echo "FAILED (see log)" | tee -a "$LOG"
      FAILURES+=("$season e$ev tier1")
    fi
    sleep 2
  done
done

if [ "$TIER1_ONLY" -eq 1 ]; then
  say ""
  say "  --tier1-only: stopping before the popups."
else
  # ---- phase 2 ------------------------------------------------------
  say ""
  say "PHASE 2 — Tier 2 heat popups (~20 min per event; this is the long one)"
  say ""
  for season in $SEASONS; do
    total=$(count_events "$season")
    [ -z "$total" ] && continue
    for ev in $(seq 1 "$total"); do
      # No Tier 1 manifest means phase 1 failed for this event; the popup
      # collector would fail on the same thing with a worse message.
      if ! ls docs/sources/manifests/${season}_ct_*_results.json >/dev/null 2>&1; then
        say "    $season e$ev tier2 ... skipped, no manifests at all"
        continue
      fi
      printf "    %s e%-2s tier2 ... " "$season" "$ev" | tee -a "$LOG"
      t0=$(date +%s)
      if npm run --silent collect-popups -- --season "$season" --event "$ev" >>"$LOG" 2>&1; then
        echo "ok  ($(( $(date +%s) - t0 ))s)" | tee -a "$LOG"
      else
        echo "FAILED after $(( $(date +%s) - t0 ))s (see log)" | tee -a "$LOG"
        FAILURES+=("$season e$ev tier2")
      fi
      sleep 3
    done
  done
fi

# ---- report ---------------------------------------------------------
ELAPSED=$(( $(date +%s) - START ))
POPUPS=$(ls docs/sources/raw/*_popup.html 2>/dev/null | wc -l | tr -d ' ')
PAGES=$(ls docs/sources/raw/*.html 2>/dev/null | wc -l | tr -d ' ')

say ""
say "====================================================================="
say " Finished $(date '+%Y-%m-%d %H:%M:%S') after $(( ELAPSED / 60 ))m $(( ELAPSED % 60 ))s"
say " $PAGES html artefacts on disk, of which $POPUPS are heat popups"

if [ ${#FAILURES[@]} -eq 0 ]; then
  say " No failures."
else
  say ""
  say " ${#FAILURES[@]} FAILURE(S) — these need a human, not a re-run:"
  for f in "${FAILURES[@]}"; do say "   - $f"; done
  say ""
  say " Re-running is safe and cheap; anything already retained is skipped."
fi

say ""
say " NEXT, and do not skip it:"
say "   npx tsx scripts/verify_popup_attribution.ts"
say "   npx tsx scripts/lib/parse_popup.test.ts"
say ""
say " Nothing should be loaded until both exit 0."
say "====================================================================="

[ ${#FAILURES[@]} -eq 0 ]
