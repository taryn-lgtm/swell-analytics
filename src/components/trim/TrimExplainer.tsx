"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

/*
 * The /trim explainer, ported from the Swell concept. All figures arrive as
 * props from src/app/trim/page.tsx; nothing about surfing is typed here
 * except the round names the charts order by.
 */

export interface ExplainerHeat {
  year: number;
  event: string;
  round: string;
  /** Datum: the expected heat total for this round. */
  datum: number;
  posted: number;
  /** posted - datum, as stored in trim.residual. */
  gap: number;
  /** Trim after this heat. */
  trim: number;
}

export interface ScatterRow {
  name: string;
  points: number;
  trim: number;
}

const ORDER = [
  "Opening Round",
  "Qualifying Round",
  "Elimination Round",
  "Round of 32",
  "Round of 16",
  "Quarterfinals",
  "Semifinals",
  "Final",
];
const ABBR: Record<string, string> = {
  "Opening Round": "OR",
  "Qualifying Round": "QR",
  "Elimination Round": "ER",
  "Round of 32": "R32",
  "Round of 16": "R16",
  Quarterfinals: "QF",
  Semifinals: "SF",
  Final: "F",
};
const SHORT: Record<string, string> = {
  "Opening Round": "Opening",
  "Qualifying Round": "Qualifying",
  "Elimination Round": "Elimination",
  "Round of 32": "R32",
  "Round of 16": "R16",
  Quarterfinals: "QF",
  Semifinals: "SF",
  Final: "Final",
};

const ABOVE = "var(--above)";
const BELOW = "var(--below)";
/** SVG coordinates to 0.01: Math.pow differs in the last bit between server and browser, which breaks hydration. */
const px = (v: number) => Math.round(v * 100) / 100;
const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(3);
const s2 = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
const ord = (n: number) => {
  const t = n % 100;
  const suffix = t > 10 && t < 14 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};
const surname = (name: string) => name.split(" ").slice(-1)[0];

const RM_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeRM(cb: () => void): () => void {
  try {
    const m = window.matchMedia(RM_QUERY);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  } catch {
    return () => {};
  }
}
function readRM(): boolean {
  try {
    return window.matchMedia(RM_QUERY).matches;
  } catch {
    return true;
  }
}
/** The server renders the finished chart; the client animates only when motion is allowed. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeRM, readRM, () => true);
}

/* ------------------------------------------------------------------ layout */

function Section({
  k,
  title,
  alt = false,
  children,
}: {
  k: string;
  title: string;
  alt?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`border-t border-hairline py-16 sm:py-20 ${alt ? "bg-paper-raised" : ""}`}>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.7fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-caption uppercase tracking-[0.14em] text-fg-subtle">{k}</p>
          <h2 className="mt-3 text-balance font-display text-[clamp(1.7rem,3.2vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.025em]">
            {title}
          </h2>
        </div>
        <div className="min-w-0 space-y-6 text-[1.05rem] leading-relaxed text-fg-muted">{children}</div>
      </div>
    </section>
  );
}

function Maths({ children }: { children: React.ReactNode }) {
  return (
    <details className="group border-t border-hairline pt-4">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-body-sm font-semibold text-fg">
        <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
        The maths
      </summary>
      <div className="mt-2 space-y-3 text-body-sm text-fg-muted [&_code]:bg-paper-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-fg">
        {children}
      </div>
    </details>
  );
}

const Up = ({ children }: { children: React.ReactNode }) => <b className="text-above">{children}</b>;
const Down = ({ children }: { children: React.ReactNode }) => <b className="text-below">{children}</b>;
const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-fg">{children}</b>;

/* ------------------------------------------------------------- hero chart */

