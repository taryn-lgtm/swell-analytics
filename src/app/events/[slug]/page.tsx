import ScrollBox from "@/components/ui/ScrollBox";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Container from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import SectionHeader from "@/components/ui/SectionHeader";
import StatLine from "@/components/ui/StatLine";
import EmptyState from "@/components/ui/EmptyState";
import CountryTag from "@/components/CountryTag";
import ChampionBadge from "@/components/ChampionBadge";
import HeatSheet, { type RoundData } from "@/components/HeatSheet";
import ProvenancePanel, { ProvenanceInline } from "@/components/Provenance";
import { EM_DASH, formatPoints, ordinal } from "@/lib/format";
import { TRIM_MIN_HEATS, formatPriorWeight, formatTrim, formatTrimDelta } from "@/lib/trim";
import { byCodepoint, getAllEventParams, getEventPage, type EventPage, type FieldRow } from "@/lib/queries/event";

/*
 * `/events/[slug]` -- PROJECT_PLAN.md's M3 cap: "draw, heat list, Trim
 * movement". Three modules. Every number traces to a v2 row through
 * src/lib/queries/event.ts; the page holds no literal figure about surfing.
 *
 * The slug is `<events.slug>-<season_year>` (see event.ts for why).
 *
 * `data-v` attributes mark the figures the verification script reads back
 * out of the rendered HTML to compare against independent SQL. They carry
 * no values of their own; the text content is what is checked.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  const params = await getAllEventParams();
  return params.map((slug) => ({ slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEventPage(slug);
  if (!ev) return { title: "Event not found" };
  return {
    title: `${ev.name} ${ev.seasonYear}`,
    description: `${ev.name}, ${ev.seasonYear}: the draw, every heat as published, and how Trim moved across the event.`,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fixed month names rather than toLocaleDateString, whose "Sep"/"Sept" varies by ICU build. */
function formatDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

function formatEventDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end && end !== start ? `${formatDate(start)} – ${formatDate(end)}` : formatDate(start);
}

const PARTICIPATION: Record<string, string> = {
  ct_surfer: "CT surfer",
  injury_replacement: "Injury replacement",
  event_wildcard: "Event wildcard",
};

const STATUS: Record<string, string> = {
  competed: "Competed",
  did_not_contest: "Did not contest",
  injured_withdrawal: "Injured withdrawal",
  non_injury_withdrawal: "Non-injury withdrawal",
};

