import Link from "next/link";
import Container from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import StatLine from "@/components/ui/StatLine";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import CountryTag from "@/components/CountryTag";
import ChampionBadge from "@/components/ChampionBadge";
import ProvenancePanel, { ProvenanceInline } from "@/components/Provenance";
import ThresholdFilter from "@/components/ThresholdFilter";
import ReadingTheNumbers from "@/components/ReadingTheNumbers";
import TrimLeaderboard, { type TrimLeaderboardRow } from "@/components/TrimLeaderboard";
import Ridgeline from "@/components/Ridgeline";
import { getRidgeSeries } from "@/lib/queries/ridgeline";
import { fixed, formatScore } from "@/lib/format";
import { TITLE_MATCH_ROUND_ORDER, displayHeatNumber, isFinals, seriesResult, titleMatchNote } from "@/lib/finals";
import { eventSlug } from "@/lib/slug";
import { TRIM_MIN_HEATS, formatTrim, formatTrimDelta, formatPriorWeight, num } from "@/lib/trim";
import { getSeasons, seasonsListLabel } from "@/lib/queries/seasons";
import {
  getLatestEvent,
  getMoversAtEvent,
  getTrimCurrent,
  getTrimModelRun,
  type LatestEvent,
  type Mover,
} from "@/lib/queries/home";

/*
 * `/` -- the home route, as PROJECT_PLAN.md's M3 cap names it: Trim
 * leaderboard, movers, latest event, under a plain-language "How to read
 * the numbers" strip. Every number rendered below traces to a v2 row through
 * src/lib/queries/home.ts; the one exception is the approved wording in
 * ReadingTheNumbers, whose three literal figures are documented there.
 *
 * Historical data is frozen between ingests: prerender, revalidate hourly.
 *
 * Rendered by two static routes -- src/app/page.tsx (the threshold view) and
 * src/app/home/all/page.tsx (every surfer). `/?all=1` reaches the second
 * through a beforeFiles rewrite in next.config.ts, so the public URL is
 * unchanged and no route reads the query string. Reading it made the route
 * dynamic and silently voided `revalidate`: every visit rendered from
 * scratch (2.1 to 4.9 s, measured 15 October 2026).
 */

function formatEventDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

