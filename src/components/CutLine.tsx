/**
 * Mid-season cut divider for rankings tables (2022+ seasons only).
 * Rendered as a full-width table row via DataTable's renderAfterRow,
 * below the last surfer inside the cut (seasons.cut_line_men).
 * A sanctioned coral use: the cut is a live competitive threshold.
 */
export default function CutLine({
  colSpan,
  cutLine,
  afterEvent,
}: {
  colSpan: number;
  cutLine: number;
  afterEvent: number | null;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-y border-dashed border-accent-strong bg-accent-soft/50 px-2.5 py-1"
      >
        <span className="text-caption font-bold uppercase tracking-[0.18em] text-accent-strong">
          Mid-season cut — top {cutLine} retain their seats
          {afterEvent ? ` after event ${afterEvent}` : ""}
        </span>
      </td>
    </tr>
  );
}
