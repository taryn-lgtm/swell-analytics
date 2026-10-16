import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import StatLine from "@/components/ui/StatLine";
import ProvenancePanel from "@/components/Provenance";
import { formatTrim, formatPriorWeight, num, TRIM_MIN_HEATS } from "@/lib/trim";
import { EM_DASH } from "@/lib/format";
import { getSeasons, seasonsListLabel } from "@/lib/queries/seasons";
import { getAboutData } from "@/lib/queries/about";

/*
 * `/about` -- the definition of beta's "about page explaining the
 * methodology honestly, including its limits" (PROJECT_PLAN.md).
 *
 * It is NOT one of the M3 scope cap's four routes. The cap limits depth --
 * "Scaffolds are cheap; depth is what eats weeks" -- and names four DATA
 * routes; the beta definition names this page separately from them. It
 * carries no query of its own beyond the figures it states and no season
 * logic. If it ever grows either, it has become a fifth route.
 *
 * Every number on this page traces to a v2 row through
 * src/lib/queries/about.ts. The page holds no literal figure about surfing,
 * which matters more here than anywhere else on the site: a limit that is
 * typed by hand is a limit that silently stops being true.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "About",
  description:
    "What Datum and Trim measure, what the data covers, and the three limits that matter before reading any figure on this site.",
};

/** A share as a percentage to the nearest point, for prose. */
function pct(share: number | null): string {
  if (share == null) return EM_DASH;
  return `${Math.round(share * 100)}%`;
}

/** One decimal, for a mean. */
function mean1(v: number | null): string {
  if (v == null) return EM_DASH;
  return v.toFixed(1);
}

function n(v: number | null | undefined): string {
  if (v == null) return EM_DASH;
  return v.toLocaleString("en-GB");
}