function Stairs({
  heats,
  datum,
  rounds,
  shown,
  narrow,
}: {
  heats: ExplainerHeat[];
  datum: Record<string, number>;
  rounds: string[];
  shown: number;
  narrow: boolean;
}) {
  const W = narrow ? 480 : 900;
  const H = 420;
  const L = 46;
  const R = 12;
  const T = 16;
  const Bm = 58;
  const bw = (W - L - R) / rounds.length;
  const y = (v: number) => px(T + (20 - v) * ((H - T - Bm) / 20));
  const fs = narrow ? 17 : 12;

  let path = "";
  rounds.forEach((r, i) => {
    path += `${i ? "L" : "M"}${L + i * bw},${y(datum[r])} L${L + (i + 1) * bw},${y(datum[r])}`;
  });

  const perRound = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const h of heats) perRound.set(h.round, (perRound.get(h.round) ?? 0) + 1);
  const dots = heats.map((h, i) => {
    const k = (counts.get(h.round) ?? 0) + 1;
    counts.set(h.round, k);
    const n = perRound.get(h.round) ?? 1;
    const x = px(L + rounds.indexOf(h.round) * bw + bw * (0.12 + (0.76 * (k - 0.5)) / n));
    return { h, x, i };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`block h-auto w-full ${narrow ? "sm:hidden" : "max-sm:hidden"}`}
      role="img"
      aria-label="Heat totals plotted against Datum's expected score for each round, which rises as an event goes on"
    >
      {[0, 5, 10, 15, 20].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={fs} fill="var(--fg-subtle)">
            {v}
          </text>
        </g>
      ))}
      {rounds.map((r, i) => (
        <text key={r} x={L + i * bw + bw / 2} y={H - Bm + 22} textAnchor="middle" fontSize={fs} fill="var(--fg-subtle)">
          {narrow ? ABBR[r] : SHORT[r]}
        </text>
      ))}
      <text x={W - R} y={y(datum.Final ?? datum[rounds[rounds.length - 1]]) - 10} textAnchor="end" fontSize={fs} fill="var(--fg)">
        Datum
      </text>
      {dots.map(({ h, x, i }) => {
        const col = h.gap >= 0 ? ABOVE : BELOW;
        const on = i < shown;
        return (
          <g key={i} opacity={on ? 1 : 0} style={{ transition: "opacity 200ms" }}>
            <line x1={x} x2={x} y1={y(h.datum)} y2={y(h.posted)} stroke={col} strokeWidth={1.2} opacity={0.55} />
            <circle cx={x} cy={y(h.posted)} r={narrow ? 5 : 4.2} fill={col}>
              <title>{`${h.event} ${h.year}, ${h.round}: ${f2(h.posted)} against Datum ${f2(h.datum)} (${s2(h.gap)})`}</title>
            </circle>
          </g>
        );
      })}
      <path d={path} fill="none" stroke="var(--fg)" strokeWidth={2.2} />
    </svg>
  );
}

function Gauge({ value }: { value: number }) {
  const lo = -1;
  const hi = 2;
  const pos = (v: number) => ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * 100;
  const a = pos(Math.max(value, 0));
  const b = pos(Math.min(value, 0));
  const up = value >= 0;
  return (
    <div className="grid items-center gap-4 border-t border-hairline pt-4 max-sm:grid-cols-[auto_56px_auto] max-sm:justify-between sm:grid-rows-[auto_1fr_auto] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
      <small className="text-caption text-fg-subtle">Trim</small>
      <div className="relative min-h-[120px] bg-paper-sunken sm:min-h-[240px]">
        <div
          className="absolute inset-x-0"
          style={{
            top: `${a}%`,
            height: `${b - a}%`,
            background: up
              ? "linear-gradient(var(--above), color-mix(in srgb, var(--above) 25%, transparent))"
              : "linear-gradient(color-mix(in srgb, var(--below) 25%, transparent), var(--below))",
          }}
        />
        <div className="absolute -inset-x-1.5 h-px bg-fg-subtle" style={{ top: `${pos(0)}%` }} />
      </div>
      <b
        className="figures font-serif text-[clamp(2rem,4vw,3.2rem)] font-medium italic leading-none"
        style={{ color: up ? ABOVE : BELOW, fontFamily: "var(--font-serif)" }}
      >
        {f3(value)}
      </b>
    </div>
  );
}

/* ------------------------------------------------------------- the page */

