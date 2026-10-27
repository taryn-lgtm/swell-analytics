"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { eventSlug } from "@/lib/slug";
import { EM_DASH, fixed, formatScore, ordinal } from "@/lib/format";
import { formatPriorWeight, formatTrim } from "@/lib/trim";
import type { SurferHeat } from "@/lib/queries/surfer";
import { TITLE_MATCH_ROUND_ORDER, displayHeatNumber, isFinals, titleMatchNoteFor } from "@/lib/finals";

/**
 * The heat log: `heat_entries` + `heats` + `rounds` + `events`, with the
 * counting pair and `position` as published (DESIGN_BRIEF 5).
 *
 * Every cell is stored. Nothing here is derived except the career index,
 * which is `trim.seq` where a model row exists and the row's place in the
 * chronological sort where it does not.
 *
 * NO COLUMN IS HIDDEN AT ANY WIDTH. Decision 61 was exactly this defect on
 * `/rankings` -- `Heats · prior` was dropped below 640px, which made the
 * about page's claim that prior weight is always shown false on a phone.
 * A table that scrolls has hidden nothing; a table that drops columns has.
 *
 * The counting rides read in SCORE order, not ride order. Trap 15: Dora at
 * Pipe 2025 reads 4.53 + 4.00, which are rides 7 and 5, and matching the
 * decomposition to rides positionally will mismatch. Trap 14: the pair is
 * the stored `counted` flag, never the best two -- an interference penalty
 * zeroes a counting ride without promoting the next one.
 */
