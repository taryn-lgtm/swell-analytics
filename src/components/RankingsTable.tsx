"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { MeasureBar } from "@/components/ui/StatLine";
import CountryTag from "@/components/CountryTag";
import ChampionBadge from "@/components/ChampionBadge";
import { formatPoints, ordinal } from "@/lib/format";
import { formatPriorWeight, formatTrim, formatTrimRange } from "@/lib/trim";
import type { RankingRow } from "@/lib/queries/rankings";

/**
 * The season table for `/rankings`, in either of the two formats the plan
 * names. Every cell is a stored figure or a stated derivation:
 *   - the row order is the caller's (points, or the published final order);
 *   - "#" is the points rank, shared on ties, or -- in Final Five format --
 *     the published Finals placing for the five who surfed it;
 *   - Points is the sum of published, non-throwaway points;
 *   - Trim is the surfer's latest Trim, the same figure `/` shows, with its
 *     heat count and prior weight beside it because it is not a season figure.
 * Coral marks the champion (explicit field) and the points leader only.
 */

export type RankingsFormat = "final-five" | "cumulative";

export default function RankingsTable({
  rows,
  format,
  minHeats,
}: {
  rows: RankingRow[];
  format: RankingsFormat;
  minHeats: number;
}) {
  const leaderPoints = Math.max(0, ...rows.map((r) => r.points));
  const maxTrim = Math.max(0, ...rows.map((r) => r.trim?.trim ?? 0));

  const columns: Column<RankingRow>[] = [
    {
      key: "rank",
      header: "#",
      numeric: true,
      // Rank and surfer stay pinned while the figures scroll beneath them:
      // on a phone the table is wider than the screen, and a row of figures
      // without its name is not readable.
      sticky: { left: 0, width: 3 },
      render: (r) => {
        if (format === "final-five" && r.finalsPlacing != null) {
          return (
            <span className={r.finalsPlacing === 1 ? "font-semibold text-accent-strong" : "font-medium"}>
              {r.finalsPlacing}
            </span>
          );
        }
        return (
          <span className={r.pointsRank === 1 && format === "cumulative" ? "font-semibold text-accent-strong" : ""}>
            {r.tied ? "=" : ""}
            {r.pointsRank}
          </span>
        );
      },
    },
    {
      key: "surfer",
      header: "Surfer",
      sortValue: (r) => r.fullName,
      sticky: { left: 3 },
      // The pinned edge. An inset hairline, not border-r: under
      // border-collapse the border belongs to the table and stays behind
      // when the cell sticks.
      className: "shadow-[inset_-1px_0_0_var(--color-table-hairline)]",
      render: (r) => (
        // Country sits under the name, not beside it: beside it, a name like
        // "French Polynesia" widened the pinned column and pushed Heats ·
        // prior off a 768 px screen (mobile bar, point 3).
        <span className="flex flex-col">
          <span className="flex items-center gap-2">
            <Link href={`/surfers/${r.slug}`} className="inline-flex min-h-6 items-center font-medium text-fg hover:text-link hover:underline">
              {r.fullName}
            </Link>
            {r.champion && <ChampionBadge compact />}
          </span>
          <CountryTag code={r.countryCode} />
        </span>
      ),
    },
    {
      key: "points",
      header: "Points",
      headerLabel: "Season points, published throwaway excluded",
      numeric: true,
      sortValue: (r) => r.points,
      className: "w-36",
      render: (r) => (
        <span className="flex flex-col items-end gap-1">
          <span className={r.pointsRank === 1 ? "font-semibold text-accent-strong" : "font-medium"}>
            {formatPoints(r.points)}
          </span>
          <span className="w-24">
            <MeasureBar
              fraction={leaderPoints > 0 ? r.points / leaderPoints : 0}
              accent={r.pointsRank === 1}
              label={`${formatPoints(r.points)} of the leader's ${formatPoints(leaderPoints)}`}
            />
          </span>
        </span>
      ),
    },
    {
      key: "events",
      header: "Counted",
      headerLabel: "Events whose points count, and the published throwaway",
      numeric: true,
      sortValue: (r) => r.eventsCounted,
      // No column is hidden at any width (decision 61, extended 30 Sept):
      // on a phone it is reached by the scroll the cue above the table names.
      className: "w-28 whitespace-nowrap",
      render: (r) => (
        <span className="text-fg-muted">
          {r.eventsCounted}
          {r.thrownPoints != null && (
            <span className="text-fg-subtle"> · drop {formatPoints(r.thrownPoints)}</span>
          )}
        </span>
      ),
    },
    {
      key: "finals",
      header: "Finals",
      headerLabel: "Published finishing position at the WSL Finals",
      numeric: true,
      sortValue: (r) => r.finalsPlacing,
      className: "w-20",
      render: (r) =>
        r.finalsPlacing != null ? (
          <span className={r.finalsPlacing === 1 ? "font-semibold text-accent-strong" : "text-fg"}>
            {ordinal(r.finalsPlacing)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "trim",
      header: "Trim",
      headerLabel: "Latest Trim, points per heat above expectation",
      numeric: true,
      sortValue: (r) => r.trim?.trim ?? null,
      className: "w-32",
      render: (r) =>
        r.trim ? (
          <span className="flex flex-col items-end gap-1">
            <span className={r.trim.nHeats < minHeats ? "text-fg-subtle" : "font-medium"}>
              {formatTrim(r.trim.trim)}
            </span>
            {r.trim.halfWidth != null && (
              <span className="figures text-caption text-fg-subtle" title="95% range from sampling noise">
                {formatTrimRange(r.trim.halfWidth)}
              </span>
            )}
            <span className="w-20">
              <MeasureBar
                fraction={maxTrim > 0 ? Math.max(0, r.trim.trim) / maxTrim : 0}
                label={`${formatTrim(r.trim.trim)} of the table's best ${formatTrim(maxTrim)}`}
              />
            </span>
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "trimHeats",
      header: "Heats · prior",
      headerLabel: "Heats behind the Trim figure, and the share that is still the starting prior",
      numeric: true,
      sortValue: (r) => r.trim?.nHeats ?? null,
      // Not hidden at any width: DESIGN_BRIEF 4.1(a) names prior weight the
      // sharpest of the five things the site must not be able to hide, and
      // /about states it is shown beside every Trim figure.
      className: "w-28 whitespace-nowrap",
      render: (r) =>
        r.trim ? (
          <span className={r.trim.nHeats < minHeats ? "text-fg-subtle" : "text-fg-muted"}>
            {r.trim.nHeats} · {formatPriorWeight(r.trim.priorWeight)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.surferId}
      caption={
        format === "final-five"
          ? "Season rankings in the published final order: the WSL Finals field by finishing position, then every other surfer by points"
          : "Season rankings by cumulative points, published throwaway excluded, with each surfer's latest Trim"
      }
      rowClassName={(r) => (format === "final-five" && r.finalsPlacing != null ? "bg-accent-soft/30" : "")}
    />
  );
}
