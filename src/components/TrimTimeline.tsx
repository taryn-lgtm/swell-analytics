import ScrollBox from "@/components/ui/ScrollBox";
import { formatDerivedSigned, formatScore, ordinal } from "@/lib/format";
import { formatPriorWeight, formatTrim } from "@/lib/trim";
import type { SurferHeat } from "@/lib/queries/surfer";

/**
 * THE signature component (PROJECT_PLAN.md: "the timeline sparkline is the
 * site's signature component"), built in the stat-line's grammar rather
 * than beside it -- mono figures, hairlines, one coral (F2).
 *
 * Two panels, ONE x-axis. The residual panel is a second chart that shares
 * the x positions and has its own y; it is never a second y-axis on the
 * first. That is the pattern `docs/trim_v1.html` set and its comment is the
 * rule: "residual panel shares x, has its OWN y - a second chart, never a
 * second axis." The geometry constants below are the prototype's, so the
 * shipped chart and the prototype cannot drift apart visually.
 *
 * Server-rendered, static SVG: no client bundle, no charting library, and
 * it renders with JavaScript off. Every point also carries a <title>, and
 * every figure it encodes appears as text in the heat log below it, so the
 * chart is never the only place a number exists.
 *
 * Colours are `var(--color-*)` presentation attributes rather than Tailwind
 * fill-/stroke- utilities on purpose: the tokens are real CSS custom
 * properties on :root, so this cannot silently render black if a utility
 * fails to generate. There is no instrument in this project that can see a
 * rendered page (decision 66), so the drawing must not depend on one.
 *
 * THE PRIOR BAND is this component's own addition to the prototype.
 * DESIGN_BRIEF 4.1(a) names prior weight the sharpest of the five things
 * the site must not be able to hide; a line that starts at the prior and
 * decays towards the surfer's own record hides it by default. The shaded
 * span says, in the drawing itself, which heats are still mostly prior.
 */

const W = 980;
const H = 300;
const RH = 96;
const L = 52;
const R = 16;
const T = 18;
const B = 26;
const INNER = W - L - R;
const TOTAL_H = H + 30 + RH + 22;

export interface TrimTimelineProps {
  heats: SurferHeat[];
  fullName: string;
  /** Prior weight at or above this share counts as "mostly the prior". */
  priorBandAt?: number;
}

