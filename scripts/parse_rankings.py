#!/usr/bin/env python3
"""Parse a retained WSL MCT rankings page into per-surfer, per-event rows.

Source: docs/sources/raw/<year>_mct_final_rankings.html (artefact 35 / 105).
Reads disk only. Never fetches. Emits JSON on stdout.

Every field is READ from the page. Nothing is derived here:
  - event_placing   <- "Nth Place" in the cell tooltip
  - points          <- "N,NNN Points" in the cell tooltip
  - throwaway_published <- literal "Throwaway" label in the cell tooltip
  - status_note     <- the cell tooltip's <span class="status-note"> VERBATIM
  - injury_marker   <- presence of <span class="tooltip-inj">INJ</span>
  - event_name / event_slug / wsl_event_id_rankings <- the column header tooltip
Absence is emitted as null with a reason, never as zero.

DELIBERATELY NOT DERIVED HERE: `status_note` is free text and is emitted as the
raw published string. It is NOT mapped to event_entries.participation or
.status. The published vocabulary is inconsistent and self-contradictory --
'Replacement: WSL Wildcard.' leads with one category and names another -- so any
mapping onto the three-value CHECK is a judgement that has to be stated and
signed, not made by a parser. See the open decision raised 31 August.

NOTE on wsl_event_id_rankings: the rankings href uses the /events/<year>/mct/<id>/
id space, which is NOT the /ct/<n>/ space the format spec carries as
wsl_event_id. Two WSL id spaces, both correct. Emitted for binding work to use
with its eyes open; never assume the two are the same number.
"""
import re, html, json, sys

CELL = re.compile(r'<t[dh][^>]*class="(athlete-event-place |athlete-rank stat sorted first|'
                  r'athlete-headshot-and-name|athlete-finalist sorted|'
                  r'athlete-points athlete-tour-region-year-points stat last|'
                  r'athlete-rank-change|athlete-flags-frame )"[^>]*>(.*?)</t[dh]>', re.S)

def text(frag):
    """Flatten a cell to readable text.

    Order matters, and the obvious reordering is WRONG. "Nth Place" and
    "N,NNN Points" live in the tooltip's *attribute payload*
    (data-tooltip="{&quot;content&quot;:&quot;...&quot;}"), not in the element
    body -- so stripping real tags before unescaping deletes the tag that
    carries the data. Tried 31 August: placing went null on 289 of 500 cells
    and points on 322. Unescape FIRST, strip the revealed markup, then drop
    the JSON wrapper's trailing punctuation, which is what left cells reading
    '17th Place Wildcard: WSL Wildcard "}">-'.
    """
    s = html.unescape(frag)                 # reveals the tooltip payload as markup
    s = re.sub('<[^>]+>', ' ', s)           # strip both real and revealed tags
    s = re.sub(r'["\'}\]]+\s*>', ' ', s)    # the JSON wrapper's trailing "}">
    return re.sub(r'\s+', ' ', s).strip()

