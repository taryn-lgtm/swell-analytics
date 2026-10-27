import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/ui/Container";
import SectionHeader from "@/components/ui/SectionHeader";
import ProvenancePanel from "@/components/Provenance";
import ScrollBox from "@/components/ui/ScrollBox";
import { pageMeta } from "@/lib/seo";
import { EM_DASH } from "@/lib/format";
import { getEventsIndex } from "@/lib/queries/indexes";

/*
 * `/events` -- every event held, by season, added in M5 (WSL-analyst audit
 * P1-5): until now the event pages were reachable only from other pages'
 * tables. Read through src/lib/queries/indexes.ts; nothing is computed here.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Events",
  description: "Every Championship Tour event held, by season: dates, venue, heats and winner, with WSL's official results.",
  ...pageMeta("/events"),
};

function dates(start: string | null, end: string | null): string {
  if (!start) return EM_DASH;
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return end && end !== start ? `${f(start)} – ${f(end)}` : f(start);
}

export default async function EventsPage() {
  const rows = await getEventsIndex();
  const seasons = [...new Set(rows.map((r) => r.seasonYear))].sort((a, b) => b - a);

  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-[clamp(2.6rem,7vw,5.5rem)] font-semibold italic leading-[1.06] tracking-[0.005em] text-fg">
        Events
      </h1>
      <p className="mt-4 max-w-[70ch] text-body text-fg-muted">
        Every event in the data, in calendar order. Each links to its draw, heats and Trim
        movement, and to WSL&apos;s own results page.
      </p>
      {seasons.map((season) => (
        <section key={season} className="mt-10">
          <SectionHeader title={String(season)} />
          <ScrollBox label={`Events in the ${season} season`}>
            <table className="w-full min-w-[40rem] text-body-sm">
              <caption className="sr-only">Events in the {season} season</caption>
              <thead>
                <tr className="border-b border-hairline text-left text-caption text-fg-subtle">
                  <th scope="col" className="w-12 py-2 pr-3 font-semibold">Stop</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Event</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Dates</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Heats</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Winner</th>
                  <th scope="col" className="py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-table-hairline">
                {rows
                  .filter((r) => r.seasonYear === season)
                  .map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="figures py-2.5 pr-3 text-fg-subtle">{r.eventNumber}</td>
                      <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                        <Link href={`/events/${r.param}`} className="inline-block min-h-6 text-fg hover:text-link hover:underline">
                          {r.name}
                        </Link>
                        {r.venue && <span className="block text-caption font-normal text-fg-subtle">{r.venue}</span>}
                      </th>
                      <td className="figures py-2.5 pr-3 text-fg-muted">{dates(r.startDate, r.endDate)}</td>
                      <td className="figures py-2.5 pr-3 text-right text-fg-muted">{r.heats}</td>
                      <td className="py-2.5 pr-3">
                        {r.winner ? (
                          <Link href={`/surfers/${r.winner.slug}`} className="inline-block min-h-6 text-fg hover:text-link hover:underline">
                            {r.winner.name}
                          </Link>
                        ) : (
                          <span className="text-fg-subtle">{EM_DASH}</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {r.wslUrl ? (
                          <a href={r.wslUrl} className="inline-block min-h-6 text-link underline" rel="noopener" target="_blank">
                            WSL results
                          </a>
                        ) : (
                          <span className="text-fg-subtle">{EM_DASH}</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </ScrollBox>
        </section>
      ))}
      <ProvenancePanel>
        events, heats and published results as held for these seasons. The venue is the
        event&apos;s named venue; some heats were surfed at a second break, which each event page
        shows. For the WSL Finals the winner is the published finishing position.
      </ProvenancePanel>
    </Container>
  );
}
