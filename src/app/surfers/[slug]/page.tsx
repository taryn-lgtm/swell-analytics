import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Container from "@/components/ui/Container";
import SectionHeader from "@/components/ui/SectionHeader";
import EmptyState from "@/components/ui/EmptyState";
import ProvenancePanel from "@/components/Provenance";
import SurferHeader from "@/components/SurferHeader";
import TrimTimeline from "@/components/TrimTimeline";
import SwellScroll, { type SwellHeat } from "@/components/SwellScroll";
import HeatLog from "@/components/HeatLog";
import ConditionSplits from "@/components/ConditionSplits";
import { formatDerived, formatScore } from "@/lib/format";
import { TRIM_MIN_HEATS } from "@/lib/trim";
import { getTrimModelRun } from "@/lib/queries/home";
import { getAllSurferSlugs, getHeatCoverage, getSurferProfile } from "@/lib/queries/surfer";

/*
 * `/surfers/[slug]` -- PROJECT_PLAN.md's M3 cap: "Trim timeline, heat log,
 * condition splits. Three modules." Three, and no fourth: no compare tool,
 * no head-to-head, no filters.
 *
 * Every number traces to a v2 row through src/lib/queries/surfer.ts. The
 * page holds no literal figure about surfing -- the model run's own
 * numbers come from `trim_model_runs`, the coverage counts from the
 * surfer's own rows, and the threshold from lib/trim's signed constant.
 *
 * Event names in the heat log link to `/events/<slug>-<year>`, built on
 * 30 September. Before that route existed they were deliberately plain
 * text, so as not to add a third page of dead links.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await getAllSurferSlugs();
  return slugs.map((slug) => ({ slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getSurferProfile(slug);
  if (!profile) return { title: "Surfer not found" };
  return {
    title: profile.fullName,
    description: `${profile.fullName} on the Men's Championship Tour: Trim after every heat, the full heat log, and what he scored in each published condition.`,
  };
}

export default async function SurferPage({ params }: Props) {
  const { slug } = await params;
  const [profile, run, coverage] = await Promise.all([
    getSurferProfile(slug),
    getTrimModelRun(),
    getHeatCoverage(),
  ]);
  if (!profile) notFound();

  const rated = profile.heats.filter((h) => h.trimAfter != null);
  const unrated = profile.heats.length - rated.length;
  // The swell needs a career's worth of heats to read as a sea; below the
  // rating threshold the timeline carries the page on its own.
  const swellHeats: SwellHeat[] = rated
    .filter((h) => h.seq != null && h.expected != null && h.heatTotal != null && h.residual != null)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((h) => ({
      year: h.seasonYear,
      event: h.eventName,
      round: h.roundName,
      datum: h.expected!,
      posted: h.heatTotal!,
      gap: h.residual!,
      trim: h.trimAfter!,
      venue: h.venueName,
      waveHeight: h.waveHeight,
      wind: h.wind,
    }));
  const eventsLabel = `${profile.eventsEntered} ${profile.eventsEntered === 1 ? "event" : "events"}`;

  return (
    <>
      <SurferHeader
        fullName={profile.fullName}
        countryCode={profile.countryCode}
        seasons={profile.seasons}
        titleYears={profile.titleYears}
        trim={profile.current?.trim ?? null}
        nHeats={profile.current?.nHeats ?? null}
        priorWeight={profile.current?.priorWeight ?? null}
        minHeats={TRIM_MIN_HEATS}
        belowThreshold={profile.belowThreshold}
        ratedSurfers={profile.ratedSurfers}
        stats={[
          { label: "Heats surfed", value: String(profile.heats.length), unit: eventsLabel },
          {
            label: "Heats won",
            value: String(profile.heatsWon),
            unit: profile.heats.length > 0 ? `of ${profile.heats.length}` : undefined,
          },
          {
            label: "Mean heat total",
            value: formatDerived(profile.meanHeatTotal),
            unit: `over ${profile.ratedHeats}`,
          },
          {
            label: "Best heat",
            value: formatScore(profile.bestHeat?.heatTotal ?? null),
            unit: profile.bestHeat ? profile.bestHeat.eventName : undefined,
          },
        ]}
      />

      {swellHeats.length >= TRIM_MIN_HEATS && (
        <SwellScroll
          fullName={profile.fullName}
          heats={swellHeats}
          seasonsLabel={`CT ${profile.seasons.join(" and ")}`}
        />
      )}

      <Container className="py-8 sm:py-10">
        {profile.heats.length === 0 ? (
          <EmptyState
            title="No heats returned for this surfer"
            detail={`heat_entries answered with zero rows for ${profile.fullName}. That is a fact about the connection or its permissions, not about his career.`}
          />
        ) : (
          <>
            {/* ---- Module 1: the Trim timeline --------------------------- */}
            <section>
              <SectionHeader kicker="Trim timeline" title="Every heat, in career order" />
              {rated.length > 0 ? (
                <TrimTimeline heats={profile.heats} fullName={profile.fullName} />
              ) : (
                <EmptyState
                  title="No rated heats"
                  detail="No heat this surfer surfed carries a published heat total, so there is no Trim series to draw."
                />
              )}
              <ProvenancePanel>
                <code className="figures">trim</code> joined to{" "}
                <code className="figures">datum</code>, in the run&apos;s own ordering —{" "}
                <span className="figures">{rated.length}</span> of this surfer&apos;s{" "}
                <span className="figures">{profile.heats.length}</span> heats
                {unrated > 0 && (
                  <>
                    ; the other <span className="figures">{unrated}</span> carry no published heat
                    total, so they are absent from the line rather than plotted as zero
                  </>
                )}
                . Trim is an EWMA of the deviation from Datum
                {run && (
                  <>
                    {" "}
                    (<span className="figures">{run.spec}</span>, half-life{" "}
                    <span className="figures">{run.half_life_heats}</span> heats, prior{" "}
                    <span className="figures">{run.prior}</span>, computed{" "}
                    <span className="figures">{run.computed_on}</span> over{" "}
                    <span className="figures">{run.n_entries}</span> entries and{" "}
                    <span className="figures">{run.n_surfers}</span> surfers)
                  </>
                )}
                . Datum is a ridge on the round alone, so &ldquo;expected&rdquo; is what that round
                usually yields, not what these conditions or this break usually yield.
                {run && (
                  <>
                    {" "}
                    <strong className="font-semibold text-fg-muted">
                      The decay earns very little:
                    </strong>{" "}
                    walk-forward RMSE <span className="figures">{run.rmse_walkforward}</span>{" "}
                    against <span className="figures">{run.rmse_shrunk_flat_mean}</span> for a
                    shrunk flat mean of the same residuals — paired t{" "}
                    <span className="figures">{run.paired_t_vs_shrunk}</span>. Predicting zero for
                    everyone scores <span className="figures">{run.rmse_predict_zero}</span>. The
                    ordering is what Trim is for; the half-life is not doing the work.
                  </>
                )}
              </ProvenancePanel>
            </section>

            {/* ---- Module 2: the heat log -------------------------------- */}
            <section className="mt-12">
              <SectionHeader
                kicker="Heat log"
                title={`${profile.heats.length} heats across ${eventsLabel}`}
              />
              <HeatLog heats={profile.heats} minHeats={TRIM_MIN_HEATS} />
              <ProvenancePanel>
                <code className="figures">heat_entries</code> joined to{" "}
                <code className="figures">heats</code>, <code className="figures">rounds</code> and{" "}
                <code className="figures">events</code>, one row per heat surfed.{" "}
                <code className="figures">position</code> and{" "}
                <code className="figures">heat_total</code> are published, never derived from the
                rides; a heat with no total renders as an em-dash, never as zero
                {unrated > 0 && (
                  <>
                    {" "}
                    (<span className="figures">{unrated}</span> here)
                  </>
                )}
                . The counting rides are the stored{" "}
                <code className="figures">waves.counted</code> flag in{" "}
                <strong className="font-semibold text-fg-muted">score order, not ride order</strong>
                , which is how WSL publishes the decomposition; they are not the best two, because
                an interference penalty zeroes a counting ride without promoting the next one.{" "}
                <code className="figures">counting_rides</code> belongs to the round, not the event.
                Venue is <code className="figures">heats.venue_id</code> — the break the heat was
                actually surfed at, which for{" "}
                <span className="figures">{profile.heatsWithVenue}</span> of these{" "}
                <span className="figures">{profile.heats.length}</span> heats is stored, and which
                is not always the event&apos;s nominal venue. Round order carries a known gap and no
                tie countback is stored, so a shared position is shown as published.
              </ProvenancePanel>
            </section>

            {/* ---- Module 3: condition splits ---------------------------- */}
            <section className="mt-12">
              <SectionHeader
                kicker="Condition splits"
                title="What he scored, by what the page said"
              />
              <ConditionSplits
                wind={profile.windSplits}
                waveHeight={profile.waveHeightSplits}
                heatsWithConditions={profile.heatsWithConditions}
                totalHeats={profile.heats.length}
              />
              <ProvenancePanel>
                <code className="figures">heats.wave_height_published</code> and{" "}
                <code className="figures">heats.wind_conditions</code>, both read off the retained
                heat popup and shown in the words the page used. Across the database these are held
                for <span className="figures">{coverage.withConditions}</span> of{" "}
                <span className="figures">{coverage.heats}</span> heats, a different population from
                venue, which is held for <span className="figures">{coverage.withVenue}</span>. For
                this surfer that is{" "}
                <span className="figures">{profile.heatsWithConditions}</span> of{" "}
                <span className="figures">{profile.heats.length}</span>. Heats with no published
                conditions are left out of both tables; they are not an
                &ldquo;unknown&rdquo; category.
              </ProvenancePanel>
            </section>
          </>
        )}
      </Container>
    </>
  );
}
