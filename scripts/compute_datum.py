#!/usr/bin/env python3
"""
Datum V1 — compute and validate.

WHAT THIS IS
    Datum V1 is a ridge on ROUND alone (decision 26, closed 27 August 2026).
    Break and field were measured out-of-sample and do not earn their place;
    wave type is not published by the source. They are kept as STORED, UNUSED
    columns on every Datum row so the test can be re-run without a rebuild
    when 2022-2023 land post-beta.

THE ACCEPTANCE TEST (decision 27, AMENDED 28 August 2026)
    As signed off on 27 August, decision 27 required Datum to beat both the
    intercept-only AND the round-only baseline out-of-sample. Decision 26 makes
    Datum a ridge on round alone, and scripts/datum_input_check.py:144 defines
    the round-only baseline as exactly that model. The two are identical, so
    item 1 was unsatisfiable as written. Found 28 August; resolved by Taryn the
    same day: the round-only bar is dropped and replaced by a stability rider.

    Datum V1 passes when ALL THREE hold:
      1. PRIMARY   — beats intercept-only out-of-sample under grouped
                     leave-one-event-out. The fold boundary is the event.
      2. SECONDARY — the sign agrees under leave-one-season-out. A result that
                     flips with the fold design is not evidence (decision 26).
      3. MONOTONE  — the fitted round effects rise monotonically along the
                     competitive ladder. A Datum that ranks the Final below the
                     Opening Round has not earned belief whatever its RMSE.

WHY 1,843 AND NOT 1,668
    The 27 August measurement restricted to entries carrying a break AND a
    field size, because it was testing those inputs. Datum V1 uses neither.
    Round-only trains on every entry with a published heat_total: 1,843 over
    800 heats, 175 more than the measurement set (10.5%). The filter that
    produced 1,668 exists to serve two dropped predictors.

INPUT
    data/datum_cells_v1_2026-08-28.csv — cell aggregate (n, sum(y), sum(y^2))
    per (event, season, venue, round, field_size). For an all-categorical ridge
    this is a sufficient statistic. Transcription was verified against v2 before
    any figure here was believed; assert_control() re-checks it every run.

    Regenerate with:
      select e.id ev, e.season_year sy, coalesce(h.venue_id::text,'none') vn,
             r.name rd, e.field_size fs, count(*) n,
             round(sum(he.heat_total)::numeric,4) sm,
             round(sum(he.heat_total*he.heat_total)::numeric,4) sq
      from heat_entries he
        join heats h on h.id = he.heat_id
        join rounds r on r.id = h.round_id
        join events e on e.id = r.event_id
      where he.heat_total is not null
      group by 1,2,3,4,5 order by 1,4,3;

NOT COMPUTED HERE
    MAE. Within a cell every row shares a prediction but not a residual, so
    |y-yhat| is not recoverable from (n, sum, sumsq). RMSE is.
"""
import csv, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Reuse the 27 August harness rather than reimplementing the ridge. If that
# file changes, this changes with it, which is the point.
from datum_input_check import design, stats, fit, sse, score, GRID

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, '..', 'data', 'datum_cells_v1_2026-08-28.csv')
CONTROL = dict(cells=142, n=1843, total=21544.2200, sq=270123.8648)

# The championship-tour ladder, in competitive order. Monotonicity is asserted
# over THIS list only. The four WSL Finals rounds (Match 1/2/3, Title Match) are
# a five-surfer single-elimination structure, not a rung on this ladder, so
# forcing them into the ordering would be inventing a progression the format
# does not have. Their fitted values are reported, not asserted.
LADDER = ['Opening Round', 'Qualifying Round', 'Elimination Round',
          'Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final']


def load(path=CSV):
    rows = list(csv.DictReader(open(path)))
    for r in rows:
        r['n'] = int(r['n']); r['sum'] = float(r['sum']); r['sq'] = float(r['sq'])
    return rows


def assert_control(rows):
    got = dict(cells=len(rows),
               n=sum(r['n'] for r in rows),
               total=round(sum(r['sum'] for r in rows), 4),
               sq=round(sum(r['sq'] for r in rows), 4))
    if got != CONTROL:
        sys.exit(f"CONTROL FAILED\n  expected {CONTROL}\n  got      {got}\n"
                 "The cell file does not match what was verified against v2.")
    print(f"control ok — {got['cells']} cells, {got['n']} entries, "
          f"sum {got['total']}, sumsq {got['sq']}")


def pick_lambda(rows, xf, p, events):
    """Choose lambda by leave-one-event-out CV over the whole set."""
    best = (GRID[0], np.inf)
    for lam in GRID:
        s = 0.0
        for e in events:
            tr = [r for r in rows if r['ev'] != e]
            te = [r for r in rows if r['ev'] == e]
            A, b = stats(tr, xf, p)
            s += sse(te, xf, fit(A, b, lam, p))[0]
        if s < best[1]:
            best = (lam, s)
    return best[0]


