"use client";

import { useMemo, useState } from "react";
import ScrollBox from "@/components/ui/ScrollBox";

/**
 * The dense analytical core: semantic, sortable, hairline-ruled. Numeric
 * columns render in the mono face (.figures). Columns with a `sortValue`
 * get a keyboard-operable sort button and aria-sort. Null sort values
 * always sink to the bottom (DNS etc.).
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Plain-text header for aria labels when `header` is a node. */
  headerLabel?: string;
  numeric?: boolean;
  align?: "left" | "right" | "center";
  sortValue?: (row: T) => number | string | null;
  render: (row: T) => React.ReactNode;
  /** Extra classes on every cell in the column. Never a width-dependent
   *  `hidden`: no data column may be hidden at any width (decision 61). */
  className?: string;
  /**
   * Pin the column to the left edge while the table scrolls sideways.
   * `left` is the offset in rem: the sum of the pinned columns before it.
   * A `width` in rem fixes the column exactly, so that sum is a measurement
   * and not a guess at auto layout — give one to every pinned column that
   * has another pinned column after it.
   */
  sticky?: { left: number; width?: number };
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Screen-reader table description. Always provide one. */
  caption: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  rowClassName?: (row: T) => string;
  /** Inject a full-width row after a given data row (e.g. the cut line). */
  renderAfterRow?: (row: T, colSpan: number) => React.ReactNode;
  /** Alternate row tone. Off for tables whose hairlines already carry the
   *  rows, where a stripe on top is a second rule saying the same thing. */
  striped?: boolean;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

function compareValues(a: number | string | null, b: number | string | null) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last, whatever the direction
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  initialSort,
  rowClassName,
  renderAfterRow,
  striped = true,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const cmp = compareValues(sv(a), sv(b));
      // nulls stay last regardless of direction
      if (sv(a) == null || sv(b) == null) return cmp;
      return cmp * dir;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  }

  const alignClass = (col: Column<T>) =>
    col.align === "center"
      ? "text-center"
      : (col.align ?? (col.numeric ? "right" : "left")) === "right"
        ? "text-right"
        : "text-left";

  return (
    // Every table scrolls inside a ScrollBox, which names the scroll in words
    // whenever the table is wider than its box.
    <ScrollBox label={caption}>
      <table className="w-full border-collapse text-stat">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-hairline-strong text-caption tracking-[0.04em] text-fg-subtle">
          <tr>
            {columns.map((col) => {
              const sortable = Boolean(col.sortValue);
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                  }
                  className={`px-1.5 py-2 font-semibold sm:px-2.5 ${alignClass(col)} ${col.className ?? ""} ${
                    col.sticky ? "sticky z-10 bg-paper" : ""
                  }`}
                  style={stickyStyle(col)}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`group -my-1 inline-flex min-h-6 min-w-6 items-center gap-1 py-1 tracking-[0.04em] hover:text-fg ${
                        active ? "text-fg" : ""
                      }`}
                    >
                      {col.header}
                      {/* The idle glyph shows on hover and focus only: five
                          arrows at rest outweigh the labels they sit beside.
                          A touch screen has no hover, so there it stays. */}
                      <span
                        aria-hidden
                        className={`text-[0.6rem] ${
                          active
                            ? ""
                            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100"
                        }`}
                      >
                        {active ? (sort!.dir === "desc" ? "▼" : "▲") : "↕"}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <FragmentRow
              key={rowKey(row)}
              row={row}
              columns={columns}
              alignClass={alignClass}
              rowClassName={rowClassName}
              renderAfterRow={renderAfterRow}
              striped={striped}
            />
          ))}
        </tbody>
      </table>
    </ScrollBox>
  );
}

/* Pinned cells need an opaque ground or the columns scrolling beneath show
   through. The row stripe is set on the <tr> by nth-child, and rows injected
   by renderAfterRow shift that parity, so the pinned cell reads it from the
   same selector rather than from a row index. Both grounds are theme tokens,
   so a pinned cell flips with the rest of the row in dark mode. */
const STICKY_BASE = "sticky z-10 [tr:hover>&]:bg-row-hover";
const STICKY_STRIPED =
  `${STICKY_BASE} [tr:nth-child(odd)>&]:bg-paper [tr:nth-child(even)>&]:bg-table-stripe`;
const STICKY_PLAIN = `${STICKY_BASE} bg-paper`;

function stickyStyle<T>(col: Column<T>): React.CSSProperties | undefined {
  if (!col.sticky) return undefined;
  const left = `${col.sticky.left}rem`;
  if (col.sticky.width == null) return { left };
  const w = `${col.sticky.width}rem`;
  return { left, width: w, minWidth: w, maxWidth: w };
}

function FragmentRow<T>({
  row,
  columns,
  alignClass,
  rowClassName,
  renderAfterRow,
  striped,
}: {
  row: T;
  columns: Column<T>[];
  alignClass: (col: Column<T>) => string;
  rowClassName?: (row: T) => string;
  renderAfterRow?: (row: T, colSpan: number) => React.ReactNode;
  striped: boolean;
}) {
  return (
    <>
      <tr
        className={`border-b border-table-hairline last:border-b-0 ${
          striped ? "odd:bg-paper even:bg-table-stripe" : "bg-paper"
        } hover:bg-row-hover ${
          rowClassName?.(row) ?? ""
        }`}
      >
        {columns.map((col) => (
          <td
            key={col.key}
            className={`px-1.5 py-1.5 sm:px-2.5 ${col.numeric ? "figures" : ""} ${alignClass(col)} ${col.className ?? ""} ${
              col.sticky ? (striped ? STICKY_STRIPED : STICKY_PLAIN) : ""
            }`}
            style={stickyStyle(col)}
          >
            {col.render(row)}
          </td>
        ))}
      </tr>
      {renderAfterRow?.(row, columns.length)}
    </>
  );
}
