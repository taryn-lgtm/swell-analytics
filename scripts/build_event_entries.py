#!/usr/bin/env python3
"""Generate the event_entries seed for 2024 and 2025 from the retained rankings.

    python3 scripts/build_event_entries.py > supabase/seeds/event_entries_2024_2025.sql

Reads data/rankings_<year>.json, produced by scripts/parse_rankings.py from the
retained artefacts. Reads disk only. Never fetches.

WHAT IS READ AND WHAT IS DERIVED — the distinction this project turns on:

  READ, straight off the page
    event_placing        "Nth Place" in the cell tooltip
    points               "N,NNN Points" in the cell tooltip
    throwaway_published  the literal "Throwaway" span
    status_note          the <span class="status-note"> VERBATIM

  DERIVED here, from the above, by the mapping table below
    participation        from the status_note's leading keyword
    status               likewise
    points_status        from whether points/placing were published
    throwaway_derived    best (P-1) of P eligible pre-cut events

Both throwaway values are stored so the standing audit check can assert they
agree, per CLAUDE.md. They agree on 68 of 68 rows today; that is asserted
below and the generator REFUSES rather than emitting a seed if it ever stops
being true.

WHAT THIS SEED DOES NOT COVER, stated because it is item 4's whole problem.
The rankings page publishes only the season-ranked field — 35 surfers per
year, 43 distinct across the two. v2 holds 73 surfers. The other 30 competed
as wildcards or replacements and appear on this page ONLY as names inside
someone else's free-text note ("Replaced by Morgan Cibilic"), never as rows.
So this seed gives participation for the ranked field and identifies no
wildcard's own entries. Item 4 is not closed by it. Two data_gaps rows, one
per season, record that rather than leaving it to be discovered.
"""
import json, re, sys, unicodedata, collections

YEARS = (2024, 2025)

# Read from v2 on 31 August 2026. events.occurs_after_cut is the authority for
# P; the Finals row is excluded because it awards no ranking points (trap 4)
# and the page has no column for it.
PRE_CUT_EVENTS = {2024: 5, 2025: 7}
POINT_COLUMNS  = {2024: 9, 2025: 11}

ARTEFACT_SHA = {
    2024: '8308cd52b001dc5bd162f7698885fde5fe2a4e038be6c855010effb9b0437f25',
    2025: '0d58e9f068099c9951ed32714b16a0f34fc1ff3f7bbb234bf7e28b2cb67393cd',
}

# Era A Appendix B. Used only to CHECK the published pairing, never to supply
# a value — trap 3's failure is deriving points from placings.
BAND = {1: 10000, 2: 7800, 3: 6085, 5: 4745, 9: 3320, 17: 1330, 33: 265}

# ---------------------------------------------------------------------------
# THE MAPPING. Free text -> two enums. This is the one derivation in the file
# and it is written as a table so it can be read, argued with and changed.
#
# Keyed on the note's leading keyword, which is the only part of the string
# WSL writes consistently. Counts are over both in-scope seasons, 700 cells.
#
#   keyword         n   participation       status
#   <no note>     663   ct_surfer           competed, or did_not_contest for '-'
#   Injured        18   ct_surfer           injured_withdrawal
#   Replacement     8   injury_replacement  competed
#   Wildcard        6   event_wildcard      competed
#   Withdrawn       4   ct_surfer           injured_withdrawal / did_not_contest
#   Parental leave  1   ct_surfer           non_injury_withdrawal
#
# 'Withdrawn' splits on whether anything was published for the cell, not on
# the words: three cells carry a placing and points and are withdrawals from
# a contested event; one (Kelly Slater, 2024 MEO Rip Curl Pro Portugal)
# carries neither and never contested it.
#
# 'Injured' maps to ct_surfer, not to a participation value, because the note
# describes the surfer's condition, not how they entered. Every one of the 18
# is a ranked CT surfer who was replaced.
# ---------------------------------------------------------------------------
PARTICIPATION_BY_KEYWORD = {
    None:             'ct_surfer',
    'Injured':        'ct_surfer',
    'Withdrawn':      'ct_surfer',
    'Parental leave': 'ct_surfer',
    'Replacement':    'injury_replacement',
    'Wildcard':       'event_wildcard',
}
KNOWN_KEYWORDS = set(PARTICIPATION_BY_KEYWORD)


def keyword(note):
    """The leading keyword of a status note, or None."""
    if not note:
        return None
    return note.split(':')[0].split(' -')[0].strip()