def main():
    rows = load()
    assert_control(rows)

    levels = {k: sorted({r[k] for r in rows}) for k in ('vn', 'rd', 'fs')}
    events = sorted({r['ev'] for r in rows})
    seasons = sorted({r['sy'] for r in rows})

    loeo = [([r for r in rows if r['ev'] != e], [r for r in rows if r['ev'] == e])
            for e in events]
    loso = [([r for r in rows if r['sy'] != y], [r for r in rows if r['sy'] == y])
            for y in seasons]

    print(f"\n{len(events)} events, {len(seasons)} seasons, "
          f"{len(levels['rd'])} round names, {sum(r['n'] for r in rows)} entries")

    # ---- test 1: PRIMARY, grouped leave-one-event-out -----------------------
    print("\nTEST 1 — PRIMARY: grouped leave-one-event-out")
    rmse_i, n_i = score(rows, [], levels, loeo)
    rmse_r, n_r = score(rows, ['rd'], levels, loeo)
    r2 = 1 - (rmse_r / rmse_i) ** 2
    print(f"  intercept only   RMSE {rmse_i:.4f}  over {n_i} entries")
    print(f"  round (Datum V1) RMSE {rmse_r:.4f}  over {n_r} entries"
          f"   R2 vs intercept-only {r2:6.3f}")
    t1 = rmse_r < rmse_i
    print(f"  -> {'PASS' if t1 else 'FAIL'}: Datum "
          f"{'beats' if t1 else 'does not beat'} intercept-only out-of-sample")

    # ---- test 2: SECONDARY, leave-one-season-out ----------------------------
    print("\nTEST 2 — SECONDARY: leave-one-season-out (sign must agree)")
    rmse_i2, n_i2 = score(rows, [], levels, loso)
    rmse_r2, n_r2 = score(rows, ['rd'], levels, loso)
    print(f"  intercept only   RMSE {rmse_i2:.4f}  over {n_i2} entries")
    print(f"  round (Datum V1) RMSE {rmse_r2:.4f}  over {n_r2} entries")
    t2 = rmse_r2 < rmse_i2
    print(f"  -> {'PASS' if t2 else 'FAIL'}: sign "
          f"{'agrees' if t2 else 'FLIPS'} with the primary design")

    # ---- final fit ----------------------------------------------------------
    xf, p = design(['rd'], levels)
    lam = pick_lambda(rows, xf, p, events)
    A, b = stats(rows, xf, p)
    beta = fit(A, b, lam, p)
    base = levels['rd'][0]
    idx = {lv: i + 1 for i, lv in enumerate(levels['rd'][1:])}
    fitted = {lv: float(beta[0] + (beta[idx[lv]] if lv != base else 0.0))
              for lv in levels['rd']}
    counts = {}
    for r in rows:
        counts[r['rd']] = counts.get(r['rd'], 0) + r['n']

    print(f"\nFINAL FIT — lambda {lam} chosen by leave-one-event-out CV "
          f"over {len(events)} events")
    print(f"  baseline level (absorbed in intercept): {base!r}")

    # ---- test 3: MONOTONICITY over the CT ladder ----------------------------
    print("\nTEST 3 — MONOTONE: fitted round effects along the CT ladder")
    ladder = [r for r in LADDER if r in fitted]
    prev, t3 = None, True
    for lv in ladder:
        flag = ''
        if prev is not None and fitted[lv] < prev:
            flag = '   <-- BREAKS MONOTONICITY'; t3 = False
        print(f"  {lv:<20} {fitted[lv]:7.4f}   n={counts[lv]:>4}{flag}")
        prev = fitted[lv]
    print(f"  -> {'PASS' if t3 else 'FAIL'}: ladder is "
          f"{'monotone' if t3 else 'NOT monotone'} over {len(ladder)} rounds")

    off = [lv for lv in levels['rd'] if lv not in LADDER]
    if off:
        print("\n  WSL Finals rounds — reported, not asserted (see LADDER note):")
        for lv in off:
            print(f"  {lv:<20} {fitted[lv]:7.4f}   n={counts[lv]:>4}")

    # ---- verdict ------------------------------------------------------------
    ok = t1 and t2 and t3
    print("\n" + "=" * 62)
    print(f"ACCEPTANCE TEST: {'PASS' if ok else 'FAIL'}"
          f"  (primary {'ok' if t1 else 'FAIL'}, "
          f"secondary {'ok' if t2 else 'FAIL'}, "
          f"monotone {'ok' if t3 else 'FAIL'})")
    print("=" * 62)

    # ---- emit the round effects the seed will use ---------------------------
    out = os.path.join(HERE, '..', 'data', 'datum_round_effects_v1.csv')
    with open(out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['round_name', 'expected_score', 'n_entries', 'on_ladder'])
        for lv in levels['rd']:
            w.writerow([lv, f"{fitted[lv]:.4f}", counts[lv], lv in LADDER])
    print(f"\nround effects written to {os.path.relpath(out, HERE + '/..')}"
          f" — {len(levels['rd'])} rounds, {sum(counts.values())} entries")

    # Run metrics, for the seed generator. Written only on a PASS: a model
    # that failed a gate must not leave behind an artefact a later step can
    # pick up and load without noticing.
    if ok:
        import json
        meta = dict(computed_on='2026-08-28', spec='round', lam=lam,
                    n_entries=sum(r['n'] for r in rows), n_events=len(events),
                    n_rounds=len(levels['rd']),
                    rmse_loeo=round(rmse_r, 6), rmse_intercept_loeo=round(rmse_i, 6),
                    r2_vs_intercept=round(r2, 6),
                    rmse_loso=round(rmse_r2, 6), rmse_intercept_loso=round(rmse_i2, 6),
                    ladder_monotone=t3,
                    cells_file='data/datum_cells_v1_2026-08-28.csv',
                    script='scripts/compute_datum.py')
        mp = os.path.join(HERE, '..', 'data', 'datum_run_v1.json')
        json.dump(meta, open(mp, 'w'), indent=2)
        print(f"run metrics written to {os.path.relpath(mp, HERE + '/..')}")
    print(f"lambda={lam}  rmse_loeo={rmse_r:.4f}  rmse_intercept_loeo={rmse_i:.4f}"
          f"  r2={r2:.4f}  rmse_loso={rmse_r2:.4f}")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
