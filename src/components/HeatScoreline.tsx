import { EM_DASH, formatScore } from "@/lib/format";

// Module scope, not inside HeatScoreline: a component defined during render is
// a new type on every render, so React remounts it each time
// (react-hooks/static-components).
function Readout({
  label,
  value,
  valueCls,
  strong = false,
}: {
  label: string;
  value: string;
  valueCls: string;
  strong?: boolean;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-caption font-medium uppercase tracking-[0.14em] text-fg-subtle">
        {label}
      </span>
      <span
        className={`figures leading-none ${valueCls} ${
          strong ? "font-semibold text-fg" : "font-medium text-fg-muted"
        }`}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * Stat-line variant for the two counted waves: W1 + W2 = TOTAL as one
 * measured readout. Null total = DNS (em-dash, never 0). On Surf Ranch
 * events the two figures are best-left + best-right — pass waveLabels.
 */
export default function HeatScoreline({
  wave1,
  wave2,
  total,
  waveLabels = ["Wave 1", "Wave 2"],
  size = "md",
}: {
  wave1: number | null;
  wave2: number | null;
  total: number | null;
  waveLabels?: [string, string];
  size?: "sm" | "md";
}) {
  const dns = total == null;
  const valueCls =
    size === "md" ? "text-display-md" : "text-heading";
  const opCls = "figures self-end pb-0.5 text-body-sm text-fg-subtle";

  if (dns) {
    return (
      <span className="flex items-end gap-3" title="Did not surf">
        <Readout valueCls={valueCls} label="Heat total" value={EM_DASH} strong />
        <span className="pb-0.5 text-caption font-medium uppercase tracking-wide text-fg-subtle">
          DNS
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-end gap-2.5">
      <Readout valueCls={valueCls} label={waveLabels[0]} value={formatScore(wave1)} />
      <span aria-hidden className={opCls}>
        +
      </span>
      <Readout valueCls={valueCls} label={waveLabels[1]} value={formatScore(wave2)} />
      <span aria-hidden className={opCls}>
        =
      </span>
      <Readout valueCls={valueCls} label="Heat total" value={formatScore(total)} strong />
    </span>
  );
}