export default function TrimTimeline({ heats, fullName, priorBandAt = 0.5 }: TrimTimelineProps) {
  // Only rated heats carry a model row; an entry with no heat total is not
  // a zero, it is an absence, and it is stated rather than plotted.
  const pts = heats.filter((h) => h.trimAfter != null && h.residual != null);
  if (pts.length === 0) return null;

  const x = (i: number) => L + (pts.length === 1 ? INNER / 2 : (i / (pts.length - 1)) * INNER);

  const tv = pts.map((p) => p.trimAfter as number);
  let lo = Math.min(0, ...tv);
  let hi = Math.max(0, ...tv);
  const pad = (hi - lo) * 0.16 || 0.2;
  lo -= pad;
  hi += pad;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);

  // Residual panel: its own y, the same x. Exact maximum, so the axis label
  // is a measurement rather than a rounded-up claim.
  const rv = pts.map((p) => p.residual as number);
  const rm = Math.max(4, Math.ceil(Math.max(...rv.map(Math.abs))));
  const ry = (v: number) => H + 30 + ((rm - v) / (2 * rm)) * RH;

  const ticks: number[] = [];
  for (let k = -8; k <= 8; k++) {
    const v = k * 0.5;
    if (v >= lo && v <= hi) ticks.push(v);
  }

  // Every season change, not just the first: a third season must not go
  // unmarked because the prototype only had two.
  const boundaries: { i: number; season: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].seasonYear !== pts[i - 1].seasonYear) {
      boundaries.push({ i, season: pts[i].seasonYear });
    }
  }

  // Prior weight decays monotonically, so "mostly prior" is a prefix.
  let priorUntil = -1;
  for (let i = 0; i < pts.length; i++) {
    if ((pts[i].priorWeight ?? 0) >= priorBandAt) priorUntil = i;
  }

  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.trimAfter as number).toFixed(1)}`)
    .join(" ");
  const area =
    `${line} L ${x(pts.length - 1).toFixed(1)} ${y(0).toFixed(1)}` +
    ` L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const last = pts[pts.length - 1];
  const lastTrim = last.trimAfter as number;
  const best = pts.reduce((a, b) => ((b.residual as number) > (a.residual as number) ? b : a));
  const worst = pts.reduce((a, b) => ((b.residual as number) < (a.residual as number) ? b : a));

  const label = (p: SurferHeat) =>
    `${p.seasonYear} ${p.eventName} · ${p.roundName}${p.heatNumber != null ? ` heat ${p.heatNumber}` : ""}`;

  return (
    <figure className="m-0">
      {/* The chart scrolls rather than shrinks. It never draws narrower than
          its 980-unit viewBox, so an 11-unit label is 11px or larger at every
          width -- at the old 680px floor it measured 7.6px on a phone. It
          opens on the latest heat, the one the headline Trim is, and the box
          says in words which way the rest of the career lies. */}
      <ScrollBox
        label={`Trim timeline for ${fullName}`}
        cueRight="Later heats — scroll sideways →"
        cueLeft="← Earlier heats — scroll sideways"
        startAtEnd
      >
        {/* The y-axes are a separate strip pinned to the left edge, so the
            scale stays in view wherever the reader has scrolled -- the box
            opens on the latest heat, far from the drawing's own left margin.
            The strip is the chart's left margin at the same scale, laid over
            it (negative margin), so at scroll 0 the two coincide exactly. */}
        <div className="flex min-w-[980px]">
        <svg
          aria-hidden
          viewBox={`0 0 ${L} ${TOTAL_H}`}
          className="sticky left-0 z-10 block h-auto shrink-0 self-start"
          style={{ width: `${(L / W) * 100}%`, marginRight: `-${(L / W) * 100}%` }}
          fontFamily="var(--font-mono)"
        >
          <rect x={0} y={0} width={L} height={TOTAL_H} fill="var(--color-paper)" />
          {ticks.map((v) => (
            <text
              key={`yl-${v}`}
              x={L - 9}
              y={y(v) + 4}
              textAnchor="end"
              fill="var(--color-fg-subtle)"
              fontSize={11}
            >
              {v === 0 ? "0" : v.toFixed(1)}
            </text>
          ))}
          {[rm, 0, -rm].map((v) => (
            <text
              key={`ry-${v}`}
              x={L - 9}
              y={ry(v) + 4}
              textAnchor="end"
              fill="var(--color-fg-subtle)"
              fontSize={11}
            >
              {v === 0 ? "0" : v > 0 ? `+${v}` : String(v)}
            </text>
          ))}
        </svg>
        <svg
          viewBox={`0 0 ${W} ${TOTAL_H}`}
          role="img"
          aria-label={`Trim after each of ${pts.length} heats for ${fullName}, from ${formatTrim(
            tv[0]
          )} to ${formatTrim(lastTrim)}, with the deviation from Datum for each heat below`}
          className="block h-auto w-full shrink-0"
          fontFamily="var(--font-mono)"
        >
          {priorUntil >= 0 && (
            <g>
              <rect
                x={L}
                y={T}
                width={Math.max(0, x(priorUntil) - L)}
                height={H - B - T}
                fill="var(--color-paper-sunken)"
              />
              <text x={L + 5} y={H - B - 6} fill="var(--color-fg-subtle)" fontSize={11}>
                {priorUntil === 0
                  ? `first heat: prior is ${Math.round(priorBandAt * 100)}% or more of the rating`
                  : `first ${priorUntil + 1} heats: prior is ${Math.round(priorBandAt * 100)}% or more of the rating`}
              </text>
            </g>
          )}

          {ticks.map((v) => (
            <g key={`tick-${v}`}>
              <line
                x1={L}
                x2={W - R}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
            </g>
          ))}

          <line
            x1={L}
            x2={W - R}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--color-fg-subtle)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <text
            x={W - R}
            y={y(0) - 7}
            textAnchor="end"
            fill="var(--color-fg-subtle)"
            fontSize={11}
          >
            prior · 0
          </text>

          {boundaries.map((b) => (
            <g key={`season-${b.season}`}>
              <line
                x1={x(b.i)}
                x2={x(b.i)}
                y1={T}
                y2={H - B}
                stroke="var(--color-fg-subtle)"
                strokeWidth={1}
              />
              <text x={x(b.i) + 5} y={T + 11} fill="var(--color-fg-subtle)" fontSize={11}>
                {b.season}
              </text>
            </g>
          ))}

          <path d={area} fill="var(--color-above)" opacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          <circle
            cx={x(pts.length - 1)}
            cy={y(lastTrim)}
            r={4.5}
            fill="var(--color-accent)"
            stroke="var(--color-paper)"
            strokeWidth={2}
          />
          <text
            x={x(pts.length - 1) - 8}
            y={y(lastTrim) - 9}
            textAnchor="end"
            fill="var(--color-fg)"
            fontSize={12}
          >
            {formatTrim(lastTrim)}
          </text>

          <text x={L} y={H - B + 18} fill="var(--color-fg-subtle)" fontSize={11}>
            heat 1
          </text>
          <text
            x={W - R}
            y={H - B + 18}
            textAnchor="end"
            fill="var(--color-fg-subtle)"
            fontSize={11}
          >
            heat {pts.length}
          </text>

          {/* ---- Second chart: same x, its own y ---- */}
          <text x={L} y={H + 18} fill="var(--color-fg-muted)" fontSize={12}>
            Deviation from Datum, each heat
          </text>
          <line
            x1={L}
            x2={W - R}
            y1={ry(0)}
            y2={ry(0)}
            stroke="var(--color-fg-subtle)"
            strokeWidth={1}
          />
          {pts.map((p, i) => {
            const v = rv[i];
            return (
              <line
                key={`bar-${p.heatEntryId}`}
                x1={x(i).toFixed(1)}
                x2={x(i).toFixed(1)}
                y1={ry(0).toFixed(1)}
                y2={ry(v).toFixed(1)}
                stroke={v >= 0 ? "var(--color-above)" : "var(--color-below)"}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.62}
              />
            );
          })}

          {/* Hit targets last so the native tooltip wins over the marks. */}
          {pts.map((p, i) => (
            <circle
              key={`hit-${p.heatEntryId}`}
              cx={x(i)}
              cy={y(p.trimAfter as number)}
              r={Math.max(4, Math.min(9, INNER / pts.length / 2))}
              fill="transparent"
            >
              <title>
                {`Heat ${i + 1} — ${label(p)}\n` +
                  `Scored ${formatScore(p.heatTotal)} against an expected ${formatScore(p.expected)} (${
                    (p.residual as number) >= 0 ? "+" : ""
                  }${(p.residual as number).toFixed(2)})\n` +
                  `Trim ${formatTrim(p.trimBefore)} → ${formatTrim(p.trimAfter)} · prior weight ${formatPriorWeight(
                    p.priorWeight
                  )}` +
                  (p.position != null ? `\n${ordinal(p.position)} in the heat` : "")}
              </title>
            </circle>
          ))}
        </svg>
        </div>
      </ScrollBox>

      <figcaption className="mt-3 grid gap-x-8 gap-y-2 text-caption text-fg-subtle sm:grid-cols-2">
        <p>
          <span className="font-semibold tracking-[0.04em]">Reading it</span> — the line
          is Trim after each heat: points per heat above or below what that round usually yields.
          It starts at the prior, <span className="figures">0.000</span>, and moves by a decayed
          share of each heat&apos;s deviation. The bars below are those deviations, one per heat,
          on their own scale. Neither panel is a prediction.
        </p>
        <p>
          <span className="font-semibold tracking-[0.04em]">
            {best === worst ? "The heat" : "Extremes"}
          </span>{" "}
          {best === worst ? (
            <>
              — one rated heat, so there is no best and worst to separate:{" "}
              <span className="figures">{formatDerivedSigned(best.residual)}</span> at {label(best)}.
            </>
          ) : (
            <>
              — best <span className="figures">{formatDerivedSigned(best.residual)}</span> at{" "}
              {label(best)}; worst{" "}
              <span className="figures">{formatDerivedSigned(worst.residual)}</span> at{" "}
              {label(worst)}.
            </>
          )}{" "}
          Axis to <span className="figures">±{rm}</span>, the exact maximum rounded outward.
        </p>
      </figcaption>
    </figure>
  );
}
