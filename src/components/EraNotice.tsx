import { ERA_NOTES, pointsEra } from "@/lib/eras";

/**
 * Signals the points era so raw totals are never silently compared
 * across incompatible scales (2015–17 / 2018 / 2019 / 2021+).
 */
export default function EraNotice({ seasonYear }: { seasonYear: number }) {
  const era = pointsEra(seasonYear);
  return (
    <p className="flex items-center gap-2 text-caption text-fg-subtle">
      <span className="figures border border-hairline-strong px-1 py-px font-medium tracking-[0.08em]">
        {era} era
      </span>
      {ERA_NOTES[era]}
    </p>
  );
}
