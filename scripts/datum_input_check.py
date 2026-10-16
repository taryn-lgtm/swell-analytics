#!/usr/bin/env python3
"""
Datum input check — the measurement that closed decisions 26 and 27 on 27 August 2026.

WHAT THIS ANSWERS
    Decision 26: which of break / round / wave type / field does Datum actually use?
    Decision 27: how is Datum validated, given it has no published figure to
                 reconcile against?

WHY IT READS A CSV AND NOT THE DATABASE
    The input is a *cell aggregate*, not a row dump: for a model whose features are
    all categorical, (n, sum(y), sum(y^2)) per distinct feature combination is a
    sufficient statistic for ridge — X'X, X'y and y'y are all recoverable from it.
    So the whole comparison runs off 151 rows instead of 1,668, and the retained
    file is small enough to read by eye. The CSV is a retained artefact in the
    project's usual sense: regenerate it with the SQL below and diff.

REGENERATE THE INPUT (Supabase project v2):

    select e.id ev, e.season_year sy, e.kind, h.venue_id vn, r.name rd, e.field_size fs,
     coalesce(h.wave_height_min_ft::text||'-'||h.wave_height_max_ft::text,'unknown') hb,
     coalesce(h.wind_conditions,'unknown') wd,
     count(*) n, round(sum(he.heat_total),4) sum, round(sum(he.heat_total*he.heat_total),4) sq
    from heat_entries he
      join heats h on h.id = he.heat_id
      join rounds r on r.id = h.round_id
      join events e on e.id = r.event_id
    where he.heat_total is not null and h.venue_id is not null and e.field_size is not null
    group by 1,2,3,4,5,6,7,8 order by 1,5,7,8;

CONTROL — the transcription was verified against v2 before any figure was believed:
    151 cells, n 1668, sum(y) 19429.8000, sum(y^2) 242462.0592, 22 events,
    16 venues, 12 round names. assert_control() below re-checks the first four
    every run, so a truncated or edited CSV fails loudly instead of quietly
    changing the answer.

TARGET
    heat_entries.heat_total — one row per surfer per heat. All 138 rounds share
    one scoring basis (best_two_overall, 2 counting rides, max 20), so the target
    is one comparable quantity across the whole set; that was checked, not assumed.

NOT COMPUTED HERE
    MAE. Within a cell every row shares a prediction but not a residual, so |y-yhat|
    is not recoverable from (n, sum, sumsq). RMSE is. Reporting an MAE from this
    input would be inventing one.
"""
import csv, os, sys
import numpy as np

CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', 'data', 'datum_cells_2026-08-27.csv')
CONTROL = dict(cells=151, n=1668, total=19429.8000, sq=242462.0592)
GRID = [0.01, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000]


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
                 "The cell file does not match what was verified against v2. "
                 "Regenerate it with the SQL in this file's docstring.")
    print(f"control ok — {got['cells']} cells, {got['n']} entries, "
          f"sum {got['total']}, sumsq {got['sq']}")


def design(spec, levels):
    """Drop-first dummy coding. Column 0 is the intercept and is never penalised."""
    idx, cols = {}, 1
    for k in spec:
        for lv in levels[k][1:]:
            idx[(k, lv)] = cols; cols += 1
    def x(r):
        v = np.zeros(cols); v[0] = 1.0
        for k in spec:
            j = idx.get((k, r[k]))
            if j is not None:
                v[j] = 1.0
        return v
    return x, cols


def stats(sub, xf, p):
    A = np.zeros((p, p)); b = np.zeros(p)
    for r in sub:
        v = xf(r); A += r['n'] * np.outer(v, v); b += r['sum'] * v
    return A, b


def fit(A, b, lam, p):
    P = np.eye(p) * lam; P[0, 0] = 0.0
    # lstsq, not solve: a level unseen in a training fold leaves an all-zero
    # column, which is singular at small lambda. Minimum-norm gives it zero
    # weight, which is the honest prediction for a level never observed.
    return np.linalg.lstsq(A + P, b, rcond=None)[0]


