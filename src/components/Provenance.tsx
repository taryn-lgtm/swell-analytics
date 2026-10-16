/**
 * Provenance -- the instrument's calibration mark (DESIGN_BRIEF §4.2, F6).
 *
 * A figure displayed without what it was computed over is a design defect
 * at the same severity as a broken layout. This primitive is how a figure
 * carries that: three sizes, caption type, fg-subtle, hairline idiom.
 * It takes NO accent colour. Coral stays reserved for leader, movement,
 * live and champion; provenance is normal, not an alarm.
 *
 *   inline -- a caption after a figure:            712 of 800 heats
 *   panel  -- a footnote block under a module:      what it was computed
 *             over, which rows are absent, the data_gaps count if any
 *
 * (The "row" size is a table column, done by the table itself.)
 */

export function ProvenanceInline({ children }: { children: React.ReactNode }) {
  return <span className="text-caption text-fg-subtle">{children}</span>;
}

export default function ProvenancePanel({
  children,
  label = "Computed over",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="mt-3 border-t border-hairline pt-2 text-caption leading-relaxed text-fg-subtle">
      <span className="font-semibold tracking-[0.04em]">{label}</span>{" "}
      {children}
    </div>
  );
}
