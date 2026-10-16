"use client";

import Link from "next/link";
import { useState } from "react";
import { formatTrim } from "@/lib/trim";

/*
 * The Swell home hero: one ridge per surfer, his heats in career order.
 * Sand where a heat beat Datum, sea where it fell short. Rows are stacked by
 * current Trim. Every value is trim.residual as stored; the only processing
 * is a light smoothing so a ridge reads as a line, stated in the caption.
 */

export interface RidgeRow {
  slug: string;
  name: string;
  trim: number;
  gaps: number[];
}

const W = 1000;
const ROW = 24;
const AMP = 5.5; // px per point of gap
const SIGMA = 0.9; // heats

function smooth(v: number[]): number[] {
  const r = Math.ceil(SIGMA * 3);
  return v.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(v.length - 1, i + r); j++) {
      const k = Math.exp(-((j - i) ** 2) / (2 * SIGMA * SIGMA));
      s += v[j] * k;
      w += k;
    }
    return s / w;
  });
}

const px = (v: number) => Math.round(v * 10) / 10;

function ridgePath(gaps: number[], base: number): { line: string; area: string } {
  const s = smooth(gaps);
  const n = s.length;
  const pts = s.map((g, i) => [px(n > 1 ? (i / (n - 1)) * W : W / 2), px(base - g * AMP)] as const);
  if (pts.length === 0) return { line: "", area: "" };
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = px((x0 + x1) / 2);
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return { line: d, area: `${d} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` };
}

export default function Ridgeline({ rows }: { rows: RidgeRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_3rem] gap-x-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4rem] sm:gap-x-4">
      <div aria-hidden />
      <div className="flex justify-between pb-2 text-caption text-fg-subtle">
        <span>First<span className="max-sm:hidden"> heat</span></span>
        <span>Latest<span className="max-sm:hidden"> heat</span></span>
      </div>
      <div className="pb-2 text-right text-caption text-fg-subtle">Trim</div>

      <ol className="contents">
        {rows.map((r, i) => (
          <li key={r.slug} className="contents">
            <Link
              href={`/surfers/${r.slug}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={`col-start-1 flex h-6 min-h-6 items-center truncate text-body-sm transition-colors ${
                hover === i ? "text-accent" : i === 0 ? "text-accent" : "text-fg-muted hover:text-fg"
              }`}
              style={{ gridRow: i + 2 }}
            >
              <span className="figures mr-2 w-5 shrink-0 text-right text-fg-subtle max-sm:hidden">{i + 1}</span>
              <span className="truncate max-sm:hidden">{r.name}</span>
              <span className="truncate sm:hidden" aria-label={r.name}>{`${r.name[0]}. ${r.name.split(" ").slice(-1)[0]}`}</span>
            </Link>
            <span
              className={`figures col-start-3 flex h-6 items-center justify-end text-body-sm ${r.trim >= 0 ? "text-above" : "text-below"}`}
              style={{ gridRow: i + 2 }}
            >
              {formatTrim(r.trim)}
            </span>
          </li>
        ))}
      </ol>

      <svg
        viewBox={`0 0 ${W} ${rows.length * ROW}`}
        preserveAspectRatio="none"
        className="col-start-2 block h-full w-full overflow-visible"
        style={{ gridRow: `2 / span ${rows.length}` }}
        role="img"
        aria-label={`Every rated heat for the top ${rows.length} surfers by Trim, each as a ridge rising above the line where he beat Datum and dipping below where he fell short`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {rows.map((_, i) => {
            const base = i * ROW + ROW / 2;
            return (
              <g key={i}>
                <clipPath id={`rl-up-${i}`}>
                  <rect x={0} y={base - 400} width={W} height={400} />
                </clipPath>
                <clipPath id={`rl-dn-${i}`}>
                  <rect x={0} y={base} width={W} height={400} />
                </clipPath>
              </g>
            );
          })}
        </defs>
        {rows.map((r, i) => {
          const base = i * ROW + ROW / 2;
          const { line, area } = ridgePath(r.gaps, base);
          const dim = hover != null && hover !== i;
          return (
            <g
              key={r.slug}
              opacity={dim ? 0.25 : 1}
              style={{ transition: "opacity 160ms" }}
              onMouseEnter={() => setHover(i)}
            >
              <path d={area} fill="var(--paper)" />
              <path d={area} fill="var(--above)" opacity={0.55} clipPath={`url(#rl-up-${i})`} />
              <path d={area} fill="var(--below)" opacity={0.55} clipPath={`url(#rl-dn-${i})`} />
              <line x1={0} x2={W} y1={base} y2={base} stroke="var(--hairline)" vectorEffect="non-scaling-stroke" />
              <path
                d={line}
                fill="none"
                stroke={hover === i ? "var(--fg)" : "var(--fg-muted)"}
                strokeWidth={hover === i ? 1.6 : 1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