export default async function AboutPage() {
  const [seasons, data] = await Promise.all([getSeasons(), getAboutData(TRIM_MIN_HEATS)]);
  const { trim, trimRun, datumRun, coverage, priorShareAfter } = data;

  const seasonsLabel = seasonsListLabel(seasons);
  const halfLife = num(trimRun?.half_life_heats);
  const rmseTrim = num(trimRun?.rmse_walkforward);
  const rmseShrunk = num(trimRun?.rmse_shrunk_flat_mean);
  const rmseZero = num(trimRun?.rmse_predict_zero);
  const pairedT = num(trimRun?.paired_t_vs_shrunk);
  const priorAtThreshold = priorShareAfter(TRIM_MIN_HEATS);
  const priorAtFour = priorShareAfter(4);
  const datumR2 = num(datumRun?.r2_vs_intercept);
  const datumRmse = num(datumRun?.rmse_loeo);
  const datumRmseIntercept = num(datumRun?.rmse_intercept_loeo);

  return (
    <Container className="py-8 sm:py-10">
      {/* ---- Masthead --------------------------------------------------- */}
      <div className="border-b border-hairline pb-6">
        <p className="text-caption tracking-[0.06em] text-fg-subtle">
          Men&apos;s Championship Tour · {seasonsLabel || "no seasons loaded"}
        </p>
        <h1 className="mt-4 font-serif text-[clamp(2.6rem,7vw,5.5rem)] font-medium italic leading-[0.95] tracking-[-0.02em] text-fg">
          How the numbers are made.
        </h1>
        <p className="mt-3 max-w-3xl text-body text-fg-muted">
          This site holds every heat of the Men&apos;s Championship Tour seasons named above,
          as the World Surf League published them, and adds two measures of its own:{" "}
          <strong className="font-medium text-fg">Datum</strong>, what a round is worth, and{" "}
          <strong className="font-medium text-fg">Trim</strong>, how far a surfer beats it.
          Results are reproduced; Datum and Trim are derived, and this page is where the
          derivation is opened up rather than asserted.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <StatLine label="Seasons held" value={String(seasons.length)} unit={seasonsLabel} size="sm" />
          <StatLine label="Events" value={n(coverage.events)} size="sm" />
          <StatLine label="Heats" value={n(coverage.heats)} size="sm" />
          <StatLine label="Rides" value={n(coverage.waves)} size="sm" />
        </div>
      </div>

      {/* ---- The three limits ------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader
          kicker="Read this first"
          title="Three limits"
        />
        <p className="mb-5 max-w-3xl text-body text-fg-muted">
          Every figure on this site is true to a row, but a figure being correct is not the
          same as a figure being strong. These three shape what any Trim number can
          honestly be taken to mean.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* (1) Which seasons */}
          <Card className="p-5">
            <p className="text-caption tracking-[0.06em] text-fg-subtle">
              One · coverage
            </p>
            <h3 className="mt-1 font-display text-heading font-bold text-fg">
              {seasonsLabel} only
            </h3>
            <p className="mt-3 text-body-sm leading-relaxed text-fg-muted">
              The database holds{" "}
              <span className="figures">{seasons.length}</span> season
              {seasons.length === 1 ? "" : "s"} and nothing else. Earlier Championship Tour
              years are not loaded, so nothing here should be read as a career record or an
              all-time standing. Where the site names its coverage it lists the seasons one
              by one rather than as a range, because a range implies the years between it
              are held.
            </p>
            <ProvenancePanel label="Computed over">
              the <code className="figures">seasons</code> table, which is itself the
              coverage statement: <span className="figures">{n(coverage.events)}</span> events,{" "}
              <span className="figures">{n(coverage.heats)}</span> heats and{" "}
              <span className="figures">{n(coverage.surfers)}</span> surfers across them.
            </ProvenancePanel>
          </Card>

          {/* (2) The threshold */}
          <Card className="p-5">
            <p className="text-caption tracking-[0.06em] text-fg-subtle">
              Two · the threshold
            </p>
            <h3 className="mt-1 font-display text-heading font-bold text-fg">
              <span className="figures">{TRIM_MIN_HEATS}</span> heats, filtered by default
            </h3>
            <p className="mt-3 text-body-sm leading-relaxed text-fg-muted">
              The leaderboard shows{" "}
              <span className="figures">{n(trim.atThreshold)}</span> of{" "}
              <span className="figures">{n(trim.rated)}</span> rated surfers by default,
              hiding those below <span className="figures">{TRIM_MIN_HEATS}</span> heats.
              That is <strong className="font-medium text-fg">a filter you can switch
              off</strong>, not a silent cut: the underlying view applies no threshold, the
              count of what is hidden is always on screen, and every table that shows a Trim
              figure shows its heat count and prior weight beside it. Prior weight is never
              hidden to make a ranking look cleaner.
            </p>
            <ProvenancePanel label="Computed over">
              <span className="figures">{n(trim.rated)}</span> rows of{" "}
              <code className="figures">v_trim_current</code>. At{" "}
              <span className="figures">{TRIM_MIN_HEATS}</span> heats the starting prior is
              still <span className="figures">{formatPriorWeight(priorAtThreshold)}</span> of
              the rating — the first count at which a surfer&apos;s own record
              outweighs it. The threshold is a presentation choice and is not signed off.
            </ProvenancePanel>
          </Card>

          {/* (3) The prior */}
          <Card className="p-5">
            <p className="text-caption tracking-[0.06em] text-fg-subtle">
              Three · the prior
            </p>
            <h3 className="mt-1 font-display text-heading font-bold text-fg">
              Everyone starts identically
            </h3>
            <p className="mt-3 text-body-sm leading-relaxed text-fg-muted">
              Every surfer&apos;s Trim begins at zero and moves from there.{" "}
              <strong className="font-medium text-fg">The prior does not vary by entry
              status</strong>: a wildcard at their first event and a returning world champion
              start from exactly the same place, and the rating cannot tell you which is
              which. A surfer with four heats is{" "}
              <span className="figures">{pct(priorAtFour)}</span> starting prior, so their
              Trim says almost nothing about them yet.
            </p>
            <ProvenancePanel label="Computed over">
              <code className="figures">trim_model_runs</code> — one run, prior{" "}
              <span className="figures">{formatTrim(num(trimRun?.prior))}</span>, applied to
              every surfer alike. A prior that varies by entry status was specified, deferred,
              and is not in this version.
            </ProvenancePanel>
          </Card>
        </div>
      </section>

      {/* ---- How thin the data is --------------------------------------- */}
      <section className="mt-12">
        <SectionHeader kicker="The honest part" title="How thin this is" />
        <Card className="p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <StatLine label="Mean heats per surfer" value={mean1(trim.meanHeats)} size="sm" />
            <StatLine label="Most" value={n(trim.maxHeats)} unit="heats" size="sm" />
            <StatLine label="Fewest" value={n(trim.minHeats)} unit="heats" size="sm" />
            <StatLine label="Below 10 heats" value={n(trim.belowTen)} unit={`of ${n(trim.rated)}`} size="sm" />
          </div>
          <p className="mt-5 max-w-3xl text-body-sm leading-relaxed text-fg-muted">
            A rating wants a long record. This one has a mean of{" "}
            <span className="figures">{mean1(trim.meanHeats)}</span> heats per surfer, and{" "}
            <span className="figures">{n(trim.belowTen)}</span> of{" "}
            <span className="figures">{n(trim.rated)}</span> rated surfers sit below ten.
            At that size the starting prior and the threshold matter more, not less —
            which is why both are shown on every table rather than folded away into a
            methodology note.
          </p>
          <p className="mt-3 max-w-3xl text-body-sm leading-relaxed text-fg-muted">
            The recency weighting earns nothing measurable at this size, and the site says so
            rather than implying otherwise. Trim decays older heats with a half-life of{" "}
            <span className="figures">{n(halfLife)}</span> heats; an undecayed shrunk mean of
            the same residuals is indistinguishable from it{" "}
            {rmseTrim != null && rmseShrunk != null && (
              <>
                (<span className="figures">{rmseTrim.toFixed(4)}</span> against{" "}
                <span className="figures">{rmseShrunk.toFixed(4)}</span>, paired{" "}
                <span className="figures">t = {pairedT?.toFixed(3) ?? EM_DASH}</span>)
              </>
            )}
            . Nearly all of Trim&apos;s skill is the prior.
          </p>
          <ProvenancePanel label="Computed over">
            <code className="figures">trim_model_runs</code> run{" "}
            <span className="figures">{trimRun?.spec ?? EM_DASH}</span>, computed{" "}
            <span className="figures">{trimRun?.computed_on ?? EM_DASH}</span> over{" "}
            <span className="figures">{n(trimRun?.n_entries)}</span> rated heat entries and{" "}
            <span className="figures">{n(trimRun?.n_surfers)}</span> surfers, of which{" "}
            <span className="figures">{n(trimRun?.n_scored)}</span> were scored in the
            walk-forward test. Against predicting zero for everyone, RMSE{" "}
            <span className="figures">{rmseZero?.toFixed(4) ?? EM_DASH}</span>. The mean above
            is over the <span className="figures">{n(trim.totalRatedHeats)}</span> heats Trim
            actually rests on, not over all{" "}
            <span className="figures">{n(coverage.entries)}</span> heat entries.
          </ProvenancePanel>
        </Card>
      </section>

      {/* ---- What the two measures are ---------------------------------- */}
      <section className="mt-12">
        <SectionHeader kicker="The measures" title="Datum and Trim" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-display text-heading font-bold text-fg">Datum</h3>
            <p className="mt-2 text-body-sm leading-relaxed text-fg-muted">
              What a heat is worth before anyone surfs it — the score expected of the
              round being surfed. A quarter-final is not a seeding round, and comparing raw
              heat totals across them flatters whoever surfed the easier draw. Datum is the
              baseline that difference is measured from.
            </p>
            <p className="mt-3 text-body-sm leading-relaxed text-fg-muted">
              It was specified to account for break, round, wave type and field. On
              measurement it earned only the round: the other terms did not improve it on two
              seasons, so they are not in it. The specification was corrected to match the
              measurement rather than the other way round.
            </p>
            <ProvenancePanel label="Computed over">
              <code className="figures">datum_model_runs</code> run{" "}
              <span className="figures">{datumRun?.spec ?? EM_DASH}</span>, computed{" "}
              <span className="figures">{datumRun?.computed_on ?? EM_DASH}</span> over{" "}
              <span className="figures">{n(datumRun?.n_entries)}</span> entries across{" "}
              <span className="figures">{n(datumRun?.n_events)}</span> events. Leave-one-event-out
              RMSE <span className="figures">{datumRmse?.toFixed(4) ?? EM_DASH}</span> against an
              intercept-only{" "}
              <span className="figures">{datumRmseIntercept?.toFixed(4) ?? EM_DASH}</span>
              {datumR2 != null && (
                <>
                  , R² <span className="figures">{datumR2.toFixed(4)}</span> against that intercept
                </>
              )}
              .
            </ProvenancePanel>
          </Card>

          <Card className="p-5">
            <h3 className="font-display text-heading font-bold text-fg">Trim</h3>
            <p className="mt-2 text-body-sm leading-relaxed text-fg-muted">
              How far a surfer beats their Datum, accumulated heat by heat, with recent heats
              weighted more heavily. The unit is points per heat on the 0–20 scale:
              a Trim of {formatTrim(1)} means roughly one point per heat better than the round
              expected. It is a rating, not a prediction, and it is not a ranking —
              the world title is decided by the WSL&apos;s own rules, which this site
              reproduces and never recomputes.
            </p>
            <p className="mt-3 text-body-sm leading-relaxed text-fg-muted">
              Trim is append-only: each heat adds a row rather than overwriting one, so a
              surfer&apos;s rating can be read as it stood at any point rather than only as it
              stands now.
            </p>
            <ProvenancePanel label="Computed over">
              <span className="figures">{n(trim.totalRatedHeats)}</span> rated heats, one row
              per surfer per heat, ordered{" "}
              <span className="figures">{trimRun?.ordering ?? EM_DASH}</span>.
            </ProvenancePanel>
          </Card>
        </div>
      </section>

      {/* ---- Coverage per figure ---------------------------------------- */}
      <section className="mt-12">
        <SectionHeader kicker="Coverage" title="What is missing" />
        <Card className="p-5 sm:p-6">
          <p className="mb-5 max-w-3xl text-body-sm leading-relaxed text-fg-muted">
            Not every heat carries every field. Where a figure is absent the site shows an
            em-dash rather than a zero, because an unmeasured heat and a scoreless one are
            different things. These are the populations behind the site&apos;s main figures.
          </p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <StatLine
              label="Heat total"
              value={n(coverage.entriesWithTotal)}
              unit={`of ${n(coverage.entries)} entries`}
              size="sm"
            />
            <StatLine
              label="Venue"
              value={n(coverage.heatsWithVenue)}
              unit={`of ${n(coverage.heats)} heats`}
              size="sm"
            />
            <StatLine
              label="Published avg score"
              value={n(coverage.heatsWithAvgScore)}
              unit={`of ${n(coverage.heats)} heats`}
              size="sm"
            />
            <StatLine label="Rides" value={n(coverage.waves)} size="sm" />
          </div>
          <ProvenancePanel label="Computed over">
            exact counts against <code className="figures">heats</code>,{" "}
            <code className="figures">heat_entries</code> and{" "}
            <code className="figures">waves</code> at render time. Venue is a property of the
            heat rather than the event, because three events ran at two breaks.
          </ProvenancePanel>
        </Card>
      </section>

      {/* ---- Where the numbers come from -------------------------------- */}
      <section className="mt-12">
        <SectionHeader kicker="Provenance" title="Where the numbers come from" />
        <Card className="p-5 sm:p-6">
          <ul className="max-w-3xl space-y-3 text-body-sm leading-relaxed text-fg-muted">
            <li>
              <strong className="font-medium text-fg">One source.</strong> Results, points and
              placings are as published on worldsurfleague.com. Where the published figure and
              a derived one disagree, the published figure wins and the disagreement is
              recorded rather than smoothed over.
            </li>
            <li>
              <strong className="font-medium text-fg">Published, never inferred.</strong> Season
              points are the published points with the published throwaway left out, never
              reconstructed from finishing positions. A winner is named only where a finishing
              position of first is published; for regular events it is not, so none is shown.
            </li>
            <li>
              <strong className="font-medium text-fg">Every row keeps its receipt.</strong> Each
              row records the retrieved page it came from, and those pages are kept, so any
              figure here can be traced back to the bytes it was read from.
            </li>
            <li>
              <strong className="font-medium text-fg">Ties are not broken.</strong>{" "}
              Where two
              surfers finish a season on the same points the site shows a shared rank. The
              WSL&apos;s tiebreak is not in the database and is not guessed at.
            </li>
          </ul>
        </Card>
      </section>

      {/* ---- What this is not ------------------------------------------- */}
      <section className="mt-12">
        <SectionHeader kicker="Scope" title="What this is not" />
        <Card className="p-5 sm:p-6">
          <ul className="max-w-3xl space-y-3 text-body-sm leading-relaxed text-fg-muted">
            <li>
              Not affiliated with, endorsed by, or connected to the World Surf League. An
              independent project.
            </li>
            <li>
              Not a prediction. Trim describes heats that have been surfed; it forecasts
              nothing.
            </li>
            <li>
              Not the Women&apos;s Championship Tour, and not the Challenger Series —
              the Men&apos;s Championship Tour only, for the seasons named above.
            </li>
            <li>
              Not a replacement for the official rankings. For the standings of record, see the
              WSL.
            </li>
          </ul>
          <p className="mt-5 text-body-sm text-fg-muted">
            <Link href="/" className="inline-flex min-h-6 items-center text-link hover:underline">
              Trim leaderboard
            </Link>
            {"  ·  "}
            <Link href="/rankings" className="inline-flex min-h-6 items-center text-link hover:underline">
              Season rankings
            </Link>
          </p>
        </Card>
      </section>
    </Container>
  );
}
