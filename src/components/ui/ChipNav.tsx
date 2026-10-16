import Link from "next/link";

/**
 * The segmented filter chip — season, format, minimum heats.
 *
 * WHY THIS EXISTS AS A COMPONENT. The same three-line class idiom was
 * copy-pasted into `/rankings` and `ThresholdFilter`, with its own `on`/`off`
 * constants in each. Two copies of a control's appearance is how decision 61
 * happened: one surface changed and the claim another surface made about it
 * quietly stopped being true. One definition, three call sites.
 *
 * WHY THE OFF STATE IS SUNKEN. Taryn could not tell which season was selected
 * on a phone, 11 September. The state was carried by fill inversion alone —
 * the selected chip inked, the rest sitting on the page background — and a
 * filled box is as readable as "press me" as it is as "this one is on".
 * Recessing the inactive chips onto `paper-sunken` makes the group read as a
 * switch with one segment up, rather than as one button beside some text.
 *
 * Colour is NOT the fix, and coral is not available for it: the accent is
 * reserved for leader, positive movement, live and champion. The fix is
 * tone plus, at every call site, a sentence that says the state in words.
 * DESIGN_BRIEF 4.1(b) already required exactly that of the threshold filter
 * — "visible, labelled, and reversible by the reader" — and the season
 * filter was never held to it.
 */

export const CHIP_BASE = "border px-2.5 py-1 text-stat font-medium transition-colors";
export const CHIP_ON = "border-fg bg-fg text-paper";
export const CHIP_OFF =
  "border-hairline-strong bg-paper-sunken text-fg-subtle hover:border-fg hover:text-fg";

export default function Chip({
  href,
  active,
  first = false,
  figures = false,
  ariaCurrent = "true",
  children,
}: {
  href: string;
  active: boolean;
  /** First chip in the group: no negative margin, so borders collapse cleanly. */
  first?: boolean;
  /** Numerals render in the mono face. */
  figures?: boolean;
  ariaCurrent?: "page" | "true";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? ariaCurrent : undefined}
      className={[
        figures ? "figures" : "",
        first ? "" : "-ml-px",
        CHIP_BASE,
        active ? CHIP_ON : CHIP_OFF,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Link>
  );
}
