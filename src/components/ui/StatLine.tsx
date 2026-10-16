/**
 * THE signature motif: a measured readout, as on an instrument face.
 * Small label · mono figure · optional unit · optional delta ·
 * optional thin measure bar. The rankings points cell, the two-wave heat
 * scoreline and the surfer-profile header are all variations of this
 * grammar — build those from StatLine/MeasureBar, don't reinvent.
 *
 * Coral (`accent`) is reserved for meaning: leader, positive movement,
 * live/counting state, champion. Everything else is ink on paper.
 */

export type StatLineSize = "sm" | "md" | "lg";

const VALUE_SIZE: Record<StatLineSize, string> = {
  sm: "text-heading",
  md: "text-display-md",
  lg: "text-display-lg",
};

export function MeasureBar({
  fraction,
  accent = false,
  label,
}: {
  /** 0..1 share of the measure (e.g. points / leader points). */
  fraction: number;
  /** Coral fill — leader/live only. */
  accent?: boolean;
  /** Accessible description, e.g. "89% of leader's points". */
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      className="h-[3px] w-full bg-bar-track"
    >
      <div
        className={accent ? "h-full bg-accent" : "h-full bg-bar-fill"}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export interface StatLineDelta {
  text: string;
  tone: "up" | "down" | "flat";
}

export default function StatLine({
  label,
  value,
  unit,
  size = "md",
  delta,
  bar,
  accent = false,
  align = "start",
}: {
  label: string;
  /** Preformatted via lib/format — missing data arrives as an em-dash. */
  value: string;
  unit?: string;
  size?: StatLineSize;
  delta?: StatLineDelta;
  bar?: { fraction: number; accent?: boolean; label?: string };
  /** Coral figure — leader/live/champion contexts only. */
  accent?: boolean;
  align?: "start" | "end";
}) {
  const alignCls = align === "end" ? "items-end text-right" : "items-start text-left";
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${alignCls}`}>
      <span className="text-caption font-medium tracking-[0.04em] text-fg-subtle">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={`figures font-medium leading-none ${VALUE_SIZE[size]} ${
            accent ? "text-accent-strong" : "text-fg"
          }`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-caption font-medium text-fg-subtle">
            {unit}
          </span>
        )}
        {delta && (
          <span
            className={`figures text-stat font-medium ${
              delta.tone === "up"
                ? "text-accent-strong"
                : "text-fg-subtle"
            }`}
          >
            <span aria-hidden>
              {delta.tone === "up" ? "▲" : delta.tone === "down" ? "▼" : "—"}
            </span>
            {delta.tone !== "flat" && delta.text}
          </span>
        )}
      </span>
      {bar && (
        <div className="w-full min-w-16 pt-0.5">
          <MeasureBar fraction={bar.fraction} accent={bar.accent} label={bar.label} />
        </div>
      )}
    </div>
  );
}