def parse(year, path):
    s = open(path, encoding='utf-8', errors='replace').read()

    th, the = s.find('<thead'), s.find('</thead>')
    head = s[th:the]
    grp = re.search(r'colspan="(\d+)"[^>]*>\s*<em><b></b><span>([^<]*)</span>', head)
    declared = int(grp.group(1))
    # The header tooltip nests the name inside its own <span class="link">, so a
    # capture that stops at the first '&lt;' after tooltip-contents returns the
    # EMPTY STRING, not the name -- and a length assertion cannot see that,
    # because ten empty strings still count ten. Measured 31 August against the
    # 2022 artefact: every name came back ''. Reach past the inner span, and
    # assert the names are non-empty as well as correctly counted.
    names, slugs, rank_ids = [], [], []
    for c in re.findall(r'<th class="athlete-event-place "[^>]*>(.*?)</th>', head, re.S):
        nm = re.search(r'tooltip-contents\\?&quot;&gt;(?:.*?&gt;)?([^&]*?)&lt;', c, re.S)
        # The href's slashes are backslash-escaped in the tooltip payload
        # (data-href=\&quot;\/events\/2022\/mct\/3885\/slug\&quot;). Drop the
        # backslashes before matching, or the pattern silently finds nothing
        # and every slug comes back None.
        href = re.search(r'/events/(\d+)/[a-z]+/(\d+)/([a-z0-9\-]+)', c.replace('\\', ''))
        names.append(html.unescape(nm.group(1)).replace('\\', '').strip() if nm else None)
        slugs.append(href.group(3) if href else None)
        rank_ids.append(int(href.group(2)) if href else None)
    assert len(names) == declared, f'{year}: {len(names)} event columns against colspan {declared}'
    blank = [i + 1 for i, n in enumerate(names) if not n]
    assert not blank, f'{year}: event name empty in column(s) {blank} -- header tooltip shape changed'

    tb, te = s.find('<tbody'), s.find('</tbody>')
    rows = re.findall(r'<tr([^>]*)>(.*?)</tr>', s[tb:te], re.S)

    athletes, markers = [], []
    for attrs, r in rows:
        if 'cut-off-row' in attrs:
            markers.append({'kind': 'cut_off_row', 'after_rank': len(athletes)})
            continue
        cells = CELL.findall(r)
        by = {}
        events = []
        for cls, v in cells:
            if cls == 'athlete-event-place ':
                events.append(v)
            else:
                by[cls] = v
        if 'athlete-headshot-and-name' not in by:
            continue
        name_frag = by['athlete-headshot-and-name']
        nm = re.search(r'class="athlete-name"[^>]*>(.*?)</', name_frag, re.S)
        cn = re.search(r'class="athlete-country-name"[^>]*>(.*?)</', name_frag, re.S)
        slug = re.search(r'/athletes/(\d+)/', name_frag)

        per = []
        for i, frag in enumerate(events):
            t = text(frag)
            place = re.search(r'(\d+)(?:st|nd|rd|th) Place', t)
            pts = re.search(r'([\d,]+) Points', t)
            # Read the published Throwaway label from the tooltip's own span,
            # not as a substring of the flattened cell text -- the flattened
            # text also contains the free-text status note.
            throwaway = re.search(r'&lt;span&gt;\s*Throwaway\s*&lt;', frag) is not None
            note = re.search(r'status-note\\?&quot;&gt;(.*?)&lt;', frag, re.S)
            per.append({
                'column': i + 1,
                'event_name': names[i],
                'event_slug': slugs[i],
                'wsl_event_id_rankings': rank_ids[i],
                'event_placing': int(place.group(1)) if place else None,
                'points': int(pts.group(1).replace(',', '')) if pts else None,
                'throwaway_published': throwaway if pts else None,
                'status_note': html.unescape(note.group(1)).replace('\\', '').strip() if note else None,
                'injury_marker': 'tooltip-inj' in frag,
                'cell_text': t if not pts else None,   # kept only when nothing was read
            })

        athletes.append({
            'rank': int(text(by.get('athlete-rank stat sorted first', ''))) if text(by.get('athlete-rank stat sorted first', '')).isdigit() else None,
            'name': text(nm.group(1)) if nm else None,
            'country': text(cn.group(1)) if cn else None,
            'wsl_athlete_id': int(slug.group(1)) if slug else None,
            'finalist_seed': (lambda x: int(x) if x.isdigit() else None)(text(by.get('athlete-finalist sorted', ''))),
            'season_points': (lambda x: int(x.replace(',', '')) if x.replace(',', '').isdigit() else None)(text(by.get('athlete-points athlete-tour-region-year-points stat last', ''))),
            'events': per,
        })

    return {'year': year, 'source': path, 'declared_event_columns': declared,
            'event_names': names, 'event_slugs': slugs,
            'event_ids_rankings_space': rank_ids,
            'n_athletes': len(athletes),
            'markers': markers, 'athletes': athletes}

if __name__ == '__main__':
    year = int(sys.argv[1])
    out = parse(year, f'docs/sources/raw/{year}_mct_final_rankings.html')
    json.dump(out, sys.stdout, indent=1)