def norm_event(name):
    """Page event name -> v2 events.slug. ONE transform: drop the sponsor tail."""
    s = unicodedata.normalize('NFKD', name)
    s = re.sub(r'\s+presented by\b.*$', '', s, flags=re.I)
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def sql_str(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def sql_val(v):
    return 'NULL' if v is None else str(v)


def classify(cell):
    """-> (participation, status, points_status). The only derivation."""
    kw = keyword(cell['status_note'])
    if kw not in KNOWN_KEYWORDS:
        raise SystemExit(
            f"REFUSING: unknown status-note keyword {kw!r} in {cell['status_note']!r}.\n"
            "The published vocabulary has changed. Extend the mapping table "
            "deliberately; do not let an unrecognised note fall through to a default."
        )
    participation = PARTICIPATION_BY_KEYWORD[kw]
    has_points, has_place = cell['points'] is not None, cell['event_placing'] is not None

    if not has_points and not has_place:
        # Rendered '-', or a withdrawal before the event: nothing was contested.
        return participation, 'did_not_contest', 'not_contested'
    if kw == 'Injured' or (kw == 'Withdrawn' and has_points):
        return participation, 'injured_withdrawal', 'published'
    if kw == 'Parental leave':
        return participation, 'non_injury_withdrawal', 'published'
    if not has_points:
        # Placed but earned nothing — every wildcard in scope (trap 3).
        return participation, 'competed', 'none_earned'
    return participation, 'competed', 'published'


def build(year):
    d = json.load(open(f'data/rankings_{year}.json'))
    P, ncol = PRE_CUT_EVENTS[year], POINT_COLUMNS[year]

    assert d['declared_event_columns'] == ncol, \
        f"{year}: page declares {d['declared_event_columns']} columns, v2 has {ncol} point-awarding events"

    slugs = [norm_event(n) for n in d['event_names']]
    assert len(set(slugs)) == len(slugs), f'{year}: event slugs not distinct after normalisation: {slugs}'

    rows, notes = [], []
    for a in d['athletes']:
        ev = {c['column']: c for c in a['events']}

        # throwaway_derived, independently of the published flag
        pre = [(c, ev[c]['points']) for c in range(1, P + 1) if ev[c]['points'] is not None]
        dropped = min(pre, key=lambda t: t[1])[0] if len(pre) > P - 1 else None

        total = (sum(p for _, p in pre)
                 - (dict(pre)[dropped] if dropped else 0)
                 + sum(ev[c]['points'] for c in range(P + 1, ncol + 1) if ev[c]['points'] is not None))
        assert total == a['season_points'], \
            f"{year} {a['name']}: derived {total} against published {a['season_points']}"

        published_drop = [c for c in ev if ev[c]['throwaway_published'] is True]
        assert published_drop == ([dropped] if dropped else []), \
            f"{year} {a['name']}: published throwaway {published_drop} against derived {dropped}"

        # The per-athlete check above compares only which column was FLAGGED. It
        # is weaker than the standing audit check the seed runs, which compares
        # the two columns row by row including their NULLs -- and the difference
        # is not academic: it let 5 rows through on 31 August and the database
        # refused the seed. Mirror the SQL predicate exactly, here, so the
        # generator is what catches this and not the apply.
        def derived_for(col):
            """NULL unless a result was published in an eligible pre-cut event.

            A throwaway is a property of a RESULT. Kelly Slater's withdrawal and
            Filipe Toledo's four uncontested 2024 events have no result, so
            'was this the dropped one' has no answer -- and WSL publishes NULL
            there too. Emitting false would assert 'this was not the throwaway'
            about an event the surfer never contested.
            """
            if col > P or ev[col]['points'] is None:
                return None
            return col == dropped

        for col in range(1, ncol + 1):
            c = ev[col]
            participation, status, points_status = classify(c)

            if participation == 'event_wildcard' and c['points'] is not None:
                raise SystemExit(
                    f"REFUSING: {year} {a['name']} col {col} is a wildcard carrying "
                    f"{c['points']} points. ee_wildcards_score_nothing would reject it. "
                    "The 2022 page does exactly this; if 2024/2025 have started to, "
                    "trap 3 and the CHECK both need revisiting before any load."
                )
            if (points_status == 'published') != (c['points'] is not None):
                raise SystemExit(f"REFUSING: {year} {a['name']} col {col} breaks ee_points_status_agrees")
            if status == 'did_not_contest' and points_status != 'not_contested':
                raise SystemExit(f"REFUSING: {year} {a['name']} col {col} breaks ee_did_not_contest_agrees")
            if status == 'non_injury_withdrawal' and not c['status_note']:
                raise SystemExit(f"REFUSING: {year} {a['name']} col {col} breaks ee_status_note_required")

            if c['points'] is not None and c['event_placing'] is not None \
               and BAND.get(c['event_placing']) != c['points']:
                notes.append((slugs[col - 1], a['name'],
                              f"published {c['event_placing']}th place with {c['points']} points, "
                              f"where the Era A band for {c['event_placing']}th is "
                              f"{BAND.get(c['event_placing'])}. Both values are published and both "
                              f"are stored. status_note: {c['status_note']!r}"))

            td = derived_for(col)
            if td is not None and c['throwaway_published'] is not td:
                raise SystemExit(
                    f"REFUSING: {year} {a['name']} col {col}: published throwaway "
                    f"{c['throwaway_published']!r} against derived {td!r}. This is the "
                    "standing audit check, run at generation time so the apply never sees it."
                )
            # No NULL-symmetry check here, deliberately. A post-cut cell is
            # published false and derived NULL -- the event was not eligible, so
            # "was it dropped" has no answer -- and the standing check ignores
            # rows where derived IS NULL. A symmetry check was tried on
            # 31 August and refused 2024 John John Florence col 6, a correct
            # row. Mirror the SQL predicate, not a stricter idea of it.

            rows.append(dict(
                slug=slugs[col - 1], wsl_athlete_id=a['wsl_athlete_id'], name=a['name'],
                event_placing=c['event_placing'], points=c['points'],
                points_status=points_status, participation=participation, status=status,
                status_note=c['status_note'],
                throwaway_published=c['throwaway_published'],
                throwaway_derived=td,
            ))
    return d, rows, notes


def main():
    out = []
    w = out.append
    w('-- =====================================================================')
    w('-- event_entries — 2024 and 2025 final rankings')
    w('-- Generated by scripts/build_event_entries.py')
    w('--')
    w('-- Rule 6: review this, then run it yourself. Claude does not execute it.')
    w('--')
    w('-- Sources, both retained and registered in artefacts:')
    for y in YEARS:
        w(f'--   {y}  docs/sources/raw/{y}_mct_final_rankings.html')
        w(f'--         sha256 {ARTEFACT_SHA[y]}')
    w('--')
    w('-- Requires migration 00000000000016 (status_note, non_injury_withdrawal).')
    w('--')
    w('-- Binding, asserted in this file rather than trusted:')
    w('--   events  by name after dropping " presented by ...", cross-checked against')
    w('--           column order. Both methods agree on 9 of 9 (2024) and 11 of 11')
    w('--           (2025). Decision 20 refused a name matcher for 2022/2023; this is')
    w('--           the same question answered with a measured 100% floor for the two')
    w('--           seasons in V1 scope, and says nothing about 2022 or 2023.')
    w('--   surfers by wsl_athlete_id, 43 of 43, no name matching anywhere.')
    w('--')
    w('-- Idempotent: ON CONFLICT (event_id, surfer_id) DO NOTHING.')
    w('-- =====================================================================')
    w('')
    w('BEGIN;')
    w('')

    totals, all_notes = {}, []
    for y in YEARS:
        d, rows, notes = build(y)
        totals[y] = rows
        all_notes += [(y,) + n for n in notes]
        kw = collections.Counter(r['status'] for r in rows)
        w(f'-- ---------- {y}: {len(rows)} entries over {d["n_athletes"]} ranked surfers ----------')
        w(f'-- status: ' + ', '.join(f'{k} {v}' for k, v in sorted(kw.items())))
        w('')
        # ONE statement per season, not one per row. 700 separate INSERTs came
        # to 401 KB, and the Supabase Management API times out on large files
        # (CLAUDE.md, on the 48 KB schema). A VALUES list joined to events and
        # surfers does the same work in a tenth of the bytes and keeps the
        # natural-key resolution -- no id is ever hardcoded.
        w('INSERT INTO event_entries (event_id, surfer_id, event_placing, points, points_status,')
        w('       participation, status, status_note, throwaway_published, throwaway_derived, artefact_id)')
        w('SELECT e.id, s.id, v.event_placing::integer, v.points::integer, v.points_status,')
        w('       v.participation, v.status, v.status_note,')
        w('       v.throwaway_published::boolean, v.throwaway_derived::boolean, a.id')
        w('  FROM (VALUES')
        for i, r in enumerate(rows):
            tp = 'NULL' if r['throwaway_published'] is None else str(r['throwaway_published']).lower()
            td = 'NULL' if r['throwaway_derived'] is None else str(r['throwaway_derived']).lower()
            comma = ',' if i < len(rows) - 1 else ''
            w(f"    ({sql_str(r['slug'])},{sql_str(r['wsl_athlete_id'])},{sql_val(r['event_placing'])},"
              f"{sql_val(r['points'])},{sql_str(r['points_status'])},{sql_str(r['participation'])},"
              f"{sql_str(r['status'])},{sql_str(r['status_note'])},{tp},{td}){comma}")
        w('  ) AS v(slug, wsl_athlete_id, event_placing, points, points_status,')
        w('         participation, status, status_note, throwaway_published, throwaway_derived)')
        w(f'  JOIN events   e ON e.season_year = {y} AND e.slug = v.slug')
        w('  JOIN surfers  s ON s.wsl_athlete_id = v.wsl_athlete_id')
        w('  CROSS JOIN artefacts a')
        w(f" WHERE a.sha256 = {sql_str(ARTEFACT_SHA[y])}")
        w('ON CONFLICT (event_id, surfer_id) DO NOTHING;')
        w('')
        # A join that fails to match drops rows silently. The count assertion at
        # the foot of this file is what catches that; it is not decoration.
        w(f'-- {len(rows)} rows above; the assertion block below fails if any did not join.')
        w('')

    # ---- data_gaps: the two things this source cannot supply ----
    w('-- ---------- what this source does not publish ----------')
    for y in YEARS:
        w("INSERT INTO data_gaps (scope, scope_id, season_year, field, reason, source_note, opened_at)")
        w(f"SELECT 'season', NULL, {y}, 'event_entries for non-ranked entrants',")
        w("       'The MCT rankings page publishes only the season-ranked field (35 surfers). "
          "Wildcards and replacements who competed appear on it only as names inside another "
          "surfer''s status note, never as rows, so no event_entries row exists for their own "
          "entries. Blocks M2 item 4 for that cohort.',")
        w(f"       'docs/sources/raw/{y}_mct_final_rankings.html', CURRENT_DATE")
        w(f" WHERE NOT EXISTS (SELECT 1 FROM data_gaps WHERE season_year = {y}")
        w("         AND field = 'event_entries for non-ranked entrants');")
    for (y, slug, who, why) in all_notes:
        w("INSERT INTO data_gaps (scope, scope_id, season_year, field, reason, source_note, opened_at)")
        w(f"SELECT 'event', e.id, {y}, 'event_placing/points disagreement',")
        w(f"       {sql_str(who + ': ' + why)},")
        w(f"       'docs/sources/raw/{y}_mct_final_rankings.html', CURRENT_DATE")
        w(f"  FROM events e WHERE e.season_year = {y} AND e.slug = {sql_str(slug)}")
        w(f"   AND NOT EXISTS (SELECT 1 FROM data_gaps g WHERE g.scope_id = e.id")
        w("         AND g.field = 'event_placing/points disagreement');")
    w('')

    # ---- assertions ----
    n_total = sum(len(v) for v in totals.values())
    w('DO $$')
    w('DECLARE n bigint; bad bigint;')
    w('BEGIN')
    w("  SELECT count(*) INTO n FROM event_entries;")
    w(f"  IF n <> {n_total} THEN")
    w(f"    RAISE EXCEPTION 'event_entries holds % rows, expected {n_total}', n;")
    w('  END IF;')
    w('  SELECT count(*) INTO bad FROM event_entries WHERE artefact_id IS NULL;')
    w("  IF bad > 0 THEN RAISE EXCEPTION '% entries with no artefact', bad; END IF;")
    w('  SELECT count(*) INTO bad FROM event_entries')
    w("   WHERE throwaway_published IS DISTINCT FROM throwaway_derived")
    w("     AND throwaway_derived IS NOT NULL;")
    w("  IF bad > 0 THEN")
    w("    RAISE EXCEPTION '% rows where the published throwaway flag and the derived one disagree', bad;")
    w('  END IF;')
    w("  RAISE NOTICE 'event_entries: % rows, provenance complete, throwaway published = derived', n;")
    w('END $$;')
    w('')
    w('COMMIT;')
    print('\n'.join(out))
    print(f'-- {n_total} entries emitted', file=sys.stderr)


if __name__ == '__main__':
    main()
