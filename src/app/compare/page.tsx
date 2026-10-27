import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import Container from "@/components/ui/Container";
import EmptyState from "@/components/ui/EmptyState";
import ProvenancePanel from "@/components/Provenance";
import CompareTool from "@/components/CompareTool";
import { getCompareDataset } from "@/lib/queries/compare";
import { defaultPair } from "@/lib/compare";
import { seasonsListLabel } from "@/lib/queries/seasons";

/*
 * `/compare` -- two surfers side by side. Approved by Taryn on 15 October
 * 2026 for the public launch, reversing the M3/M4 "no compare tool before
 * beta" line.
 *
 * Static. The whole tour (1,852 heat entries) is shipped once and every
 * comparison is computed in the browser by src/lib/compare.ts, so picking a
 * pair is instant and the page never reads searchParams on the server
 * (which would make it render per request; see HomeView). The pair lives in
 * the URL, read on the client, so every comparison is still a link.
 *
 * The prerendered HTML carries the default pair (see CompareTool), so the
 * page has real figures before any JavaScript runs.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Compare surfers",
  description:
    "Two Championship Tour surfers side by side: heat wins by heat size, scores against the round's typical score, head-to-head meetings, venues and event finishes.",
  ...pageMeta("/compare"),
};

export default async function ComparePage() {
  const data = await getCompareDataset();
  const pair = defaultPair(data);
  const slugOf = (id: number) => data.surfers.find((s) => s.id === id)?.slug ?? "";

  if (!pair || data.surfers.length < 2) {
    return (
      <Container className="py-10">
        <EmptyState
          title="Not enough surfers to compare"
          detail="The surfers or heat entries came back empty. That is a fact about the connection, not about the tour."
        />
      </Container>
    );
  }
  const [defaultA, defaultB] = [slugOf(pair[0]), slugOf(pair[1])];

  return (
    <Container className="py-8 sm:py-10">
      <div className="pb-6">
        <p className="text-caption tracking-[0.06em] text-fg-subtle">
          Men&apos;s Championship Tour · {seasonsListLabel(data.seasons.map((year) => ({ year })))}
        </p>
        <h1 className="mt-4 font-serif text-[clamp(2.6rem,7vw,5.5rem)] font-semibold italic leading-[1.06] tracking-[0.005em] text-fg">
          Two surfers, side by side.
        </h1>
        <p className="mt-5 max-w-[72ch] text-[1.05rem] leading-relaxed text-fg-muted">
          Pick two surfers. Every figure shows how many heats it rests on, heat wins are split by
          how many surfers were in the heat, and scores are measured against Datum, the typical
          score for that round, because scores rise as an event goes on. The page opens on the
          two surfers who met most often in these seasons.
        </p>
      </div>
      <div className="mt-8">
        <CompareTool data={data} defaultA={defaultA} defaultB={defaultB} />
      </div>
      <ProvenancePanel>
        <span className="figures">{data.heats.length.toLocaleString("en-GB")}</span>{" "}heat entries
        from <span className="figures">{data.events.length}</span>{" "}events, including the WSL
        Finals, and <span className="figures">{data.placings.length}</span>{" "}regular-season event
        results. Wins use the published heat placing. Datum residuals exist for heats with a
        published heat total; the few without one are counted as heats but not scored.
      </ProvenancePanel>
    </Container>
  );
}