export default function HeatLog({ heats, minHeats }: { heats: SurferHeat[]; minHeats: number }) {
  // The Title Match is a series: this surfer's heats won and lost in it, per
  // Finals, from the published placings. Shown under every Title Match row.
  const series = new Map<string, { won: number; lost: number }>();
  for (const h of heats) {
    if (!isFinals(h.eventKind) || h.roundOrder !== TITLE_MATCH_ROUND_ORDER || h.position == null) continue;
    const k = `${h.seasonYear}-${h.eventNumber}`;
    const s = series.get(k) ?? { won: 0, lost: 0 };
    if (h.position === 1) s.won += 1;
    else s.lost += 1;
    series.set(k, s);
  }
  const seriesNote = (h: SurferHeat): string | null => {
    if (!isFinals(h.eventKind) || h.roundOrder !== TITLE_MATCH_ROUND_ORDER) return null;
    const s = series.get(`${h.seasonYear}-${h.eventNumber}`);
    return s ? titleMatchNoteFor(h.seasonYear, s.won, s.lost) : null;
  };
  const columns: Column<SurferHeat>[] = [
    {
      key: "seq",
      header: "#",
      numeric: true,
      className: "w-10",
      // # and Event · round stay pinned while the figures scroll beneath
      // them, so a row is never a line of numbers without its heat.
      sticky: { left: 0, width: 2.5 },
      sortValue: (h) => h.seq,
      render: (h) => <span className="text-fg-subtle">{h.seq ?? EM_DASH}</span>,
    },
    {
      key: "heat",
      header: "Event · round",
      sticky: { left: 2.5 },
      // A floor on the width: without it auto layout squeezed this column to
      // ~90px on a phone and rows ran to nine lines. The inset hairline marks
      // the pinned edge (a border-r stays behind under border-collapse).
      className: "min-w-36 shadow-[inset_-1px_0_0_var(--color-table-hairline)]",
      sortValue: (h) => `${h.seasonYear}${String(h.eventNumber).padStart(2, "0")}${String(h.roundOrder).padStart(2, "0")}`,
      render: (h) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-fg">
            <span className="figures text-fg-subtle">{h.seasonYear}</span>{" "}
            <Link href={`/events/${eventSlug(h.eventSlug, h.seasonYear)}`} className="inline-block py-1 hover:text-link hover:underline">
              {h.eventName}
            </Link>
            {h.eventKind === "wsl_finals" && " "}
            {h.eventKind === "wsl_finals" && (
              <span className="ml-1.5 text-caption tracking-[0.04em] text-structure">
                Finals
              </span>
            )}
          </span>
          <span className="text-caption text-fg-subtle">
            {h.roundName}
            {displayHeatNumber(h.eventKind, h.roundOrder, h.heatNumber) != null && (
              <span className="figures"> · heat {displayHeatNumber(h.eventKind, h.roundOrder, h.heatNumber)}</span>
            )}
            {h.venueName && <span> · {h.venueName}</span>}
          </span>
          {seriesNote(h) && (
            <span data-v="series-note" className="text-caption text-fg-subtle">
              {seriesNote(h)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "position",
      header: "Pos",
      headerLabel: "Published finishing position in the heat",
      numeric: true,
      className: "w-14",
      sortValue: (h) => h.position,
      render: (h) =>
        h.position != null ? (
          <span className={h.position === 1 ? "font-semibold text-fg" : "text-fg-muted"}>
            {ordinal(h.position)}
          </span>
        ) : (
          <span className="text-fg-subtle">{EM_DASH}</span>
        ),
    },
    {
      key: "total",
      header: "Total",
      headerLabel: "Published heat total",
      numeric: true,
      className: "w-16",
      sortValue: (h) => h.heatTotal,
      render: (h) => (
        <span className={h.heatTotal == null ? "text-fg-subtle" : "font-medium text-fg"}>
          {formatScore(h.heatTotal)}
        </span>
      ),
    },
    {
      key: "rides",
      header: "Counting rides",
      headerLabel: "The counting rides as published, in score order",
      numeric: true,
      className: "w-32",
      render: (h) =>
        h.countedScores.length > 0 ? (
          <span className="text-fg-muted">
            {h.countedScores.map((s) => s.toFixed(2)).join(" + ")}
            {h.countingRides != null && h.countedScores.length !== h.countingRides && (
              <span className="text-fg-subtle"> ({h.countedScores.length} of {h.countingRides})</span>
            )}
          </span>
        ) : (
          <span className="text-fg-subtle">{EM_DASH}</span>
        ),
    },
    {
      key: "residual",
      header: "vs Datum",
      headerLabel: "Heat total minus the expected total for this round",
      numeric: true,
      className: "w-24",
      sortValue: (h) => h.residual,
      render: (h) =>
        h.residual != null ? (
          <span className="flex flex-col items-end gap-0.5">
            <span className={h.residual >= 0 ? "font-medium text-fg" : "text-fg-muted"}>
              {h.residual >= 0 ? "+" : ""}
              {fixed(h.residual, 2)}
            </span>
            <span className="text-caption text-fg-subtle">exp {formatScore(h.expected)}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">{EM_DASH}</span>
        ),
    },
    {
      key: "trim",
      header: "Trim · prior",
      headerLabel: "Trim after this heat, and the share of it that is still the starting prior",
      numeric: true,
      // Never hidden at any width -- decision 61, DESIGN_BRIEF 4.1(a).
      className: "w-28",
      sortValue: (h) => h.trimAfter,
      render: (h) =>
        h.trimAfter != null ? (
          <span className="flex flex-col items-end gap-0.5">
            <span className={(h.seq ?? 0) < minHeats ? "text-fg-subtle" : "font-medium text-fg"}>
              {formatTrim(h.trimAfter)}
            </span>
            <span className="text-caption text-fg-subtle">{formatPriorWeight(h.priorWeight)}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">{EM_DASH}</span>
        ),
    },
    {
      key: "conditions",
      header: "Conditions",
      headerLabel: "Published wave height and wind, where the heat's popup was retained",
      className: "w-32",
      render: (h) =>
        h.wind || h.waveHeight ? (
          <span className="text-fg-muted">
            <span className="figures">{h.waveHeight ?? EM_DASH}</span>
            {h.wind && <span className="text-fg-subtle"> · {h.wind}</span>}
          </span>
        ) : (
          <span className="text-fg-subtle">not published</span>
        ),
    },
    {
      key: "progression",
      header: "Progression",
      headerLabel: "The progression note as published, where one is",
      className: "w-40",
      render: (h) =>
        h.progressionText ? (
          <span className="text-caption text-fg-subtle">{h.progressionText}</span>
        ) : (
          <span className="text-fg-subtle">{EM_DASH}</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={heats}
      rowKey={(h) => h.heatEntryId}
      caption="Every heat this surfer surfed, in career order, with the published finishing position, heat total, counting rides, the deviation from Datum and the Trim that followed"
    />
  );
}
