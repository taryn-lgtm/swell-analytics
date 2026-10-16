import Link from "next/link";
import ChampionBadge from "@/components/ChampionBadge";
import { MeasureBar } from "@/components/ui/StatLine";
import { formatPoints, ordinal } from "@/lib/format";

export interface FinalFiveEntry {
  rank: number;
  surferName: string;
  surferSlug: string | null;
  totalPoints: number | null;
  /** From the explicit champion field — never derived from points. */
  isChampion: boolean;
}

/**
 * The Final Five (2021–2025): the top 5 after the regular season contest
 * the title at the WSL Finals. This is a bracket, not a leaderboard —
 * the #1 seed is NOT necessarily the champion, so the champion entry is
 * marked independently of rank. Each seed is a stat-line readout; the
 * measure bar shows points relative to the top seed.
 */
export default function FinalFivePanel({
  seasonYear,
  entries,
}: {
  seasonYear: number;
  entries: FinalFiveEntry[];
}) {
  const topPoints = entries[0]?.totalPoints ?? null;
  return (
    <section
      aria-label={`${seasonYear} Final Five`}
      className="border-y-2 border-fg bg-paper-raised"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <h3 className="font-display text-display-sm font-bold tracking-tight text-fg">
          Final Five
        </h3>
        <p className="text-caption text-fg-subtle">
          Title decided in a one-day playoff at the WSL Finals — seeding is
          regular-season points, not the title order.
        </p>
      </div>
      <ol className="grid divide-y divide-hairline sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {entries.map((e) => (
          <li key={e.rank} className="flex flex-col gap-1.5 px-4 py-3">
            <p className="figures text-caption font-medium uppercase tracking-[0.14em] text-fg-subtle">
              Seed {e.rank} · {ordinal(e.rank)} on points
            </p>
            <p className="font-display text-heading font-bold leading-tight text-fg">
              {e.surferSlug ? (
                <Link href={`/surfers/${e.surferSlug}`} className="hover:text-link">
                  {e.surferName}
                </Link>
              ) : (
                e.surferName
              )}
            </p>
            <p className="flex items-baseline gap-1">
              <span
                className={`figures text-heading font-medium leading-none ${
                  e.isChampion ? "text-accent-strong" : "text-fg"
                }`}
              >
                {formatPoints(e.totalPoints)}
              </span>
              <span className="text-caption font-medium uppercase text-fg-subtle">
                pts
              </span>
            </p>
            <MeasureBar
              fraction={
                topPoints && e.totalPoints ? e.totalPoints / topPoints : 0
              }
              accent={e.isChampion}
              label={
                topPoints && e.totalPoints
                  ? `${Math.round((e.totalPoints / topPoints) * 100)}% of top seed's points`
                  : undefined
              }
            />
            {e.isChampion && (
              <div className="mt-1">
                <ChampionBadge year={seasonYear} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