export default function TrimExplainer({
  surferName,
  heats,
  alpha,
  scatter,
  scatterSeason,
}: {
  surferName: string;
  heats: ExplainerHeat[];
  alpha: number;
  scatter: ScatterRow[];
  scatterSeason: number;
}) {
  const N = heats.length;
  const trimNow = N ? heats[N - 1].trim : 0;
  const last = surname(surferName);
  const reduced = useReducedMotion();

  const datum = useMemo(() => {
    const d: Record<string, number> = {};
    for (const h of heats) if (ORDER.includes(h.round)) d[h.round] = h.datum;
    return d;
  }, [heats]);
  const rounds = ORDER.filter((r) => datum[r] != null);
  const chartHeats = heats.filter((h) => datum[h.round] != null);

  // Hero reveal: heats land in order and the gauge follows. Static when motion is reduced.
  const [shown, setShown] = useState(chartHeats.length);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = performance.now() + 400;
    const step = (t: number) => {
      const n = Math.max(0, Math.min(chartHeats.length, Math.floor(((t - start) / 4200) * chartHeats.length)));
      setShown(n);
      if (n < chartHeats.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced, chartHeats.length]);
  const visible = reduced ? chartHeats.length : shown;
  const gaugeValue = visible >= chartHeats.length ? trimNow : visible > 0 ? chartHeats[visible - 1].trim : 0;

  // 1: two near-equal totals, one strong for its round and one short.
  const pair = useMemo(() => {
    const near = heats.filter((h) => h.posted >= 13.9 && h.posted <= 14.6);
    if (near.length < 2) return null;
    const a = near.reduce((x, h) => (h.gap > x.gap ? h : x));
    const b = near.reduce((x, h) => (h.gap < x.gap ? h : x));
    return a === b ? null : { a, b };
  }, [heats]);

  // 3: try it.
  const [tRound, setTRound] = useState(rounds.includes("Quarterfinals") ? "Quarterfinals" : rounds[0]);
  const [tScore, setTScore] = useState("15.00");
  const tDatum = datum[tRound] ?? 0;
  const tVal = Math.max(0, Math.min(20, Number(tScore) || 0));
  const tGap = tVal - tDatum;
  const tAfter = alpha * tGap + (1 - alpha) * trimNow;
  const above = heats.filter((h) => h.gap > 0).length;

  // 4: decay.
  const half = Math.log(0.5) / Math.log(1 - alpha);
  const priorWeight = Math.pow(1 - alpha, N);

  // 5: points rank against Trim rank.
  const sc = useMemo(() => {
    const byPoints = [...scatter].sort((a, b) => b.points - a.points);
    const byTrim = [...scatter].sort((a, b) => b.trim - a.trim);
    const pts = scatter.map((r) => ({ name: r.name, p: byPoints.indexOf(r) + 1, t: byTrim.indexOf(r) + 1 }));
    const out = [...pts].sort((a, b) => Math.abs(b.p - b.t) - Math.abs(a.p - a.t)).slice(0, 6);
    return { pts, out, up: out.find((o) => o.p > o.t) ?? null, dn: out.find((o) => o.p < o.t) ?? null };
  }, [scatter]);
  const n = sc.pts.length;

  const headPair = pair ? `${f2(pair.a.posted)} and ${f2(pair.b.posted)}: one strong, one short.` : "Not every total means the same.";
  const first = rounds[0];

  return (
    <div className="text-fg">
      {/* hero */}
      <header className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6">
        <p className="text-caption uppercase tracking-[0.14em] text-fg-subtle">The method</p>
        <h1
          className="mt-4 max-w-[14ch] text-balance font-serif text-[clamp(2.8rem,8vw,6.5rem)] font-medium italic leading-[0.95] tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Every heat, against the right bar.
        </h1>
        <p className="mt-6 max-w-[62ch] text-[1.1rem] leading-relaxed text-fg-muted">
          Every CT heat ends with a number. Trim asks a better question of it:{" "}
          <B>was that more or less than a surfer normally posts in that round?</B> Below, every heat{" "}
          {surferName} surfed in 2024 and 2025 lands against that expectation, and the gap pours into
          his Trim.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px] sm:gap-6">
          <div>
            <Stairs heats={chartHeats} datum={datum} rounds={rounds} shown={visible} narrow={false} />
            <Stairs heats={chartHeats} datum={datum} rounds={rounds} shown={visible} narrow />
          </div>
          <Gauge value={gaugeValue} />
        </div>
      </header>

      <Section k="1 · The problem" title={headPair} alt>
        {pair && (
          <>
            <p>
              {last} posted <B>{f2(pair.a.posted)}</B> in the {pair.a.round.toLowerCase()} of the {pair.a.event}{" "}
              {pair.a.year} and <B>{f2(pair.b.posted)}</B> in the {pair.b.round.toLowerCase()} of the {pair.b.event}{" "}
              {pair.b.year}. Almost the same number. The first was a big score for its round; the second was{" "}
              {pair.b.gap < 0 ? "just under" : "just over"} what that round normally takes.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[pair.a, pair.b].map((h) => (
                <div key={`${h.event}${h.year}${h.round}`} className="border-t-2 bg-paper pt-4 pb-5 px-5" style={{ borderTopColor: h.gap >= 0 ? ABOVE : BELOW }}>
                  <small className="text-caption text-fg-subtle">
                    {h.event} {h.year} · {h.round}
                  </small>
                  <p className="figures mt-2 text-[2.6rem] leading-none text-fg">{f2(h.posted)}</p>
                  <p className="mt-2 text-caption text-fg-subtle">Datum {f2(h.datum)}</p>
                  <p className="figures mt-1 text-heading" style={{ color: h.gap >= 0 ? ABOVE : BELOW }}>
                    {s2(h.gap)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
        <p>
          A heat total on its own can&apos;t tell you which. Rounds get harder as an event goes on, so the
          same number means very different things in different places.
        </p>
      </Section>

      <Section k="2 · Datum" title={`Datum rises from ${f2(datum[first])} to ${f2(datum.Final ?? datum[rounds[rounds.length - 1]])}.`}>
        <p>
          <B>Datum</B> is what a typical CT surfer posts in that round, worked out from every heat of 2024
          and 2025. It rises as the field thins and the waves get chosen more carefully.
        </p>
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,104px),1fr))] border-t border-fg">
          {rounds.map((r) => (
            <li key={r} className="border-b border-hairline py-3 pr-3">
              <small className="block text-caption text-fg-subtle">{r}</small>
              <b className="figures text-display-sm text-fg">{f2(datum[r])}</b>
            </li>
          ))}
        </ol>
        <Maths>
          <p>
            This first version of Datum holds one expected heat total per round, fitted on every heat
            result of 2024 and 2025 that carries a published total. Venue, wave height and wind are not
            in the line; they appear instead in each surfer&apos;s condition splits.
          </p>
          <p>Every figure above is read from the model&apos;s stored output, not typed.</p>
        </Maths>
      </Section>

      <Section k="3 · The gap" title="The gap is posted minus Datum." alt>
        <p>
          Take the posted total and subtract Datum. That gap is the whole idea: <Up>yellow</Up> when a
          surfer beat what the round normally produces, <Down>blue</Down> when he fell short. It&apos;s
          the same measure whether it&apos;s a Pipe opening round or a WSL Finals title match.
        </p>
        <p>
          Across his {N} heats, {last} finished above the line in <B>{above}</B> and below it in{" "}
          <B>{N - above}</B>.
        </p>
        <div className="border-t border-fg pt-4">
          <p className="text-caption uppercase tracking-[0.14em] text-fg-subtle">Try it · a heat {last} might surf next</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-caption text-fg-subtle">
              Round
              <select
                value={tRound}
                onChange={(e) => setTRound(e.target.value)}
                className="min-h-11 border border-hairline-strong bg-paper px-2 text-body text-fg"
              >
                {rounds.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-caption text-fg-subtle">
              Heat total
              <input
                type="number"
                min={0}
                max={20}
                step={0.01}
                value={tScore}
                onChange={(e) => setTScore(e.target.value)}
                className="figures min-h-11 border border-hairline-strong bg-paper px-2 text-body text-fg"
              />
            </label>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-3" aria-live="polite">
            <div>
              <small className="block text-caption text-fg-subtle">Datum</small>
              <b className="figures text-display-sm text-fg">{f2(tDatum)}</b>
            </div>
            <div>
              <small className="block text-caption text-fg-subtle">Gap</small>
              <b className="figures text-display-sm" style={{ color: tGap >= 0 ? ABOVE : BELOW }}>{s2(tGap)}</b>
            </div>
            <div>
              <small className="block text-caption text-fg-subtle">Trim after</small>
              <b className="figures text-display-sm" style={{ color: tAfter >= trimNow ? ABOVE : BELOW }}>{f3(tAfter)}</b>
            </div>
          </div>
          <p className="mt-3 text-caption text-fg-subtle">
            From {f3(trimNow)} today. One heat moves Trim {(alpha * 100).toFixed(1)}% of the way towards its
            gap, so a single result nudges it rather than swings it.
          </p>
        </div>
      </Section>

      <Section k="4 · Trim" title={`Each heat moves Trim ${(alpha * 100).toFixed(1)}%.`}>
        <p>
          Trim adds up the gaps, but not equally. Each new heat counts for <B>{(alpha * 100).toFixed(1)}%</B>,
          and everything before it shrinks a little to make room. A heat&apos;s weight halves roughly every{" "}
          <B>{Math.round(half)} heats</B>. Every surfer starts at zero, and that starting point fades too:
          after {N} heats it holds just <B>{(priorWeight * 100).toFixed(1)}%</B> of {last}&apos;s rating,
          which is why he can be rated with confidence and a rookie can&apos;t yet. His Trim today is{" "}
          <Up>{f3(trimNow)}</Up>.
        </p>
        <Wake heats={heats} alpha={alpha} trimNow={trimNow} />
        <Maths>
          <p>
            <code>
              Trim after a heat = {alpha.toFixed(4)} × gap + {(1 - alpha).toFixed(4)} × Trim before
            </code>
            , starting from <code>0</code>.
          </p>
          <p>
            So a heat surfed <i>k</i> heats ago counts{" "}
            <code>
              {alpha.toFixed(4)} × {(1 - alpha).toFixed(4)}
              <sup>k</sup>
            </code>{" "}
            today, and the starting zero still counts{" "}
            <code>
              {(1 - alpha).toFixed(4)}
              <sup>n</sup>
            </code>{" "}
            after <i>n</i> heats. That last figure is the &quot;prior weight&quot; shown beside every rating.
            The rate is the same for every surfer.
          </p>
        </Maths>
      </Section>

      {n >= 3 && sc.up && sc.dn && (
        <Section k="5 · Points and Trim" title="Points tell you who finished. Trim tells you who surfed." alt>
          <p>
            Ranking points reward where you finish. That&apos;s the right way to crown a champion, but
            it&apos;s a noisy way to judge surfing: one hot event lifts a season, a tough draw sinks one,
            and every heat in between is invisible. Trim reads every heat, against the right bar, and weighs
            recent form most.
          </p>
          <p>
            Take the {n} rated surfers who surfed every {scatterSeason} event and rank them twice: by{" "}
            {scatterSeason} points, and by Trim. On the dashed line the two agree. <B>{sc.up.name}</B> is{" "}
            {ord(sc.up.p)} on points but {ord(sc.up.t)} on Trim: his heats were better than his results.{" "}
            <B>{sc.dn.name}</B> is the opposite, {ord(sc.dn.p)} on points and {ord(sc.dn.t)} on Trim. Trim
            covers both seasons, so it also carries 2024 form.
          </p>
          <Scatter pts={sc.pts} out={sc.out} season={scatterSeason} />
        </Section>
      )}

      <Section k="6 · What it unlocks" title="What Trim makes possible.">
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-x-8 border-t border-hairline">
          {[
            ["Form", "His last ten heats against his own average. Hot, warm, steady, cooling or cold."],
            ["Momentum", "Which way his Trim has moved lately, and how fast."],
            ["Conditions", "His gap by the wave height and wind WSL published for each heat."],
            ["Late rounds", "Does he lift from the quarterfinals on, or fade?"],
            ["Head-to-head", "A forecast for any two surfers, stored with its inputs and checked in public."],
            ["The whole field", "Every season as a ridgeline, so a run of form shows at a glance."],
          ].map(([t, d]) => (
            <li key={t} className="border-b border-hairline py-4">
              <b className="block text-heading font-semibold text-fg">{t}</b>
              <span className="text-body-sm text-fg-muted">{d}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section k="7 · What it can't do" title="What Trim can’t tell you." alt>
        <ul className="border-t border-hairline">
          {[
            ["It doesn’t know which way the wave broke.", "WSL doesn’t publish wave direction for ocean events, so a natural-footer and a goofy-footer at the same break are treated alike."],
            ["It doesn’t model individual judges.", "It works from heat totals, which already include the judging."],
            ["It doesn’t know who you were up against.", "Datum is the round’s line, not your opponent’s. Head-to-head forecasts handle the matchup separately."],
            ["Its forecasting edge is small.", "Tested on 2025 heats it hadn’t been fitted to, the head-to-head model picked the winner 57.9% of the time against 50% for a coin flip. Real, but modest, and every live forecast is stored and checked in public."],
            ["New surfers need time.", "With few heats, most of a rating is still the starting zero. That’s why the main tables only rank surfers with 16 or more heats."],
          ].map(([a, b]) => (
            <li key={a} className="border-b border-hairline py-4">
              <B>{a}</B> {b}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------- 4: wake */

function Wake({ heats, alpha, trimNow }: { heats: ExplainerHeat[]; alpha: number; trimNow: number }) {
  const N = heats.length;
  const W = 1000;
  const H = 260;
  const L = 20;
  const R = 20;
  const base = 150;
  const w = (W - L - R) / Math.max(1, N);
  const first = heats[0];
  const last = heats[N - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="How much each heat counts in today's Trim: recent heats tall, older heats fading">
      {heats.map((h, i) => {
        const k = N - 1 - i;
        const ht = h.gap * alpha * Math.pow(1 - alpha, k) * 260;
        return (
          <rect
            key={i}
            x={px(L + i * w + 0.6)}
            width={px(Math.max(1, w - 1.2))}
            y={px(ht >= 0 ? base - ht : base)}
            height={px(Math.max(0.8, Math.abs(ht)))}
            fill={h.gap >= 0 ? ABOVE : BELOW}
            opacity={px(0.35 + 0.65 * Math.pow(1 - alpha, k))}
          />
        );
      })}
      <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--fg-subtle)" />
      {first && (
        <text x={L} y={H - 50} fontSize={14} fill="var(--fg-subtle)">
          {first.event.replace(/^Lexus /, "")} {first.year}: counts very little today
        </text>
      )}
      {last && (
        <text x={W - R} y={H - 50} textAnchor="end" fontSize={14} fill="var(--fg-subtle)">
          {last.event.replace(/^Lexus /, "")} {last.year}: counts most
        </text>
      )}
      <text x={L} y={H - 24} fontSize={14} fill="var(--fg-subtle)">
        Each bar is one heat’s gap multiplied by its weight in today’s Trim. Together they add up to {f3(trimNow)}.
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------- 5: scatter */

function Scatter({
  pts,
  out,
  season,
}: {
  pts: { name: string; p: number; t: number }[];
  out: { name: string; p: number; t: number }[];
  season: number;
}) {
  const n = pts.length;
  const W = 900;
  const H = 560;
  const L = 70;
  const R = 30;
  const T = 30;
  const Bm = 70;
  const x = (v: number) => px(L + ((v - 1) / (n - 1)) * (W - L - R));
  const y = (v: number) => px(T + ((v - 1) / (n - 1)) * (H - T - Bm));
  const lab = { fontSize: 16, fill: "var(--fg-subtle)" };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${season} points rank against Trim rank for every rated surfer who surfed all of ${season}`}>
      <line x1={x(1)} y1={y(1)} x2={x(n)} y2={y(n)} stroke="var(--fg-subtle)" strokeDasharray="4 6" />
      <text x={(L + W - R) / 2} y={H - 20} textAnchor="middle" {...lab}>{season} points rank →</text>
      <text transform={`translate(26 ${(T + H - Bm) / 2}) rotate(-90)`} textAnchor="middle" {...lab}>← Trim rank</text>
      <text x={x(1)} y={H - Bm + 24} textAnchor="middle" {...lab}>1st</text>
      <text x={x(n)} y={H - Bm + 24} textAnchor="middle" {...lab}>{ord(n)}</text>
      <text x={L - 14} y={y(1) + 5} textAnchor="end" {...lab}>1st</text>
      <text x={L - 14} y={y(n) + 5} textAnchor="end" {...lab}>{ord(n)}</text>
      <text x={x(n) - 8} y={y(1) + 18} textAnchor="end" fontSize={16} fill={ABOVE}>Trim rates higher than points</text>
      <text x={x(1) + 8} y={y(n) - 10} fontSize={16} fill={BELOW}>Points rate higher than Trim</text>
      {pts.map((o) => {
        const d = o.p - o.t;
        const hit = out.includes(o);
        return (
          <circle key={o.name} cx={x(o.p)} cy={y(o.t)} r={hit ? 7 : 5} fill={d > 0 ? ABOVE : d < 0 ? BELOW : "var(--fg)"} opacity={hit ? 1 : 0.6}>
            <title>{`${o.name}: ${ord(o.p)} on points, ${ord(o.t)} on Trim`}</title>
          </circle>
        );
      })}
      {out.map((o) => (
        <text key={o.name} x={x(o.p) + (o.p > n / 2 ? -10 : 10)} y={y(o.t) + 5} textAnchor={o.p > n / 2 ? "end" : "start"} fontSize={16} fill="var(--fg)">
          {surname(o.name)}
        </text>
      ))}
    </svg>
  );
}
