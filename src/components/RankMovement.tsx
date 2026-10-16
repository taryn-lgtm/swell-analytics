/**
 * Rank delta indicator (▲2 / ▼1 / —). Coral marks positive movement only
 * (per the accent rules); downward movement stays quiet ink. Presentational
 * until time-series snapshots exist (Phase 4) — pages pass null until then.
 */
export default function RankMovement({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return (
      <span className="figures text-fg-subtle" aria-label="No movement">
        —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`figures inline-flex items-center gap-0.5 font-medium ${
        up ? "text-accent-strong" : "text-fg-subtle"
      }`}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(delta)} place${Math.abs(delta) === 1 ? "" : "s"}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(delta)}
    </span>
  );
}