export default async function HomeView({ showingAll }: { showingAll: boolean }) {

  const [seasons, trimCurrent, modelRun, latestEvent] = await Promise.all([
    getSeasons(),
    getTrimCurrent(),
    getTrimModelRun(),
    getLatestEvent(),
  ]);
  const rated = trimCurrent.filter((r) => r.nHeats >= TRIM_MIN_HEATS);
  const [movers, ridges] = await Promise.all([
    latestEvent ? getMoversAtEvent(latestEvent.seasonYear, latestEvent.eventNumber) : Promise.resolve([]),
    getRidgeSeries(rated.map((r) => r.surferId)),
  ]);
  const gapsById = new Map(ridges.map((r) => [r.surferId, r.gaps]));
  const ridgeRows = rated.map((r) => ({ slug: r.slug, name: r.fullName, trim: r.trim, gaps: gapsById.get(r.surferId) ?? [] }));
  const ratedHeats = rated.reduce((a, r) => a + r.nHeats, 0);

  const championYearBySurfer = new Map<number, number>();
  for (const s of seasons) {
    if (s.world_champion_surfer_id != null) championYearBySurfer.set(s.world_champion_surfer_id, s.year);
  }

  const eligible = showingAll ? trimCurrent : trimCurrent.filter((r) => r.nHeats >= TRIM_MIN_HEATS);
  const leaderboard: TrimLeaderboardRow[] = eligible.map((r, i) => ({
    rank: i + 1,
    surferId: r.surferId,
    fullName: r.fullName,
    slug: r.slug,
    countryCode: r.countryCode,
    trim: r.trim,
    nHeats: r.nHeats,
    priorWeight: r.priorWeight,
    halfWidth: r.halfWidth,
    lastHeat: r.lastHeat ? { label: `${r.lastHeat.eventName} ${r.lastHeat.seasonYear}` } : null,
    champion:
      championYearBySurfer.has(r.surferId) ? { year: championYearBySurfer.get(r.surferId)! } : null,
  }));
  const aboveThreshold = trimCurrent.filter((r) => r.nHeats >= TRIM_MIN_HEATS).length;
  const leader = leaderboard[0] ?? null;

  const seasonsLabel = seasonsListLabel(seasons);
  const halfLife = num(modelRun?.half_life_heats);
  const pairedT = num(modelRun?.paired_t_vs_shrunk);
  const alpha = num(modelRun?.alpha);
  // The prior's share after n heats is (1 - alpha)^n -- a derivation from the
  // stored alpha, stated so the four-heat example below is not a literal.
  const priorShareAfter = (n: number) => (alpha != null ? Math.pow(1 - alpha, n) : null);
  const fourHeatPrior = priorShareAfter(4);

  return (
    <Container className="py-8 sm:py-10">
      {/* ---- Hero: the ridgeline ------------------------------------- */}
      <header className="pb-12">
        <p className="figures text-caption text-fg-subtle">
          {rated.length} rated surfers · {ratedHeats.toLocaleString("en-GB")} heats surfed between them · Men&apos;s CT{" "}
          {seasonsLabel || "no seasons loaded"}
        </p>
        <h1 className="mt-5 font-serif text-[clamp(3rem,9vw,7.5rem)] font-semibold italic leading-[1.06] tracking-[0.005em] text-fg">
          {/* Past tense: the record ends with the held results, and a reader takes
              present tense as current form (WSL-analyst audit P1-1, 17 Oct 2026). */}
          Who surfed
          <br />
          <span className="text-accent">above the line.</span>
        </h1>
        <p className="mt-6 max-w-[62ch] text-[1.08rem] leading-relaxed text-fg-muted">
          Every line is one surfer&apos;s heats, in order. <b className="font-semibold text-fg">Sand rises</b>{" "}where
          he scored more than Datum expected for that round, <b className="font-semibold text-fg">sea dips</b>{" "}
          where
          he scored less. They&apos;re stacked by Trim, the running measure of how far above or below that line
          each surfer was over their most recent heats in these seasons. Hover a line to lift it out.
        </p>
        {ridgeRows.length > 0 && (
          <div className="mt-10">
            <Ridgeline rows={ridgeRows} />
            <p className="mt-4 text-caption text-fg-subtle">
              Surfers with {TRIM_MIN_HEATS} or more rated heats. Each heat is its gap to Datum from{" "}
              <code className="figures">trim.residual</code>, lightly smoothed over neighbouring heats so a
              line reads as a line; the Trim figure is unsmoothed.
            </p>
          </div>
        )}
      </header>

      {/* ---- How to read the numbers --------------------------------- */}
      <ReadingTheNumbers />

      {/* ---- The ratings ---------------------------------------------- */}
      <div className="mt-12 border-t border-fg pt-3">
        <p className="text-caption tracking-[0.06em] text-fg-subtle">
          Men&apos;s Championship Tour · {seasonsLabel || "no seasons loaded"}
        </p>
        <h2 className="mt-1 font-display text-[clamp(1.4rem,2.6vw,2rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
          Trim, surfer by surfer
        </h2>
        <p className="mt-3 max-w-[72ch] text-body text-fg-muted">
          How far each surfer beats what Datum expects of the round they are surfing,
          weighted so recent heats count more, accumulated heat by heat. The unit is
          points per heat on the 0–20 scale. Read the prior-weight column before reading
          the ranking: every surfer starts at zero and the start never fully washes out.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <StatLine
            label="Leader"
            value={leader ? formatTrim(leader.trim) : "—"}
            unit={leader ? leader.fullName : undefined}
            size="sm"
            accent
          />
          <StatLine
            label="Surfers rated"
            value={String(trimCurrent.length)}
            unit={`${aboveThreshold} at ${TRIM_MIN_HEATS}+ heats`}
            size="sm"
          />
          <StatLine
            label="Heats rated"
            value={modelRun ? modelRun.n_entries.toLocaleString("en-GB") : "—"}
            unit={modelRun ? `${modelRun.n_scored.toLocaleString("en-GB")} in the walk-forward test` : undefined}
            size="sm"
          />
          <StatLine
            label="Half-life"
            value={halfLife != null ? halfLife.toFixed(0) : "—"}
            unit="heats"
            size="sm"
          />
        </div>
      </div>

      {/* ---- Leaderboard --------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader kicker="Leaderboard" title="Latest Trim per surfer" />
        <div className="mb-4">
          <ThresholdFilter
            minHeats={TRIM_MIN_HEATS}
            showingAll={showingAll}
            shown={leaderboard.length}
            total={trimCurrent.length}
          />
        </div>
        <p className="mb-4 max-w-[70ch] text-body-sm text-fg-muted">
          The ± under each Trim is its 95% range from heat-to-heat noise. Where two surfers&apos;
          ranges overlap, the order between them isn&apos;t meaningful: read the table in bands,
          not places. &ldquo;Last heat&rdquo; is when each surfer last surfed a rated heat in these
          seasons.
        </p>
        {leaderboard.length > 0 ? (
          <TrimLeaderboard rows={leaderboard} minHeats={TRIM_MIN_HEATS} />
        ) : (
          <EmptyState
            title="No Trim rows returned"
            detail="v_trim_current answered with zero rows. That is a fact about the connection or its permissions, not about the tour."
          />
        )}
        <ProvenancePanel>
          the last row per surfer in <code className="figures">v_trim_current</code>
          {modelRun && (
            <>
              , model run <span className="figures">{modelRun.id}</span>{" "}(
              <span className="figures">{modelRun.spec}</span>, computed{" "}
              <span className="figures">{modelRun.computed_on}</span>) over{" "}
              <span className="figures">{modelRun.n_entries.toLocaleString("en-GB")}</span>{" "}heat entries and{" "}
              <span className="figures">{modelRun.n_surfers}</span>{" "}surfers
            </>
          )}
          . Prior weight is the share of a surfer&apos;s rating that is still the
          starting prior of zero
          {fourHeatPrior != null && (
            <>
              {" "}
              — a surfer with four heats is{" "}
              <span className="figures">{Math.round(fourHeatPrior * 100)}%</span>{" "}prior and
              their Trim says almost nothing about them
            </>
          )}
          . The{" "}
          <span className="figures">{TRIM_MIN_HEATS}</span>-heat default is a filter,
          not a finding, and the prior does not vary by entry status: a first-event
          wildcard and a returning champion start identically.
          {pairedT != null && (
            <>
              {" "}
              The recency weighting itself earns nothing measurable on two seasons: an
              undecayed shrunk mean of the same residuals is indistinguishable, paired{" "}
              <span className="figures">t = {fixed(pairedT, 3)}</span>
              {modelRun && (
                <>
                  {" "}
                  (RMSE <span className="figures">{num(modelRun.rmse_walkforward)?.toFixed(4)}</span>{" "}
                  against{" "}
                  <span className="figures">{num(modelRun.rmse_shrunk_flat_mean)?.toFixed(4)}</span>)
                </>
              )}
              . Nearly all of Trim&apos;s skill is the prior.
            </>
          )}
        </ProvenancePanel>
      </section>

      {/* ---- Movers + latest event ----------------------------------- */}
      <div className="mt-12 grid gap-10 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <SectionHeader
            kicker="Movers"
            title={latestEvent ? `Trim movement at ${latestEvent.name}` : "Trim movement"}
          />
          <MoversList movers={movers} event={latestEvent} />
        </section>

        <section className="lg:col-span-3">
          <SectionHeader kicker="Latest event" title={latestEvent ? latestEvent.name : "No event"} />
          {latestEvent ? (
            <LatestEventPanel event={latestEvent} />
          ) : (
            <EmptyState title="No events returned" detail="events answered with zero rows." />
          )}
        </section>
      </div>
    </Container>
  );
}

