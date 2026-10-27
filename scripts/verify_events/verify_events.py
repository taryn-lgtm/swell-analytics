"""Reduce rendered /events/<param> HTML to canonical lines per section and
compare md5s against the independent SQL (verify_events.sql -> expected.tsv).

Usage: python3 scripts/verify_events/verify_events.py <html_dir_or_base_url> [--dump param section]
  html dir: .next/server/app/events after `npm run build`.
  expected.tsv: the output of verify_events.sql, run against v2 (param, then
  md5 of header, draw, field, heats, movement). Regenerate it whenever the
  data changes; it is a snapshot of 30 September 2026.
"""
import hashlib, sys, os, urllib.request
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
SECTIONS = ["header", "draw", "field", "heats", "movement"]


def t(el):
    return el.get_text("", strip=True) if el is not None else None


def canon(html):
    soup = BeautifulSoup(html, "html.parser")
    out = {}

    # header
    h = []
    for key in ("rounds", "heats", "surfed"):
        box = soup.select_one(f'[data-stat="{key}"]')
        # StatLine: label span, then value span inside a flex span
        val = box.select_one("span.figures")
        h.append(f"{key}={t(val)}")
    h.append(f"winner={t(soup.select_one('[data-v=winner]'))}")
    h.append(f"venues={t(soup.select_one('[data-v=venues]'))}")
    d = soup.select_one("[data-v=dates]")
    if d is not None:
        h.append(f"dates={t(d)}")
    vu = soup.select_one("[data-v=venue-unknown]")
    if vu is not None:
        h.append(f"venue_unknown={t(vu)}")
    lv = soup.select_one("[data-v=listed-venue]")
    if lv is not None:
        h.append(f"listed={t(lv)}")
    out["header"] = "\n".join(h)

    # draw
    lines = []
    for dh in soup.select("[data-draw-heat]"):
        label = t(dh.select_one("[data-v=draw-label]"))
        for s in dh.select("[data-v=draw-surfer]"):
            lines.append(f"{label}:{t(s)}")
    out["draw"] = "\n".join(lines)

    # field
    lines = []
    table = soup.select_one("table[data-v=field]")
    finals = table is not None and table.select_one("[data-v=points]") is None
    for tr in (table.select("tr[data-field-row]") if table else []):
        parts = [t(tr.select_one("[data-v=placing]")), t(tr.select_one("[data-v=surfer]")), t(tr.select_one("[data-v=heats]"))]
        if not finals:
            pts = tr.select_one("[data-v=points]")
            thr = pts.select_one("[data-v=throwaway]")
            if thr is not None:
                thr.extract()
            parts += [t(pts), "T" if thr is not None else "", t(tr.select_one("[data-v=participation]")), t(tr.select_one("[data-v=status]"))]
        lines.append("|".join(parts))
    out["field"] = "\n".join(lines)

    # heats
    lines = []
    for sec in soup.select("[data-v=heatlist] section"):
        rname = t(sec.select_one("h3").contents[0]) if sec.select_one("h3").contents else ""
        rname = sec.select_one("h3").contents[0].strip() if isinstance(sec.select_one("h3").contents[0], str) else t(sec.select_one("h3").contents[0])
        for tb in sec.select("table[data-heat]"):
            label = t(tb.select_one("[data-v=heat-label]"))
            venue = t(tb.select_one("[data-v=heat-venue]"))
            cond = t(tb.select_one("[data-v=heat-conditions]"))
            for tr in tb.select("tr[data-entry]"):
                prog = tr.select_one("[data-v=progression]")
                lines.append("|".join([
                    rname, label, venue, cond,
                    t(tr.select_one("[data-v=position]")),
                    t(tr.select_one("[data-v=surfer]")),
                    t(tr.select_one("[data-v=rides]")),
                    t(tr.select_one("[data-v=total]")),
                    t(prog) if prog is not None else "",
                ]))
    out["heats"] = "\n".join(lines)

    # movement
    lines = [f"movers_n={t(soup.select_one('[data-v=movers-n]'))}"]
    for tr in soup.select("table[data-v=movement] tr[data-mover]"):
        # before/after: the site draws U+2212, the SQL's to_char a hyphen.
        # delta: both draw U+2212 (the SQL spells it out). Compare values.
        cells = [t(tr.select_one(f"[data-v={k}]")) for k in ("surfer", "heats", "before", "after", "delta", "prior")]
        cells[2:4] = [c.replace("\u2212", "-") if c else c for c in cells[2:4]]
        lines.append("|".join(cells))
    out["movement"] = "\n".join(lines)
    return out


def load(src, param):
    if src.startswith("http"):
        req = urllib.request.Request(f"{src}/events/{param}", headers={"User-Agent": "wsl-analytics-verify"})
        with urllib.request.urlopen(req) as r:
            return r.read().decode("utf-8")
    return open(os.path.join(src, f"{param}.html"), encoding="utf-8").read()


def main():
    src = sys.argv[1]
    if "--dump" in sys.argv:
        i = sys.argv.index("--dump")
        print(canon(load(src, sys.argv[i + 1]))[sys.argv[i + 2]])
        return
    expected = [l.split() for l in open(os.path.join(HERE, "expected.tsv")) if l.strip()]
    total = ok = 0
    bad = []
    for row in expected:
        param, exp = row[0], dict(zip(SECTIONS, row[1:]))
        got = canon(load(src, param))
        for s in SECTIONS:
            total += 1
            md5 = hashlib.md5(got[s].encode("utf-8")).hexdigest()
            n = len(got[s].split("\n")) if got[s] else 0
            if md5 == exp[s]:
                ok += 1
            else:
                bad.append((param, s, n))
        print(param, " ".join(f"{s}:{'OK' if (param, s) not in {(b[0], b[1]) for b in bad} else 'MISMATCH'}" for s in SECTIONS),
              "| lines", {s: (len(got[s].split(chr(10))) if got[s] else 0) for s in SECTIONS})
    print(f"\n{ok} of {total} section hashes match")
    for b in bad:
        print("MISMATCH", b)
    sys.exit(0 if ok == total else 1)


main()
