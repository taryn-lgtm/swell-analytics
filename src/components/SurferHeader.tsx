import Link from "next/link";
import ChampionBadge from "@/components/ChampionBadge";
import CountryTag from "@/components/CountryTag";
import StatLine from "@/components/ui/StatLine";
import { formatPriorWeight, formatTrim } from "@/lib/trim";

export interface SurferHeaderStat {
  label: string;
  value: string;
  unit?: string;
}

export interface SurferHeaderProps {
  fullName: string;
  countryCode: string | null;
  seasons: number[];
  /** Championship years from the explicit `seasons.world_champion_surfer_id`. */
  titleYears?: number[];
  /** The v_trim_current figures. Absent when the surfer has no rated heat. */
  trim: number | null;
  nHeats: number | null;
  priorWeight: number | null;
  minHeats: number;
  /** How many of the rated surfers sit below the threshold, and of how many. */
  belowThreshold: number;
  ratedSurfers: number;
  /** Career figures rendered as the stat-line strip (preformatted). */
  stats?: SurferHeaderStat[];
}

/**
 * Profile masthead: the surfer's data IS the interface. No decorative
 * imagery, nothing pushing figures below the fold.
 *
 * REPOINTED for M3 (DESIGN_BRIEF 6: "SurferHeader | Trim, heats, prior
 * weight; a below-threshold state"). Two things changed and both matter:
 *
 *   - Trim, its heat count and its prior weight are in the masthead, not in
 *     a panel further down. DESIGN_BRIEF 4.1(a) names prior weight the
 *     sharpest of the five things the site must not be able to hide, and a
 *     rating shown without it in the largest type on the page is exactly
 *     the failure it describes.
 *   - The below-threshold state is a banner, ABOVE the figures, because 35
 *     of the 73 rated surfers are below sixteen heats and the brief says
 *     their page "must say so above the fold, not in a footnote".
 *
 * (The old comment here cited `seasons.world_champion_men_id`, a column
 * that does not exist in v2. The field is `world_champion_surfer_id`.)
 */
export default function SurferHeader(props: SurferHeaderProps) {
  const below = props.nHeats != null && props.nHeats < props.minHeats;
  const priorPct =
    props.priorWeight != null ? Math.round(props.priorWeight * 100) : null;

  return (
    <div className="border-b-2 border-fg bg-paper-raised">
      <div className="mx-auto max-w-7xl px-4 pb-0 pt-8 sm:px-6">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption font-medium uppercase tracking-[0.18em] text-fg-subtle">
          {/* Country as WSL publishes it, held for all 73 surfers since
              migration 18 (7 October). The separator stays conditional and
              sits in its own span, so the seasons figure reads "CT …" on its
              own -- scripts/verify_surfers reads it by that prefix. */}
          <CountryTag code={props.countryCode} />
          {props.countryCode && props.seasons.length > 0 && <span aria-hidden="true">·</span>}
          {props.seasons.length > 0 && (
            <span className="figures">
              CT {props.seasons.join(" and ")}
            </span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-display-xl font-bold tracking-tight text-fg">
            {props.fullName}
          </h1>
          {props.titleYears?.map((y) => <ChampionBadge key={y} year={y} />)}
        </div>

        {below && (
          <p className="mt-4 border-l-2 border-accent-strong bg-paper-sunken px-4 py-3 text-body-sm text-fg-muted">
            <strong className="font-semibold text-fg">
              This rating is mostly the starting prior, not this surfer.
            </strong>{" "}
            He has <span className="figures">{props.nHeats}</span>{" "}
            {props.nHeats === 1 ? "rated heat" : "rated heats"}, below the{" "}
            <span className="figures">{props.minHeats}</span>-heat threshold at which a surfer&apos;s
            own record outweighs the prior
            {priorPct != null && (
              <>
                {" "}
                — <span className="figures">{priorPct}%</span> of the figure below is still the
                prior every surfer starts at
              </>
            )}
            .{" "}
            <span className="figures">{props.belowThreshold}</span> of the{" "}
            <span className="figures">{props.ratedSurfers}</span> rated surfers are in the same
            position, which is why{" "}
            <Link href="/" className="text-link hover:underline">
              the leaderboard
            </Link>{" "}
            filters them out by default rather than ranking them.
          </p>
        )}

        <dl className="mt-6 flex flex-wrap divide-x divide-hairline border-t border-hairline">
          <div className="px-5 py-3 first:pl-0">
            <StatLine
              label="Trim"
              value={formatTrim(props.trim)}
              unit="pts per heat"
              size="lg"
              accent={!below && props.trim != null}
            />
          </div>
          <div className="px-5 py-3">
            <StatLine
              label="Rated heats"
              value={props.nHeats != null ? String(props.nHeats) : "—"}
              unit={below ? `below ${props.minHeats}` : `at or above ${props.minHeats}`}
              size="md"
            />
          </div>
          <div className="px-5 py-3">
            <StatLine
              label="Prior weight"
              value={formatPriorWeight(props.priorWeight)}
              unit={priorPct != null ? `${priorPct}% of the rating` : undefined}
              size="md"
              bar={
                props.priorWeight != null
                  ? {
                      fraction: props.priorWeight,
                      label: `${priorPct}% of this rating is the starting prior`,
                    }
                  : undefined
              }
            />
          </div>
          {props.stats?.map((s) => (
            <div key={s.label} className="px-5 py-3">
              <StatLine label={s.label} value={s.value} unit={s.unit} size="md" />
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