// ---------------------------------------------------------------------

function MoversList({ movers, event }: { movers: Mover[]; event: LatestEvent | null }) {
  if (!event) return <EmptyState title="No event to measure movement across" />;
  if (movers.length === 0) {
    return (
      <EmptyState
        title="No Trim rows at this event"
        detail={`trim holds no rows for ${event.seasonYear} event ${event.eventNumber}.`}
      />
    );
  }
  const maxAbs = Math.max(...movers.map((m) => Math.abs(m.delta)));
  return (
    <Card>
      <ol className="divide-y divide-table-hairline">
        {movers.map((m) => {
          const up = m.delta > 0;
          const width = maxAbs > 0 ? (Math.abs(m.delta) / maxAbs) * 100 : 0;
          return (
            <li key={m.surferId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/surfers/${m.slug}`} className="min-h-6 truncate leading-6 font-medium text-fg hover:text-link hover:underline">
                    {m.fullName}
                  </Link>
                  <CountryTag code={m.countryCode} />
                </div>
                <div className="mt-1 h-[3px] w-full bg-bar-track">
                  <div
                    className={up ? "h-full bg-above" : "h-full bg-below"}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <p className="mt-1 text-caption text-fg-subtle">
                  <span className="figures">{formatTrim(m.trimBefore)}</span> →{" "}
                  <span className="figures">{formatTrim(m.trimAfter)}</span>{" "}over{" "}
                  <span className="figures">{m.heatsAtEvent}</span>{" "}
                  {m.heatsAtEvent === 1 ? "heat" : "heats"} · prior weight{" "}
                  <span className="figures">{formatPriorWeight(m.priorWeight)}</span>
                </p>
              </div>
              <span
                className={`figures text-heading font-medium ${up ? "text-above" : "text-below"}`}
              >
                {formatTrimDelta(m.delta)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="px-4 pb-3">
        <ProvenancePanel>
          the Trim each surfer arrived at{" "}
          <span className="figures">{event.name}</span>{" "}with and the Trim they left with:{" "}
          <code className="figures">trim_before</code>{" "}of their first heat there,{" "}
          <code className="figures">trim_after</code>{" "}of their last, for the{" "}
          <span className="figures">{movers.length}</span>{" "}surfers with a rated heat at the
          event. The window is this one event; a window over a fixed number of heats
          is an open design decision.
        </ProvenancePanel>
      </div>
    </Card>
  );
}

function LatestEventPanel({ event }: { event: LatestEvent }) {
  const dates = formatEventDates(event.startDate, event.endDate);
  const venueDiffers =
    event.heatVenueNames.length > 1 ||
    (event.heatVenueNames.length === 1 && event.heatVenueNames[0] !== event.nominalVenueName);
  return (
    <Card>
      <div className="border-b border-hairline px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="figures text-caption font-medium tracking-[0.04em] text-fg-subtle">
            {event.kind === "wsl_finals"
              ? `WSL Finals · ${event.seasonYear}`
              : `CT ${event.seasonYear} · Stop ${String(event.eventNumber).padStart(2, "0")}`}
          </span>
          {event.occursAfterCut && <Badge variant="outline">Post-cut</Badge>}
        </div>
        <p className="mt-1 text-body-sm text-fg-muted">
          {[
            event.heatVenueNames.length > 0 ? event.heatVenueNames.join(", ") : null,
            dates,
          ]
            .filter(Boolean)
            .join(" · ") || `${event.seasonYear} season`}
          {venueDiffers && event.nominalVenueName && (
            <>
              {" "}
              <ProvenanceInline>(listed venue {event.nominalVenueName})</ProvenanceInline>
            </>
          )}
          {event.heatsWithoutVenue > 0 && (
            <>
              {" "}
              <ProvenanceInline>
                · venue unknown for {event.heatsWithoutVenue} of {event.heatCount} heats
              </ProvenanceInline>
            </>
          )}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatLine label="Rounds" value={String(event.roundCount)} size="sm" />
          <StatLine label="Heats" value={String(event.heatCount)} size="sm" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-caption font-medium tracking-[0.04em] text-fg-subtle">
              Winner
            </span>
            {event.publishedWinner ? (
              <span className="flex items-center gap-2 text-heading font-medium leading-none text-fg">
                <Link href={`/surfers/${event.publishedWinner.slug}`} className="inline-flex min-h-6 items-center hover:text-link hover:underline">
                  {event.publishedWinner.fullName}
                </Link>
                {event.seasonChampion?.surferId === event.publishedWinner.surferId && (
                  <ChampionBadge compact year={event.seasonYear} />
                )}
              </span>
            ) : (
              <span className="text-body-sm text-fg-subtle">Not published on the heat pages</span>
            )}
          </div>
        </div>
      </div>

      <ol className="divide-y divide-table-hairline">
        {event.heats.map((h) => (
          <li key={h.heatId} className="grid gap-x-4 px-4 py-2 sm:grid-cols-[9rem_1fr]">
            <div className="text-caption font-semibold tracking-[0.04em] text-fg-muted">
              {h.roundName ?? `Round ${h.roundOrder}`}
              {displayHeatNumber(event.kind, h.roundOrder, h.heatNumber) != null &&
                event.heats.filter((x) => x.roundOrder === h.roundOrder).length > 1 && (
                  <span className="figures ml-1 font-medium normal-case tracking-normal text-fg-subtle">
                    H{displayHeatNumber(event.kind, h.roundOrder, h.heatNumber)}
                  </span>
                )}
              {/* The Title Match's format and result, once, under its first heat. */}
              {isFinals(event.kind) &&
                h.roundOrder === TITLE_MATCH_ROUND_ORDER &&
                event.heats.find((x) => x.roundOrder === TITLE_MATCH_ROUND_ORDER) === h && (
                  <span className="mt-0.5 block text-caption font-normal normal-case tracking-normal text-fg-subtle">
                    {titleMatchNote(
                      event.seasonYear,
                      seriesResult(event.heats.filter((x) => x.roundOrder === TITLE_MATCH_ROUND_ORDER)),
                    )}
                  </span>
                )}
            </div>
            <ol className="text-stat">
              {h.entries.map((en) => (
                <li key={en.surferId} className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="figures w-4 shrink-0 text-fg-subtle">{en.position ?? "—"}</span>
                    <Link
                      href={`/surfers/${en.slug}`}
                      className={`min-h-6 truncate leading-6 ${en.position === 1 ? "font-medium text-fg" : "text-fg-muted"} hover:text-link hover:underline`}
                    >
                      {en.fullName}
                    </Link>
                    <CountryTag code={en.countryCode} />
                  </span>
                  <span className={`figures shrink-0 ${en.position === 1 ? "font-medium text-fg" : "text-fg-muted"}`}>
                    {formatScore(en.heatTotal)}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <div className="px-4 pb-3">
        <ProvenancePanel>
          every heat of this event as WSL published it, in round order. Placings are WSL&apos;s
          own, never a re-sort by total, and a heat total shown as — was not published, which
          is not the same as a score of zero. The winner is WSL&apos;s published first place;
          no winner is worked out from the final heat.
          Venue is read per heat, not from the event.{" "}
          <Link href={`/events/${eventSlug(event.slug, event.seasonYear)}`} className="text-link hover:underline">
            Full event →
          </Link>
        </ProvenancePanel>
      </div>
    </Card>
  );
}
