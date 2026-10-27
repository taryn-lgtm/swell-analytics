import Chip from "@/components/ui/ChipNav";

/**
 * The minimum-heats filter, made visible, labelled and reversible
 * (DESIGN_BRIEF §4.1(b)). URL-driven: two links, no client state, so the
 * server component stays the source of truth and the filtered state is
 * shareable. States how many surfers are shown of how many, so the
 * excluded half of the tour is a number rather than an absence.
 *
 * The threshold is NOT signed off as a truth about surfing (decision 42);
 * the copy says what it is -- the point where the record outweighs the
 * prior -- and nothing more.
 */
export default function ThresholdFilter({
  minHeats,
  showingAll,
  shown,
  total,
  basePath = "/",
  allParam = "all",
}: {
  minHeats: number;
  showingAll: boolean;
  shown: number;
  total: number;
  basePath?: string;
  allParam?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm">
      <span className="text-caption font-semibold tracking-[0.04em] text-fg-subtle">
        Minimum heats
      </span>
      <nav aria-label="Minimum heats" className="flex">
        <Chip href={basePath} active={!showingAll} first figures>
          {minHeats}
        </Chip>
        <Chip href={`${basePath}?${allParam}=1`} active={showingAll} figures>
          1
        </Chip>
      </nav>
      <span className="text-fg-subtle">
        <span className="figures">{shown}</span>{" "}of <span className="figures">{total}</span>{" "}surfers
        shown
        {showingAll
          ? " — every surfer, including wildcards whose rating is mostly the starting prior"
          : ` — at ${minHeats} heats a surfer's own record outweighs the starting prior`}
      </span>
    </div>
  );
}