def sse(sub, xf, beta):
    s = 0.0; n = 0
    for r in sub:
        yh = float(xf(r) @ beta)
        s += r['sq'] - 2 * yh * r['sum'] + r['n'] * yh * yh
        n += r['n']
    return s, n


def score(rows, spec, levels, folds, keep=None):
    """Nested CV: lambda is chosen inside the training fold, never on the fold scored."""
    xf, p = design(spec, levels)
    tot = 0.0; ntot = 0
    for tr, te in folds:
        if keep:
            te = [r for r in te if keep(r, tr)]
        if not te:
            continue
        inner = sorted({r['ev'] for r in tr})
        best = (GRID[0], np.inf)
        for lam in GRID:
            s = 0.0
            for e2 in inner:
                t2 = [r for r in tr if r['ev'] != e2]
                v2 = [r for r in tr if r['ev'] == e2]
                A, b = stats(t2, xf, p)
                s += sse(v2, xf, fit(A, b, lam, p))[0]
            if s < best[1]:
                best = (lam, s)
        A, b = stats(tr, xf, p)
        s, n = sse(te, xf, fit(A, b, best[0], p))
        tot += s; ntot += n
    return (tot / ntot) ** 0.5, ntot


SPECS = {
    'intercept only':        [],
    'round only':            ['rd'],
    'break + round + field': ['vn', 'rd', 'fs'],
    '+ wave height + wind':  ['vn', 'rd', 'fs', 'hb', 'wd'],
    'break only':            ['vn'],
    'field only':            ['fs'],
}


def main():
    rows = load()
    assert_control(rows)
    levels = {k: sorted({r[k] for r in rows}) for k in ('vn', 'rd', 'fs', 'hb', 'wd')}
    events = sorted({r['ev'] for r in rows})
    seasons = sorted({r['sy'] for r in rows})

    loeo = [([r for r in rows if r['ev'] != e], [r for r in rows if r['ev'] == e])
            for e in events]
    loso = [([r for r in rows if r['sy'] != y], [r for r in rows if r['sy'] == y])
            for y in seasons]
    seen = lambda r, tr: any(x['vn'] == r['vn'] for x in tr)

    designs = [
        ('PRIMARY — grouped leave-one-event-out (decision 27)', loeo, None),
        ('control — same, but only breaks seen in training',    loeo, seen),
        ('secondary — leave-one-season-out (2024 <-> 2025)',    loso, None),
    ]
    base = {}
    for label, folds, keep in designs:
        print(f"\n{label}")
        for name, spec in SPECS.items():
            rmse, n = score(rows, spec, levels, folds, keep)
            if label.startswith('PRIMARY'):
                base[name] = rmse
            r2 = 1 - (rmse / base['intercept only']) ** 2 if 'intercept only' in base else float('nan')
            extra = f"   R2 vs intercept-only {r2:6.3f}" if label.startswith('PRIMARY') else ""
            print(f"  {name:<24} RMSE {rmse:.4f}  over {n} entries{extra}")

    print("\nin-sample ceiling (fit all, score all, lambda 0.01) — the overfitting check")
    for name, spec in SPECS.items():
        xf, p = design(spec, levels)
        A, b = stats(rows, xf, p)
        s, n = sse(rows, xf, fit(A, b, 0.01, p))
        print(f"  {name:<24} RMSE {(s / n) ** 0.5:.4f}")

    ve = {}
    for r in rows:
        ve.setdefault(r['vn'], set()).add(r['ev'])
    once = [v for v, es in ve.items() if len(es) == 1]
    thin = sum(r['n'] for r in rows if len(ve[r['vn']]) == 1)
    print(f"\nbreak coverage — {len(ve)} venues, {len(once)} appearing in exactly one event; "
          f"{thin} of {sum(r['n'] for r in rows)} entries sit at one.")
    print("This is why the leave-one-event-out result was not believed until the "
          "two alternative designs above had been run.")


if __name__ == '__main__':
    main()
