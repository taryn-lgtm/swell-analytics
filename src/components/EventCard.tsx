import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { eventSlug } from "@/lib/slug";

export interface EventCardProps {
  name: string;
  /** events.slug -- repeats across seasons; the URL appends the year. */
  slug: string;
  seasonYear: number;
  eventNumber: number | null;
  venueName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  winnerName?: string | null;
  isPostCut?: boolean;
  eventType?: string | null;
}

function formatDates(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return null;
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

/** Flat hairline event tile — a line in the season's log, not a poster. */
export default function EventCard(props: EventCardProps) {
  const dates = formatDates(props.startDate, props.endDate);
  return (
    <Link
      href={`/events/${eventSlug(props.slug, props.seasonYear)}`}
      className="group block border-t border-hairline-strong py-4 transition-colors hover:border-fg"
    >
      <div className="flex items-center gap-2">
        <span className="figures text-caption font-medium tracking-[0.04em] text-fg-subtle">
          {props.eventType === "finals"
            ? "WSL Finals"
            : `CT ${props.seasonYear}${props.eventNumber != null ? ` · Stop ${String(props.eventNumber).padStart(2, "0")}` : ""}`}
        </span>
        {props.isPostCut && <Badge variant="outline">Post-cut</Badge>}
      </div>
      <h3 className="mt-1.5 font-display text-display-sm font-bold leading-tight tracking-tight text-fg group-hover:text-link">
        {props.name}
      </h3>
      <p className="mt-0.5 text-body-sm text-fg-subtle">
        {[props.venueName, dates].filter(Boolean).join(" · ") || `${props.seasonYear} season`}
      </p>
      <p className="mt-3 border-t border-hairline pt-2 text-body-sm">
        {props.winnerName ? (
          <>
            <span className="text-caption font-semibold tracking-[0.04em] text-fg-subtle">
              Winner&nbsp;
            </span>
            <span className="font-semibold text-fg">{props.winnerName}</span>
          </>
        ) : (
          <span className="text-fg-subtle">Result unavailable</span>
        )}
      </p>
    </Link>
  );
}