export default async function EventRoute({ params }: Props) {
  const { slug } = await params;
  const ev = await getEventPage(slug);
  if (!ev) notFound();

  const isFinals = ev.kind === "wsl_finals";
  const dates = formatEventDates(ev.startDate, ev.endDate);
  const opening = ev.rounds[0] ?? null;
  const surfedNoEntry = ev.field.filter((f) => f.heatsSurfed > 0 && f.entry == null).length;
  const listedNotSurfed = ev.field.filter((f) => f.heatsSurfed === 0).length;

  const sheet: RoundData[] = ev.rounds.map((r) => ({
    roundKey: r.roundId,
    roundName: r.name,
    countingRides: r.countingRides,
    heats: r.heats.map((h) => ({
      heatNumber: h.heatNumber,
      venueName: h.venueName,
      waveHeight: h.waveHeight,
      wind: h.wind,
      surfers: h.entries.map((en) => ({
        surferName: en.fullName,
        surferSlug: en.slug,
        countryCode: en.countryCode,
        position: en.position,
        countedScores: en.countedScores,
        heatTotal: en.heatTotal,
        progressionText: en.progressionText,
      })),
    })),
  }));

  // Largest rise first; ties by name so the order is not an accident of the query.
  const movers = [...ev.movers].sort(
    (a, b) => Number(b.delta.toFixed(6)) - Number(a.delta.toFixed(6)) || byCodepoint(a.fullName, b.fullName)
  );
  const surfedWithoutTrim = ev.surfedCount - movers.length;

  return (
    <>
      {/* ---- Masthead ------------------------------------------------- */}
      <div className="border-b border-hairline">
        <Container className="pb-6 pt-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="figures text-caption font-medium tracking-[0.04em] text-fg-subtle">
              {isFinals
                ? `WSL Finals · ${ev.seasonYear}`
                : `CT ${ev.seasonYear} · Stop ${String(ev.eventNumber).padStart(2, "0")}`}
            </span>
            {ev.occursAfterCut && !isFinals && <Badge variant="outline">Post-cut</Badge>}
          </div>
          <h1 className="mt-4 font-serif text-[clamp(2.4rem,6.5vw,5rem)] font-medium italic leading-[0.98] tracking-[-0.02em] text-fg">{ev.name}</h1>
          <p className="mt-2 text-body-sm text-fg-muted">
            <span data-v="venues">
              {ev.heatVenues.length > 0
                ? ev.heatVenues.map((v) => `${v.name} (${v.heats} ${v.heats === 1 ? "heat" : "heats"})`).join(", ")
                : "venue unknown"}
            </span>
            {dates && (
              <>
                {" · "}
                <span data-v="dates">{dates}</span>
              </>
            )}
            {ev.heatsWithoutVenue > 0 && (
              <>
                {" "}
                <ProvenanceInline>
                  · venue unknown for <span data-v="venue-unknown">{ev.heatsWithoutVenue}</span> of{" "}
                  {ev.heatCount} heats
                </ProvenanceInline>
              </>
            )}
            {ev.nominalVenueName && (
              <>
                {" "}
                <ProvenanceInline>
                  (listed venue <span data-v="listed-venue">{ev.nominalVenueName}</span>)
                </ProvenanceInline>
              </>
            )}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div data-stat="rounds">
              <StatLine label="Rounds" value={String(ev.rounds.length)} size="sm" />
            </div>
            <div data-stat="heats">
              <StatLine label="Heats" value={String(ev.heatCount)} size="sm" />
            </div>
            <div data-stat="surfed">
              <StatLine label="Surfed" value={String(ev.surfedCount)} unit="surfers" size="sm" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-caption font-medium tracking-[0.04em] text-fg-subtle">Winner</span>
              {ev.winner ? (
                <span className="flex items-center gap-2 text-heading font-medium leading-none text-fg">
                  <Link data-v="winner" href={`/surfers/${ev.winner.slug}`} className="inline-flex min-h-6 items-center hover:text-link hover:underline">
                    {ev.winner.fullName}
                  </Link>
                  {isFinals && ev.seasonChampionId === ev.winner.surferId && (
                    <ChampionBadge compact year={ev.seasonYear} />
                  )}
                </span>
              ) : (
                <span data-v="winner" className="text-body-sm text-fg-subtle">
                  Not published
                </span>
              )}
              <span className="text-caption text-fg-subtle">
                {ev.winner?.source === "finished_position"
                  ? "published finishing position 1"
                  : ev.winner
                    ? "published event placing 1, rankings page"
                    : "no published first place"}
              </span>
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-8 sm:py-10">
        {/* ---- Module 1: the draw ------------------------------------- */}
        <section>
          <SectionHeader kicker="Draw" title={opening ? `${opening.name} and the field` : "The field"} />
          {opening && opening.heats.length > 0 && (
            <div data-v="draw" className="mb-6 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              {opening.heats.map((h) => (
                <div key={h.heatId} data-draw-heat className="border-t border-hairline pt-1.5">
                  <p data-v="draw-label" className="figures text-caption font-semibold tracking-[0.04em] text-fg-muted">
                    {h.heatNumber != null ? `Heat ${String(h.heatNumber).padStart(2, "0")}` : "Heat"}
                  </p>
                  <ul className="text-body-sm">
                    {[...h.entries]
                      .sort((a, b) => byCodepoint(a.fullName, b.fullName))
                      .map((en) => (
                        <li key={en.surferId} data-v="draw-surfer">
                          <Link href={`/surfers/${en.slug}`} className="inline-flex min-h-6 items-center text-fg hover:text-link hover:underline">
                            {en.fullName}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {ev.field.length > 0 ? (
            <FieldTable ev={ev} isFinals={isFinals} />
          ) : (
            <EmptyState
              title="No field returned for this event"
              detail="Neither heat_entries nor event_entries answered with a row. That is a fact about the connection or its permissions, not about the event."
            />
          )}
          <ProvenancePanel>
            the {opening ? <>{opening.name.toLowerCase()} heats as surfed, names in alphabetical order (no seed is stored), and </> : null}
            every surfer in <code className="figures">heat_entries</code> at this event
            {isFinals ? (
              <>
                , with the published <code className="figures">finished_position</code>. The WSL Finals awards no
                ranking points and has no <code className="figures">event_entries</code> rows.
              </>
            ) : (
              <>
                , joined to the <span className="figures">{ev.entryRowCount}</span> rows{" "}
                <code className="figures">event_entries</code> holds for it — the season&apos;s final rankings
                page, which lists placing, points, participation and status. Points are published, never derived
                from a placing.
                {surfedNoEntry > 0 && (
                  <>
                    {" "}
                    <span className="figures">{surfedNoEntry}</span> who surfed have no row there and show as
                    &ldquo;no entry row&rdquo;: the rankings page does not list them, and their participation is
                    not guessed.
                  </>
                )}
                {listedNotSurfed > 0 && (
                  <>
                    {" "}
                    <span className="figures">{listedNotSurfed}</span> listed there surfed no heat, shown with
                    their published status.
                  </>
                )}
              </>
            )}
          </ProvenancePanel>
        </section>

        {/* ---- Module 2: the heat list -------------------------------- */}
        <section className="mt-12">
          <SectionHeader
            kicker="Heat list"
            title={`${ev.heatCount} ${ev.heatCount === 1 ? "heat" : "heats"} across ${ev.rounds.length} ${ev.rounds.length === 1 ? "round" : "rounds"}`}
          />
          {sheet.length > 0 ? (
            <div data-v="heatlist">
              <HeatSheet rounds={sheet} />
            </div>
          ) : (
            <EmptyState title="No rounds returned for this event" />
          )}
          <ProvenancePanel>
            <code className="figures">rounds</code>, <code className="figures">heats</code> and{" "}
            <code className="figures">heat_entries</code>, ordered by the stored{" "}
            <code className="figures">round_order</code> — never generated, so a round WSL does not publish as heats
            is absent rather than invented. Placings are the published <code className="figures">position</code>,
            never a re-sort by total. The counting rides are the stored <code className="figures">waves.counted</code>{" "}
            flag in{" "}
            <strong className="font-semibold text-fg-muted">score order, not ride order</strong>; they are not the best
            two, because an interference penalty zeroes a counting ride without promoting the next one. An em-dash in
            the rides column is a heat whose rides are not loaded, not a surfer who caught nothing
            {ev.heatEntriesWithoutTotal > 0 && (
              <>
                ; <span className="figures">{ev.heatEntriesWithoutTotal}</span> of{" "}
                <span className="figures">{ev.heatEntryCount}</span> entries carry no published heat total and show an
                em-dash, never zero
              </>
            )}
            . Venue and conditions are read per heat from <code className="figures">heats</code>, not from the event.
          </ProvenancePanel>
        </section>

        {/* ---- Module 3: Trim movement -------------------------------- */}
        <section className="mt-12">
          <SectionHeader kicker="Trim movement" title={`How Trim moved across the ${isFinals ? "Finals" : "event"}`} />
          {movers.length > 0 ? (
            <Card>
              <ScrollBox bare label="Trim movement at the event">
                <table data-v="movement" className="w-full border-collapse text-stat">
                  <caption className="sr-only">
                    Trim before each surfer&apos;s first heat at the event and after their last, with the change and
                    the share still carried by the prior
                  </caption>
                  <thead>
                    <tr className="border-b border-hairline text-caption tracking-[0.04em] text-fg-subtle">
                      <th scope="col" className={`px-3 py-2 text-left font-medium ${PIN_EDGE} left-0`}>Surfer</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Rated heats</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Before</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">After</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Change</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Prior</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-table-hairline">
                    {movers.map((m) => {
                      const up = m.delta > 0;
                      const below = m.nHeats < TRIM_MIN_HEATS;
                      return (
                        <tr key={m.surferId} data-mover>
                          <td className={`px-3 py-1.5 ${PIN_EDGE} left-0`}>
                            <span className="flex items-baseline gap-2">
                              <Link data-v="surfer" href={`/surfers/${m.slug}`} className="inline-flex min-h-6 items-center font-medium text-fg hover:text-link hover:underline">
                                {m.fullName}
                              </Link>
                              <CountryTag code={m.countryCode} />
                            </span>
                          </td>
                          <td data-v="heats" className="figures px-3 py-1.5 text-right text-fg-muted">{m.heatsAtEvent}</td>
                          <td data-v="before" className="figures px-3 py-1.5 text-right text-fg-muted">{formatTrim(m.trimBefore)}</td>
                          <td data-v="after" className={`figures px-3 py-1.5 text-right ${below ? "text-fg-subtle" : "text-fg"}`}>
                            {formatTrim(m.trimAfter)}
                          </td>
                          <td
                            data-v="delta"
                            className={`figures px-3 py-1.5 text-right font-medium ${up ? "text-above" : "text-below"}`}
                          >
                            {formatTrimDelta(m.delta)}
                          </td>
                          <td data-v="prior" className="figures px-3 py-1.5 text-right text-fg-subtle">
                            {formatPriorWeight(m.priorWeight)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollBox>
            </Card>
          ) : (
            <EmptyState
              title="No Trim rows at this event"
              detail={`trim holds no rows for ${ev.seasonYear} event ${ev.eventNumber}.`}
            />
          )}
          <ProvenancePanel>
            <code className="figures">trim_before</code> of each surfer&apos;s first heat at this event and{" "}
            <code className="figures">trim_after</code> of their last, for the{" "}
            <span data-v="movers-n" className="figures">{movers.length}</span> of{" "}
            <span className="figures">{ev.surfedCount}</span> surfers with a rated heat here
            {surfedWithoutTrim > 0 && (
              <>
                ; the other <span className="figures">{surfedWithoutTrim}</span> surfed no heat with a published total,
                so there is nothing to rate
              </>
            )}
            . The change is the one subtraction on the page. Prior is the share of the rating still carried by the
            starting prior of zero; below <span className="figures">{TRIM_MIN_HEATS}</span> heats it is the majority,
            and the Trim after is shown faint. Trim is rated on the round alone, so &ldquo;movement&rdquo; is against
            what the round usually yields, not these conditions or this break.
          </ProvenancePanel>
        </section>
      </Container>
    </>
  );
}

/* Pinned cells for this page's two hand-built tables: opaque on the Card's
   ground so figures scrolling beneath do not show through, with an inset
   hairline on the pinned edge (a border stays behind under border-collapse). */
const PIN = "sticky z-10 bg-paper";
const PIN_EDGE = `${PIN} shadow-[inset_-1px_0_0_var(--color-table-hairline)]`;

function FieldTable({ ev, isFinals }: { ev: EventPage; isFinals: boolean }) {
  const place = (f: FieldRow) => {
    const p = isFinals ? f.finishedPosition : f.entry?.eventPlacing ?? null;
    return p != null ? ordinal(p) : EM_DASH;
  };
  return (
    <Card>
      <ScrollBox bare label="The event's field">
        <table data-v="field" className="w-full border-collapse text-stat">
          <caption className="sr-only">
            Everyone who surfed the event or is listed against it on the final rankings page, with the published
            placing, points, participation and status
          </caption>
          <thead>
            <tr className="border-b border-hairline text-caption tracking-[0.04em] text-fg-subtle">
              <th scope="col" className={`px-3 py-2 text-left font-medium ${PIN} left-0 w-20 min-w-20 max-w-20`}>{isFinals ? "Finish" : "Placing"}</th>
              <th scope="col" className={`px-3 py-2 text-left font-medium ${PIN_EDGE} left-20`}>Surfer</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Heats</th>
              {!isFinals && (
                <>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Points</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Entry</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-table-hairline">
            {ev.field.map((f) => (
              <tr key={f.surferId} data-field-row className={f.heatsSurfed === 0 ? "text-fg-subtle" : ""}>
                <td data-v="placing" className={`figures px-3 py-1.5 text-fg-muted ${PIN} left-0 w-20 min-w-20 max-w-20`}>{place(f)}</td>
                <td className={`px-3 py-1.5 ${PIN_EDGE} left-20`}>
                  <span className="flex items-baseline gap-2">
                    <Link data-v="surfer" href={`/surfers/${f.slug}`} className="inline-flex min-h-6 items-center font-medium text-fg hover:text-link hover:underline">
                      {f.fullName}
                    </Link>
                    <CountryTag code={f.countryCode} />
                  </span>
                </td>
                <td data-v="heats" className="figures px-3 py-1.5 text-right">{f.heatsSurfed}</td>
                {!isFinals && (
                  <>
                    <td data-v="points" className="figures px-3 py-1.5 text-right">
                      {f.entry ? formatPoints(f.entry.points) : EM_DASH}
                      {f.entry?.throwawayPublished && (
                        <span data-v="throwaway" className="ml-1.5 text-caption tracking-[0.08em] text-fg-subtle" title="Published as this surfer's dropped event">
                          Throwaway
                        </span>
                      )}
                    </td>
                    <td data-v="participation" className="px-3 py-1.5 text-fg-muted">
                      {f.entry ? (PARTICIPATION[f.entry.participation] ?? f.entry.participation) : "no entry row"}
                    </td>
                    <td className="px-3 py-1.5 text-fg-muted">
                      <span data-v="status">{f.entry ? (STATUS[f.entry.status] ?? f.entry.status) : EM_DASH}</span>
                      {f.entry?.statusNote && (
                        <span className="block text-caption text-fg-subtle">{f.entry.statusNote}</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
    </Card>
  );
}
