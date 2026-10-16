"""Reduce rendered /surfers/<slug> HTML to canonical lines per section and
compare md5s against the independent SQL (verify_surfers.sql -> expected.tsv).

Usage:
  python3 scripts/verify_surfers/verify_surfers.py <html_dir> [expected.tsv]
  python3 scripts/verify_surfers/verify_surfers.py <html_dir> --dump <slug> <section>

  html_dir holds <slug>.html, one per surfer, fetched from the live site.
  expected.tsv: slug, section, line count, md5 -- the output of
  verify_surfers.sql run against v2. A snapshot; regenerate when data changes.

Sections: header, log, timeline, splits, prov. Modelled on
scripts/verify_events/: the SQL never goes through src/lib/queries/surfer.ts.
"""
import hashlib, os, re, sys
from bs4 import BeautifulSoup

SECTIONS = ["header", "log", "timeline", "splits", "prov"]


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def t(el):
    return norm(el.get_text("")) if el is not None else ""


def canon(html):
    soup = BeautifulSoup(html, "html.parser")
    out = {}

    # ---- header -------------------------------------------------------
    h = [f"name={t(soup.find('h1'))}"]
    # The header block is the nearest ancestor holding the stat list. Found by
    # structure rather than by a class name, so a restyle does not break it
    # (the 16 Oct 2026 Swell header dropped the old `border-b-2` hook).
    head = soup.find("h1").find_parent(lambda tag: tag.name == "div" and tag.find("dl") is not None)
    seasons = [t(x) for x in head.select("p span.figures") if t(x).startswith("CT ")]
    h.append(f"seasons={seasons[0] if seasons else ''}")
    titles = re.findall(r"(\d{4}) World Champion", head.get_text(" "))
    h.append(f"titles={','.join(sorted(set(titles)))}")
    for stat in head.select("dl > div"):
        col = stat.find("div")
        spans = col.find_all("span", recursive=False)
        label = t(spans[0])
        inner = spans[1].find_all("span", recursive=False)
        value = t(inner[0])
        unit = t(inner[1]) if len(inner) > 1 else ""
        h.append(f"{label}={value}|{unit}")
    note = head.find("p", class_="border-l-2")
    if note is not None:
        h.append("below=" + ",".join(t(x) for x in note.select("span.figures")))
    for h2 in soup.find_all("h2"):
        if re.match(r"^\d+ heats across \d+ events?$", t(h2)):
            h.append(f"logtitle={t(h2)}")
    out["header"] = h

    # ---- heat log -----------------------------------------------------
    lines = []
    cap = soup.find("caption", string=re.compile(r"^Every heat this surfer surfed"))
    if cap is not None:
        for tr in cap.find_parent("table").select("tbody tr"):
            td = tr.find_all(["td", "th"], recursive=False)
            ev = td[1]
            top, sub = ev.find("span").find_all("span", recursive=False)[:2]
            season = t(top.find("span", class_="figures"))
            event = t(top.find("a"))
            finals = "F" if re.search(r"Finals$", t(top)) and t(top) != f"{season} {event}" else ""
            res = td[5].find_all("span", recursive=False)
            if res and res[0].find("span"):
                rr = res[0].find_all("span", recursive=False)
                resid, exp = t(rr[0]), t(rr[1])
            else:
                resid, exp = t(td[5]), ""
            tr_ = td[6].find_all("span", recursive=False)
            if tr_ and tr_[0].find("span"):
                tt = tr_[0].find_all("span", recursive=False)
                trim, pw = t(tt[0]), t(tt[1])
            else:
                trim, pw = t(td[6]), ""
            lines.append("|".join([
                t(td[0]), season, event, finals, t(sub), t(td[2]), t(td[3]), t(td[4]),
                resid, exp, trim, pw, t(td[7]), t(td[8]),
            ]))
    out["log"] = lines

    # ---- timeline -----------------------------------------------------
    lines = []
    aria = soup.find("svg", attrs={"aria-label": re.compile(r"^Trim after each of")})
    if aria is not None:
        lines.append("aria=" + norm(aria["aria-label"]))
        band = [norm(x.get_text()) for x in aria.find_all("text") if "prior is" in x.get_text()]
        lines.append("band=" + (band[0] if band else ""))
        for c in aria.find_all("title"):
            lines.append("pt=" + " / ".join(norm(x) for x in c.get_text().split("\n")))
        fig = aria.find_parent("figure")
        ps = fig.find("figcaption").find_all("p")
        lines.append("extremes=" + t(ps[1]))
    out["timeline"] = lines

    # ---- condition splits ---------------------------------------------
    lines = []
    for title in ("By published wave height", "By published wind"):
        h3 = soup.find("h3", string=title)
        if h3 is None:
            lines.append(f"{title}|absent")
            continue
        table = h3.find_parent("div").find("table")
        if table is None:
            lines.append(f"{title}|none")
            continue
        for tr in table.select("tbody tr"):
            th = tr.find("th")
            tds = tr.find_all("td")
            heats = t(tds[0].find("span").find("span"))
            lines.append("|".join([title, t(th), heats, t(tds[1]), t(tds[2]), t(tds[3])]))
    nots = soup.find(string=re.compile("What these are not"))
    if nots is not None:
        p = nots.find_parent("p")
        figs = [t(x) for x in p.select("span.figures")]
        lines.append("coverage=" + ",".join(figs))
    out["splits"] = lines

    # ---- provenance panels --------------------------------------------
    lines = []
    for lab in soup.find_all("span", string="Computed over"):
        panel = lab.find_parent("div")
        lines.append("p=" + ",".join(t(x) for x in panel.select("span.figures")))
    out["prov"] = lines
    return out


def md5(lines):
    return hashlib.md5("\n".join(lines).encode("utf-8")).hexdigest()


def main():
    d = sys.argv[1]
    if len(sys.argv) > 2 and sys.argv[2] == "--dump":
        c = canon(open(os.path.join(d, f"{sys.argv[3]}.html"), encoding="utf-8").read())
        print("\n".join(c[sys.argv[4]]))
        return
    exp_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "expected.tsv")
    expected = {}
    for row in open(exp_path, encoding="utf-8"):
        if not row.strip():
            continue
        slug, sec, n, h = row.rstrip("\n").split("\t")
        expected[(slug, sec)] = (int(n), h)
    slugs = sorted({k[0] for k in expected})
    ok = bad = 0
    nlines = nfig = 0
    for slug in slugs:
        c = canon(open(os.path.join(d, f"{slug}.html"), encoding="utf-8").read())
        for sec in SECTIONS:
            got = md5(c[sec])
            n, want = expected[(slug, sec)]
            nlines += len(c[sec])
            nfig += sum(len(re.findall(r"[-+−±]?\d+(?:[.,]\d+)*%?", ln)) for ln in c[sec])
            if got.startswith(want) and len(c[sec]) == n:
                ok += 1
            else:
                bad += 1
                print(f"MISMATCH {slug} {sec}: rendered {len(c[sec])} lines {got}, sql {n} lines {want}")
    print(f"{ok} of {ok + bad} section checks match over {len(slugs)} pages; {nlines} canonical lines, ~{nfig} numeric tokens")
    sys.exit(0 if bad == 0 else 1)


if __name__ == "__main__":
    main()
