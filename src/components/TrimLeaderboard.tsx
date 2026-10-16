"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { MeasureBar } from "@/components/ui/StatLine";
import CountryTag from "@/components/CountryTag";
import ChampionBadge from "@/components/ChampionBadge";
import { formatPriorWeight, formatTrim } from "@/lib/trim";

/**
 * The ranked Trim table -- docs/trim_v1.html carried into the route.
 * Prior weight shows on EVERY row (DESIGN_BRIEF §4.1(a)); the threshold is
 * applied by the caller and disclosed by ThresholdFilter beside it.
 *
 * Rank is the row's position in the incoming order (Trim descending) and is
 * the only figure here not read from a column.
 *
 * Hierarchy, strongest first: the surfer's name, then Trim -- the figure the
 * table is ranked on, set a size up with its bar across the column -- then
 * the supporting columns in muted ink. Coral is spent once, on the leader's
 * bar; rank 1 and the leading figure are ink, not accent. Prior weight above
 * one half is the only emphasis in its column, because it is a warning.
 */

export interface TrimLeaderboardRow {
  rank: number;
  surferId: number;
  fullName: string;
  slug: string;
  countryCode: string | null;
  trim: number;
  nHeats: number;
  priorWeight: number;
  /** True for the explicit seasons.world_champion_surfer_id -- never inferred. */
  champion: { year: number } | null;
}

export default function TrimLeaderboard({
  rows,
  minHeats,
}: {
  rows: TrimLeaderboardRow[];
  /** Rows below this are shown muted when the caller has switched the filter off. */
  minHeats: number;
}) {
  const leaderTrim = rows[0]?.trim ?? 0;
  const maxTrim = Math.max(0, ...rows.map((r) => r.trim));

  const columns: Column<TrimLeaderboardRow>[] = [
    {
      key: "rank",
      header: "#",
      numeric: true,
      sortValue: (r) => r.rank,
      className: "w-10",
      sticky: { left: 0, width: 2.5 },
      render: (r) => (
        <span className={r.rank === 1 ? "font-semibold text-fg" : "text-fg-subtle"}>{r.rank}</span>
      ),
    },
    {
      key: "surfer",
      header: "Surfer",
      sortValue: (r) => r.fullName,
      sticky: { left: 2.5 },
      className: "shadow-[inset_-1px_0_0_var(--color-table-hairline)]",
      render: (r) => (
        // Country under the name, so it never widens the pinned column
        // (mobile bar, point 3).
        <span className="flex flex-col">
          <span className="flex items-center gap-2.5">
            <Link href={`/surfers/${r.slug}`} className="inline-flex min-h-6 items-center font-medium text-fg hover:text-link hover:underline">
              {r.fullName}
            </Link>
            {r.champion && <ChampionBadge compact year={r.champion.year} />}
          </span>
          <CountryTag code={r.countryCode} />
        </span>
      ),
    },
    {
      key: "trim",
      header: "Trim",
      headerLabel: "Trim, points per heat above expectation",
      numeric: true,
      sortValue: (r) => r.trim,
      // Narrower below 640 so all five columns fit a phone without a scroll.
      className: "w-24 sm:w-36",
      render: (r) => (
        <span className="flex flex-col items-end gap-1">
          <span className={`text-body ${r.rank === 1 && r.trim === leaderTrim ? "font-semibold" : "font-medium"}`}>
            {formatTrim(r.trim)}
          </span>
          <span className="w-full">
            <MeasureBar
              fraction={maxTrim > 0 ? Math.max(0, r.trim) / maxTrim : 0}
              accent={r.rank === 1}
              label={`${formatTrim(r.trim)} of the leader's ${formatTrim(maxTrim)}`}
            />
          </span>
        </span>
      ),
    },
    {
      key: "heats",
      header: "Heats",
      numeric: true,
      sortValue: (r) => r.nHeats,
      className: "w-16",
      render: (r) => (
        <span className={r.nHeats < minHeats ? "text-fg-subtle" : "text-fg-muted"}>{r.nHeats}</span>
      ),
    },
    {
      key: "prior",
      header: "Prior weight",
      headerLabel: "Share of the rating that is the starting prior",
      numeric: true,
      sortValue: (r) => r.priorWeight,
      className: "w-24",
      render: (r) => (
        <span className={r.priorWeight > 0.5 ? "font-semibold text-fg" : "text-fg-subtle"}>
          {formatPriorWeight(r.priorWeight)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.surferId}
      caption="Trim leaderboard: latest Trim per surfer, heats surfed, and the share of the rating that is the starting prior"
      striped={false}
      // A touch more air than the dense default: this is the front page.
      rowClassName={(r) => `[&>td]:py-2 ${r.nHeats < minHeats ? "text-fg-muted" : ""}`}
    />
  );
}
