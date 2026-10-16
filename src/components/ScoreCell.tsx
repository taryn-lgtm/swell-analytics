import { EM_DASH, formatScore, scoreBand } from "@/lib/format";

/**
 * Wave/heat score with the CLAUDE.md colour bands (≥8 excellent, ≥6 good).
 * A null score is a DNS/no-ride: rendered as an em-dash, never 0.
 * Figures are always mono.
 */
export default function ScoreCell({
  score,
  dnsLabel = "DNS",
}: {
  score: number | null | undefined;
  dnsLabel?: string;
}) {
  if (score == null) {
    return (
      <span className="figures text-fg-subtle" title={dnsLabel} aria-label={dnsLabel}>
        {EM_DASH}
      </span>
    );
  }
  const band = scoreBand(score);
  if (band === "normal") {
    return <span className="figures">{formatScore(score)}</span>;
  }
  const styles =
    band === "excellent"
      ? "bg-score-excellent-bg text-score-excellent-fg"
      : "bg-score-good-bg text-score-good-fg";
  return (
    <span
      className={`figures inline-block min-w-[3.5em] rounded-xs px-1 py-px text-center font-medium ${styles}`}
    >
      {formatScore(score)}
    </span>
  );
}
