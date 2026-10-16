/**
 * World Champion treatment. Driven ONLY by the explicit champion field
 * (seasons.world_champion_men_id / rankings_current.world_champion) —
 * never inferred from points. In 2021–2025 the points leader is often
 * NOT the champion, and this badge is how the UI tells the truth about it.
 * One of the few sanctioned uses of the coral accent.
 */

function CrownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`inline-block h-[0.9em] w-[0.9em] ${className}`}
      fill="currentColor"
    >
      <path d="M1.5 5.5 4 8l4-5 4 5 2.5-2.5L13.5 12h-11L1.5 5.5ZM2.5 13.5h11v1.5h-11v-1.5Z" />
    </svg>
  );
}

export default function ChampionBadge({
  compact = false,
  year,
}: {
  /** Icon-only, for dense table rows. */
  compact?: boolean;
  year?: number;
}) {
  const label = year ? `${year} World Champion` : "World Champion";
  if (compact) {
    return (
      <span
        title={label}
        aria-label={label}
        className="inline-flex items-center text-accent"
      >
        <CrownIcon />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 bg-accent px-2 py-0.5 text-caption font-bold tracking-[0.04em] text-on-accent">
      <CrownIcon />
      {label}
    </span>
  );
}
