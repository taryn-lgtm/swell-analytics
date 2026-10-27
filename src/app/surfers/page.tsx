import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/ui/Container";
import ProvenancePanel from "@/components/Provenance";
import ScrollBox from "@/components/ui/ScrollBox";
import CountryTag from "@/components/CountryTag";
import { pageMeta } from "@/lib/seo";
import { EM_DASH } from "@/lib/format";
import { formatTrim, formatTrimRange, TRIM_MIN_HEATS } from "@/lib/trim";
import { getSurfersIndex } from "@/lib/queries/indexes";

/*
 * `/surfers` -- every surfer in the data, added in M5 (WSL-analyst audit
 * P1-5): wildcards and replacements were reachable only through /compare.
 * Read through src/lib/queries/indexes.ts; nothing is computed here except
 * the alphabetical order.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Surfers",
  description: "Every surfer in the data: seasons, heats, events, Trim with its range, and when they last surfed.",
  ...pageMeta("/surfers"),
};

export default async function SurfersPage() {
  const rows = (await getSurfersIndex()).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-[clamp(2.6rem,7vw,5.5rem)] font-semibold italic leading-[1.06] tracking-[0.005em] text-fg">
        Surfers
      </h1>
      <p className="mt-4 max-w-[70ch] text-body text-fg-muted">
        Every surfer who surfed a heat in these seasons, including wildcards and injury
        replacements. Trim is shown with its 95% range; with fewer than {TRIM_MIN_HEATS} heats it
        is mostly the starting value and says little.
      </p>
      <ScrollBox label={"Every surfer in the data"} className="mt-8">
        <table className="w-full min-w-[40rem] text-body-sm">
          <caption className="sr-only">Every surfer in the data</caption>
          <thead>
            <tr className="border-b border-hairline text-left text-caption text-fg-subtle">
              <th scope="col" className="py-2 pr-3 font-semibold">Surfer</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Seasons</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Heats</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Events</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Trim</th>
              <th scope="col" className="py-2 font-semibold">Last heat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-table-hairline">
            {rows.map((r) => (
              <tr key={r.id} className={`align-top ${r.heats < TRIM_MIN_HEATS ? "text-fg-muted" : ""}`}>
                <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                  <Link href={`/surfers/${r.slug}`} className="inline-block min-h-6 text-fg hover:text-link hover:underline">
                    {r.name}
                  </Link>
                  <span className="block font-normal">
                    <CountryTag code={r.countryCode} />
                  </span>
                </th>
                <td className="figures py-2.5 pr-3">{r.seasons.join(", ") || EM_DASH}</td>
                <td className="figures py-2.5 pr-3 text-right">{r.heats}</td>
                <td className="figures py-2.5 pr-3 text-right">{r.events}</td>
                <td className="figures py-2.5 pr-3 text-right">
                  {formatTrim(r.trim)}
                  {r.halfWidth != null && (
                    <span className="block text-caption text-fg-subtle">{formatTrimRange(r.halfWidth)}</span>
                  )}
                </td>
                <td className="py-2.5 text-fg-muted">{r.lastHeat ?? EM_DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
      <ProvenancePanel>
        every surfer with a heat entry in these seasons. Heats and events are counted from the
        heat results; Trim and its range are the same figures the home page shows.
      </ProvenancePanel>
    </Container>
  );
}
