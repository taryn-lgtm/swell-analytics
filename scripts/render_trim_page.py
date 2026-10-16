#!/usr/bin/env python3
"""
Render docs/trim_v1.html -- M2 item 6's outcome: a ranked Trim table and a
surfer's timeline, in a single self-contained page a human can open.

WHAT THIS IS NOT

Not a frontend. docs/CURRENT_MILESTONE.md is explicit: "A ranked table and one
timeline is not a frontend. M3 is Frontend V1... If M2 ends with a React route
rather than a queryable table and a chart a human can open, the milestone
boundary has moved." This is one static file with no build step and no route.

INPUT   data/trim_page_v1.json
OUTPUT  docs/trim_v1.html

REGENERATING THE INPUT

The JSON is produced by supabase/checks/trim_v1_page_data.sql. Until
supabase/seeds/trim_v1.sql is applied, that query recomputes the recursion
read-only from datum; after it is applied, switch the commented block at the
foot of that file to read the stored trim table instead. The two must agree --
that is itself a check on the apply.

ONE SOURCE OF TRUTH FOR EVERY TRIM VALUE

The JSON carries Trim twice: once as the last point of each surfer's series and
once in the ranked array. They are produced by different rounding paths -- the
ranked figures pass through numeric(9,6), which is what the database stores,
and the series points do not -- so two of seventy-three disagree in the fourth
decimal (Reef Heazlewood, Edgard Groggia). Rather than pick one and hand-edit
the other, this script renders EVERY figure from the series and asserts the
ranked array agrees within the double-rounding band. The page displays three
decimals, where the disagreement cannot appear at all, and where Trim is not
in any case meaningful to more places: the half-life it depends on is
identified only to "somewhere between 10 and 25 heats".
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = os.path.join(ROOT, 'data', 'trim_page_v1.json')
OUT = os.path.join(ROOT, 'docs', 'trim_v1.html')
TOL = 1.5e-4   # the numeric(9,6) double-rounding band


def load():
    d = json.load(open(SRC))
    series = {}
    for blk in d['points'].split('|'):
        sid, rest = blk.split('~')
        pts = []
        for i, p in enumerate(rest.split(';'), start=1):
            ev, rd, ht, tr = p.split(',')
            pts.append(dict(seq=i, ev=int(ev), rd=int(rd),
                            ht=float(ht), tr=float(tr)))
        series[int(sid)] = pts

    total = sum(len(v) for v in series.values())
    if total != d['model_run']['n_entries']:
        sys.exit("CONTROL FAILED - %d points, run claims %d entries."
                 % (total, d['model_run']['n_entries']))
    if len(series) != d['model_run']['n_surfers']:
        sys.exit("CONTROL FAILED - %d series, run claims %d surfers."
                 % (len(series), d['model_run']['n_surfers']))

    rows, bad = [], []
    for sid, name, trim, n_heats, pw in d['ranked']:
        pts = series.get(sid)
        if pts is None:
            bad.append("%s has no series" % name); continue
        if len(pts) != n_heats:
            bad.append("%s: %d points, ranked says %d heats"
                       % (name, len(pts), n_heats))
        if abs(pts[-1]['tr'] - trim) > TOL:
            bad.append("%s: series ends %.6f, ranked says %.6f"
                       % (name, pts[-1]['tr'], trim))
        rows.append(dict(id=sid, name=name, n=len(pts), pw=pw,
                         trim=pts[-1]['tr']))          # series is the source
    if bad:
        sys.exit("CONTROL FAILED - ranked array disagrees with the series:\n  "
                 + "\n  ".join(bad))

    rows.sort(key=lambda r: -r['trim'])
    return d, series, rows


def main():
    d, series, rows = load(); m = d['model_run']
    payload = json.dumps(dict(
        events=d['events'], rounds=d['rounds'], run=m,
        rows=rows,
        series={str(k): [[p['seq'], p['ev'], p['rd'], p['ht'], p['tr']]
                         for p in v] for k, v in series.items()}),
        separators=(',', ':'))

    html = HTML.replace('/*__DATA__*/null', payload)
    html = html.replace('@@GENERATED@@', d['generated'])
    html = html.replace('@@SOURCE@@', d['source'])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w').write(html)
    print("wrote %s - %d surfers, %d surfer-heats"
          % (os.path.relpath(OUT, ROOT), len(rows), m['n_entries']))


HTML = r"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trim V1 — WSL Analytics</title>
<style>
:root{
  color-scheme: light;
  --plane:#f9f9f7; --surface:#fcfcfb;
  --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,0.10);
  --pos:#2a78d6; --neg:#e34948; --mid:#f0efec;
  --warn-bg:#fdf6e6; --warn-ink:#52514e; --warn-edge:#eda100;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
    --plane:#0d0d0d; --surface:#1a1a19;
    --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,0.10);
    --pos:#3987e5; --neg:#e66767; --mid:#383835;
    --warn-bg:#241f12; --warn-ink:#c3c2b7; --warn-edge:#c98500;
  }
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --plane:#0d0d0d; --surface:#1a1a19;
  --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,0.10);
  --pos:#3987e5; --neg:#e66767; --mid:#383835;
  --warn-bg:#241f12; --warn-ink:#c3c2b7; --warn-edge:#c98500;
}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--ink);
  font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;}
.wrap{max-width:1040px;margin:0 auto;padding:32px 20px 72px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-0.01em}
h2{font-size:17px;margin:0 0 2px;letter-spacing:-0.005em}
.sub{color:var(--ink-2);margin:0 0 24px;max-width:64ch}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:20px;margin:0 0 20px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;
  background:var(--border);border:1px solid var(--border);border-radius:10px;
  overflow:hidden;margin:0 0 20px}
.tile{background:var(--surface);padding:14px 16px}
.tile .k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.tile .v{font-size:22px;margin-top:2px}
.tile .n{color:var(--ink-2);font-size:12px;margin-top:1px}
.note{background:var(--warn-bg);color:var(--warn-ink);
  border-left:3px solid var(--warn-edge);border-radius:0 8px 8px 0;
  padding:14px 16px;margin:0 0 20px;max-width:80ch}
.note b{color:var(--ink)}
.prov{color:var(--muted);font-size:12px;margin:0 0 20px;max-width:80ch}
.ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 14px}
label{color:var(--ink-2);font-size:13px}
select,button{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);
  border:1px solid var(--axis);border-radius:7px;padding:5px 9px}
button{cursor:pointer}
button[aria-pressed="true"]{background:var(--mid)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--muted);font-size:11px;font-weight:600;
  text-transform:uppercase;letter-spacing:.06em;padding:0 8px 7px;
  border-bottom:1px solid var(--axis)}
th.r,td.r{text-align:right}
td{padding:5px 8px;border-bottom:1px solid var(--grid)}
tbody tr:hover td{background:var(--mid)}
.rk{color:var(--muted);width:34px}
.bar{width:200px;padding-right:0}
.thin{color:var(--ink-2)}
svg{display:block;width:100%;height:auto;overflow:visible}
.tip{position:fixed;pointer-events:none;z-index:9;background:var(--surface);
  color:var(--ink);border:1px solid var(--border);border-radius:8px;
  padding:8px 10px;font-size:12px;line-height:1.45;max-width:250px;
  box-shadow:0 3px 14px rgba(0,0,0,.16);opacity:0;transition:opacity .1s}
.tip .h{font-weight:600;margin-bottom:3px}
.tip .row{display:flex;justify-content:space-between;gap:14px;color:var(--ink-2)}
.tip .row b{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}
.foot{color:var(--muted);font-size:12px;margin-top:26px;max-width:80ch}
.foot code{font-size:11.5px}
</style>
</head>
<body>
<div class="wrap">

<h1>Trim V1</h1>
<p class="sub">How far each surfer beats what Datum expects of the round they are
surfing, exponentially weighted so recent heats count more, accumulated heat by
heat. The unit is points per heat on the 0–20 scale.</p>

<div class="tiles" id="tiles"></div>

<div class="note">
  <b>Read the prior-weight column before reading the ranking.</b> Every surfer
  starts at 0 and the start never fully washes out: after <i>n</i> heats the
  prior still carries weight 0.9548<sup>n</sup> — half of it at fifteen heats.
  A surfer with four heats is more than 80% prior, so their Trim says almost
  nothing about them. <b>And the decay itself earns nothing measurable:</b> an
  undecayed mean of the same residuals, shrunk toward zero by the same amount,
  scores 2.9125 against Trim's 2.9101 — paired, t&nbsp;=&nbsp;0.537 over 1,770
  entries. Nearly all of Trim's skill is the prior, not the recency weighting.
</div>

<div class="card">
  <h2>Ranked table</h2>
  <p class="sub" style="margin-bottom:14px">Latest Trim per surfer, the view
  <code>v_trim_current</code> returns.</p>
  <div class="ctl">
    <label for="minh">Minimum heats</label>
    <select id="minh">
      <option value="16" selected>16 — the surfer's record outweighs the prior</option>
      <option value="20">20</option>
      <option value="40">40</option>
      <option value="1">1 — every surfer, including two-heat wildcards</option>
    </select>
    <span class="thin" id="count"></span>
  </div>
  <div class="scroll"><table id="rank">
    <thead><tr><th class="rk">#</th><th>Surfer</th><th class="r">Trim</th>
      <th class="bar"></th><th class="r">Heats</th><th class="r">Prior weight</th></tr></thead>
    <tbody></tbody>
  </table></div>
</div>

<div class="card">
  <h2>One surfer's timeline</h2>
  <p class="sub" style="margin-bottom:14px">Trim after every heat, in career
  order. The dashed line is the starting prior of zero — average for the rounds
  surfed.</p>
  <div class="ctl">
    <label for="who">Surfer</label>
    <select id="who"></select>
    <button id="tbl" aria-pressed="false">Table view</button>
  </div>
  <div id="chart"></div>
  <div id="tv" hidden class="scroll"></div>
</div>

<p class="prov" id="prov"></p>

<div class="foot">
  Regenerate with <code>python3 scripts/render_trim_page.py</code> from
  <code>data/trim_page_v1.json</code>. Every figure on this page traces to a
  row: the ranked values are the last point of each series, and the series are
  the recursion in <code>supabase/seeds/trim_v1.sql</code>. Nine of 1,852 heat
  entries carry no published heat total, so they have no Datum row and no Trim
  row — an unmeasured heat, not a scoreless one.
</div>

</div>
<div class="tip" id="tip" role="status" aria-live="polite"></div>

<script>
const D = /*__DATA__*/null;
const $ = s => document.querySelector(s);
const fmt = (v,n=3) => (v>=0?'+':'−') + Math.abs(v).toFixed(n);
const evName = i => D.events[i][0] + ' ' + D.events[i][2];
const rdName = i => D.rounds[i][0];
const rdExp  = i => D.rounds[i][1];
const tip = $('#tip');

/* ---------- stat tiles ---------- */
(() => {
  const r = D.run;
  const t = [
    ['Surfers', D.rows.length, 'with at least one scored heat'],
    ['Surfer-heats', r.n_entries.toLocaleString('en-GB'), 'across 22 events, 2024–25'],
    ['Half-life', r.half_life_heats + ' heats', 'flat basin 10–25; not identified'],
    ['Walk-forward RMSE', r.rmse_walkforward.toFixed(4),
     'against ' + r.rmse_predict_zero.toFixed(4) + ' predicting zero, over ' +
     r.n_scored.toLocaleString('en-GB')],
  ];
  $('#tiles').innerHTML = t.map(([k,v,n]) =>
    `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>
     <div class="n">${n}</div></div>`).join('');
  $('#prov').textContent =
    'Generated @@GENERATED@@ — @@SOURCE@@. Datum run ' + r.datum_run +
    ', alpha ' + r.alpha + ', prior ' + r.prior + '. ' +
    'Trim beats predicting zero out-of-sample; it does not beat the shrunk ' +
    'undecayed mean (' + r.rmse_shrunk_flat_mean.toFixed(4) + ', paired t = ' +
    r.paired_t_vs_shrunk + ').';
})();

/* ---------- ranked table ---------- */
const maxAbs = Math.max(...D.rows.map(r => Math.abs(r.trim)));
function drawRank(){
  const min = +$('#minh').value;
  const rows = D.rows.filter(r => r.n >= min);
  $('#count').textContent = rows.length + ' of ' + D.rows.length + ' surfers';
  $('#rank tbody').innerHTML = rows.map((r,i) => {
    const w = Math.abs(r.trim)/maxAbs*50, pos = r.trim >= 0;
    const c = pos ? 'var(--pos)' : 'var(--neg)';
    // diverging bar from a centre baseline; 4px rounded outer end, 2px gap at zero
    const bar = `<svg viewBox="0 0 100 14" preserveAspectRatio="none" style="height:14px">
      <rect x="49.8" y="0" width="0.4" height="14" fill="var(--axis)"/>
      <rect x="${pos?50.4:50-w}" y="3" width="${Math.max(w-0.4,0.6)}" height="8"
            rx="2.5" fill="${c}"/></svg>`;
    return `<tr><td class="rk">${i+1}</td><td>${r.name}</td>
      <td class="r">${fmt(r.trim)}</td>
      <td class="bar">${bar}</td>
      <td class="r thin">${r.n}</td>
      <td class="r thin">${(r.pw*100).toFixed(0)}%</td></tr>`;
  }).join('');
}
$('#minh').addEventListener('change', drawRank);
drawRank();

/* ---------- timeline ---------- */
const sel = $('#who');
sel.innerHTML = D.rows.slice().sort((a,b)=>b.n-a.n)
  .map(r => `<option value="${r.id}">${r.name} — ${r.n} heats</option>`).join('');
sel.value = D.rows.slice().sort((a,b)=>b.n-a.n)[0].id;

function drawChart(){
  const id = sel.value, pts = D.series[id];
  const row = D.rows.find(r => r.id == id);
  const W=980, H=300, RH=96, L=52, R=16, T=18, B=26;
  const iw = W-L-R;
  const x = i => L + (pts.length===1 ? iw/2 : i/(pts.length-1)*iw);

  const tv = pts.map(p=>p[4]);
  let lo = Math.min(0, ...tv), hi = Math.max(0, ...tv);
  const pad = (hi-lo)*0.16 || 0.2; lo-=pad; hi+=pad;
  const y = v => T + (hi-v)/(hi-lo)*(H-T-B);

  // residual panel shares x, has its OWN y - a second chart, never a second axis
  const rv = pts.map(p => p[3] - rdExp(p[2]));
  const rm = Math.max(4, Math.ceil(Math.max(...rv.map(Math.abs))));  // exact, so the axis label is not a rounded-up claim
  const ry = v => H + 30 + (rm-v)/(2*rm)*RH;

  const ticks = [];
  for(let k=-4;k<=4;k++){ const v=k*0.5; if(v>=lo&&v<=hi) ticks.push(v); }

  // season boundary: first index whose event belongs to the later season
  let sb = -1;
  for(let i=1;i<pts.length;i++)
    if(D.events[pts[i][1]][0] !== D.events[pts[i-1][1]][0]){ sb=i; break; }

  const line = pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p[4]).toFixed(1)).join(' ');
  const area = line + ` L ${x(pts.length-1).toFixed(1)} ${y(0).toFixed(1)}`
                    + ` L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  $('#chart').innerHTML = `
  <svg viewBox="0 0 ${W} ${H+30+RH+22}" role="img"
       aria-label="Trim after each heat for ${row.name}, ${pts.length} heats">
    <defs><clipPath id="cp"><rect x="${L}" y="${T}" width="${iw}" height="${H-T-B}"/></clipPath></defs>
    ${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"
        stroke="var(--grid)" stroke-width="1"/>
      <text x="${L-9}" y="${y(v)+4}" text-anchor="end" fill="var(--muted)"
        font-size="11">${v===0?'0':fmt(v,1)}</text>`).join('')}
    <line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)"
      stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="${W-R}" y="${y(0)-7}" text-anchor="end" fill="var(--muted)"
      font-size="11">prior · 0</text>
    ${sb>0?`<line x1="${x(sb)}" x2="${x(sb)}" y1="${T}" y2="${H-B}"
      stroke="var(--axis)" stroke-width="1"/>
      <text x="${x(sb)+5}" y="${T+11}" fill="var(--muted)" font-size="11">${
        D.events[pts[sb][1]][0]}</text>`:''}
    <g clip-path="url(#cp)">
      <path d="${area}" fill="var(--pos)" opacity="0.07"/>
      <path d="${line}" fill="none" stroke="var(--pos)" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>
    </g>
    <circle cx="${x(pts.length-1)}" cy="${y(tv[tv.length-1])}" r="4.5"
      fill="var(--pos)" stroke="var(--surface)" stroke-width="2"/>
    <text x="${x(pts.length-1)-8}" y="${y(tv[tv.length-1])-9}" text-anchor="end"
      fill="var(--ink)" font-size="12">${fmt(row.trim)}</text>
    <text x="${L}" y="${H-B+18}" fill="var(--muted)" font-size="11">heat 1</text>
    <text x="${W-R}" y="${H-B+18}" text-anchor="end" fill="var(--muted)"
      font-size="11">heat ${pts.length}</text>

    <text x="${L}" y="${H+18}" fill="var(--ink-2)" font-size="12">Deviation from Datum, each heat</text>
    <line x1="${L}" x2="${W-R}" y1="${ry(0)}" y2="${ry(0)}" stroke="var(--axis)" stroke-width="1"/>
    <text x="${L-9}" y="${ry(0)+4}" text-anchor="end" fill="var(--muted)" font-size="11">0</text>
    <text x="${L-9}" y="${ry(rm)+4}" text-anchor="end" fill="var(--muted)" font-size="11">${fmt(rm,0)}</text>
    <text x="${L-9}" y="${ry(-rm)+4}" text-anchor="end" fill="var(--muted)" font-size="11">${fmt(-rm,0)}</text>
    ${pts.map((p,i)=>{const v=rv[i];const c=v>=0?'var(--pos)':'var(--neg)';
      return `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}"
        y1="${ry(0).toFixed(1)}" y2="${ry(v).toFixed(1)}" stroke="${c}"
        stroke-width="2" stroke-linecap="round" opacity="0.62"/>`}).join('')}

    <line id="cross" x1="0" x2="0" y1="${T}" y2="${H+30+RH}" stroke="var(--axis)"
      stroke-width="1" opacity="0"/>
    <circle id="dot" r="5" fill="var(--pos)" stroke="var(--surface)"
      stroke-width="2" opacity="0"/>
    <rect id="hit" x="${L}" y="${T}" width="${iw}" height="${H+30+RH-T}"
      fill="transparent" style="cursor:crosshair"/>
  </svg>`;

  const svg=$('#chart svg'), hit=svg.querySelector('#hit'),
        cross=svg.querySelector('#cross'), dot=svg.querySelector('#dot');
  const idxAt = e => {
    const b=svg.getBoundingClientRect(), sx=(e.clientX-b.left)/b.width*W;
    let i=Math.round((sx-L)/(iw||1)*(pts.length-1));
    return Math.max(0, Math.min(pts.length-1, i));
  };
  const show = e => {
    const i=idxAt(e), p=pts[i], exp=rdExp(p[2]), res=p[3]-exp;
    cross.setAttribute('x1',x(i)); cross.setAttribute('x2',x(i));
    cross.setAttribute('opacity','1');
    dot.setAttribute('cx',x(i)); dot.setAttribute('cy',y(p[4]));
    dot.setAttribute('opacity','1');
    tip.innerHTML =
      `<div class="h">Heat ${p[0]} · ${rdName(p[2])}</div>
       <div class="row"><span>${evName(p[1])}</span></div>
       <div class="row"><span>Heat total</span><b>${p[3].toFixed(2)}</b></div>
       <div class="row"><span>Datum expected</span><b>${exp.toFixed(2)}</b></div>
       <div class="row"><span>Deviation</span><b>${fmt(res,2)}</b></div>
       <div class="row"><span>Trim after</span><b>${fmt(p[4])}</b></div>`;
    tip.style.opacity='1';
    const tw=tip.offsetWidth, th=tip.offsetHeight;
    tip.style.left=Math.min(window.innerWidth-tw-10, e.clientX+14)+'px';
    tip.style.top=Math.max(8, e.clientY-th-12)+'px';
  };
  hit.addEventListener('mousemove', show);
  hit.addEventListener('mouseleave', ()=>{
    tip.style.opacity='0'; cross.setAttribute('opacity','0');
    dot.setAttribute('opacity','0');
  });

  $('#tv').innerHTML = `<table><thead><tr><th>Heat</th><th>Event</th><th>Round</th>
    <th class="r">Total</th><th class="r">Datum</th><th class="r">Deviation</th>
    <th class="r">Trim after</th></tr></thead><tbody>` +
    pts.map((p,i)=>`<tr><td class="rk">${p[0]}</td><td>${evName(p[1])}</td>
      <td class="thin">${rdName(p[2])}</td><td class="r">${p[3].toFixed(2)}</td>
      <td class="r thin">${rdExp(p[2]).toFixed(2)}</td>
      <td class="r">${fmt(rv[i],2)}</td><td class="r">${fmt(p[4])}</td></tr>`).join('') +
    `</tbody></table>`;
}
sel.addEventListener('change', drawChart);
$('#tbl').addEventListener('click', e => {
  const on = e.currentTarget.getAttribute('aria-pressed') === 'true';
  e.currentTarget.setAttribute('aria-pressed', String(!on));
  $('#tv').hidden = on; $('#chart').hidden = !on;
});
drawChart();
</script>
</body>
</html>
"""

if __name__ == '__main__':
    main()
