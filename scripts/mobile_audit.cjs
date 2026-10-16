// Mobile check — M3 item 6. docs/findings/2026-09-30_mobile_audit.md holds the definition this
// enforces, signed off by Taryn on 30 September 2026.
//
// Renders every route in a real Playwright viewport and records window.innerWidth, so the width
// is proven rather than assumed (decision 66: resize_window reported success while the viewport
// stayed at 1400). Exits 1 if any check fails at a gating width.
//
//   BASE=http://localhost:3000 node scripts/mobile_audit.cjs            # gate at 375 and 768
//   BASE=… OUT=/tmp/shots SHOTS=1 node scripts/mobile_audit.cjs        # plus full-page screenshots
//
// Checks, numbered as in the definition:
//   1 no page-level horizontal scroll
//   2 no data column display:none
//   3 a Trim figure in view has its prior weight in view (at scroll 0)
//   4 every box that scrolls sideways shows its cue, and a scrolling table pins its first column
//   5 tap targets at least 24x24 CSS px, links inside running prose excepted
//   6 no rendered text under 11px (SVG text at its rendered scale), aria-hidden excepted
//   7 the footer states the seasons covered

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'https://wsl-analytics.vercel.app';
const OUT = process.env.OUT || '.';
const SHOTS = process.env.SHOTS === '1';
const ROUTES = ['/', '/rankings', '/rankings?season=2024&format=cumulative', '/surfers/yago-dora', '/surfers/alan-cleland', '/events/lexus-pipe-pro-2024', '/about', '/compare'];
const GATING = [375, 768];
const CONTROL = [1280];

function measure() {
  const vw = window.innerWidth;
  const de = document.documentElement;
  const fails = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  const name = (el) => (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
  const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const hiddenFromAT = (el) => !!el.closest('[aria-hidden="true"]');

  // 1
  if (de.scrollWidth > vw) fails[1].push(`page is ${de.scrollWidth}px wide in ${vw}`);

  // 2
  for (const cell of document.querySelectorAll('table th, table td')) {
    if (getComputedStyle(cell).display === 'none') fails[2].push(`hidden cell "${name(cell) || '(empty)'}"`);
  }

  // 3 — Trim and its prior weight travel together
  for (const t of document.querySelectorAll('table')) {
    const box = (t.closest('[data-scroller]') || t.parentElement).getBoundingClientRect();
    const ths = [...t.querySelectorAll('thead th')];
    const label = (th) => th.innerText.trim().replace(/\s+/g, ' ').toUpperCase();
    const inView = (th) => { const b = th.getBoundingClientRect(); return b.left >= box.left - 1 && b.right <= box.right + 1; };
    const partly = (th) => th.getBoundingClientRect().left < box.right - 2;
    const trim = ths.find((th) => /^TRIM/.test(label(th)) && !/PRIOR/.test(label(th)));
    const prior = ths.find((th) => /PRIOR/.test(label(th)) && th !== trim);
    if (trim && prior && partly(trim) && !inView(prior)) fails[3].push(`"${label(trim)}" in view, "${label(prior)}" is not`);
  }

  // 4
  for (const el of document.querySelectorAll('body *')) {
    const ox = getComputedStyle(el).overflowX;
    if (ox !== 'auto' && ox !== 'scroll') continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (!el.hasAttribute('data-scroller')) { fails[4].push(`scrolls without a ScrollBox: ${name(el)}`); continue; }
    const cue = el.parentElement.querySelector(':scope > [data-scroll-cue]');
    if (!cue || cue.dataset.scrollCue !== 'visible' || getComputedStyle(cue).visibility === 'hidden') fails[4].push(`no visible cue: ${el.getAttribute('aria-label')}`);
    const th = el.querySelector('table thead th');
    if (th && getComputedStyle(th).position !== 'sticky') fails[4].push(`first column not pinned: ${el.getAttribute('aria-label')}`);
  }

  // 5
  for (const el of document.querySelectorAll('a, button, select, input, summary, [role=button]')) {
    if (!shown(el) || hiddenFromAT(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width >= 24 && b.height >= 24) continue;
    const parent = el.parentElement;
    // WCAG 2.5.8's inline exception: a link set in running text, i.e. whose parent also holds
    // words of its own (separators such as · and — do not count).
    const inlineProse = el.tagName === 'A' && parent &&
      [...parent.childNodes].some((n) => n.nodeType === 3 && /[A-Za-z0-9]{2,}/.test(n.textContent));
    if (inlineProse) continue;
    fails[5].push(`"${name(el)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
  }

  // 6
  const small = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!shown(el) || hiddenFromAT(el)) continue;
    let size = parseFloat(getComputedStyle(el).fontSize);
    const svg = el.closest('svg');
    if (svg && svg.viewBox.baseVal && svg.viewBox.baseVal.width) size *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    if (size < 10.95) { const k = `${size.toFixed(1)}px ${svg ? 'svg ' : ''}"${el.textContent.trim().slice(0, 30)}"`; small.set(k, (small.get(k) || 0) + 1); }
  }
  for (const [k, n] of small) fails[6].push(n > 1 ? `${k} ×${n}` : k);

  // 7
  const footer = document.querySelector('footer');
  if (!footer || !/seasons only/.test(footer.innerText) || !shown(footer)) fails[7].push('footer coverage statement missing');

  return { innerWidth: vw, fails };
}

(async () => {
  if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  for (const w of [...GATING, ...CONTROL]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 812 }, deviceScaleFactor: 2, isMobile: w < 768, hasTouch: w < 1024 });
    const page = await ctx.newPage();
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: 'networkidle' });
      const m = await page.evaluate(measure);
      if (m.innerWidth !== w) throw new Error(`viewport is ${m.innerWidth}, asked for ${w}: the instrument is wrong, not the page`);
      if (SHOTS) await page.screenshot({ path: path.join(OUT, `${w}${r.replace(/[\/?=&]/g, '_')}.png`), fullPage: true });
      results.push({ width: w, route: r, gating: GATING.includes(w), fails: m.fails });
    }
    await ctx.close();
  }
  await browser.close();

  let failed = 0;
  for (const res of results) {
    const bad = Object.entries(res.fails).filter(([, v]) => v.length);
    const tag = bad.length ? (res.gating ? 'FAIL' : 'warn') : 'pass';
    if (bad.length && res.gating) failed++;
    console.log(`${tag}  ${String(res.width).padEnd(4)} ${res.route}`);
    for (const [k, v] of bad) console.log(`        ${k}: ${v.slice(0, 6).join('; ')}${v.length > 6 ? `; … ${v.length - 6} more` : ''}`);
  }
  if (SHOTS) fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(results, null, 2));
  console.log(failed ? `\n${failed} gating page(s) fail.` : `\nAll gating pages pass (${GATING.join(', ')} px, ${ROUTES.length} routes).`);
  process.exit(failed ? 1 : 0);
})();
