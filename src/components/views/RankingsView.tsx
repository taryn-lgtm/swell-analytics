import Link from "next/link";
import Container from "@/components/ui/Container";
import SectionHeader from "@/components/ui/SectionHeader";
import StatLine, { MeasureBar } from "@/components/ui/StatLine";
import EmptyState from "@/components/ui/EmptyState";
import ChampionBadge from "@/components/ChampionBadge";
import CountryTag from "@/components/CountryTag";
import ProvenancePanel from "@/components/Provenance";
import RankingsTable, { type RankingsFormat } from "@/components/RankingsTable";
import Chip from "@/components/ui/ChipNav";
import { formatPoints, ordinal } from "@/lib/format";
import { TRIM_MIN_HEATS } from "@/lib/trim";
import { getSeasons, seasonsListLabel } from "@/lib/queries/seasons";
import { finalFiveOrder, getSeasonRankings, type RankingRow } from "@/lib/queries/rankings";

/*
 * `/rankings` -- PROJECT_PLAN.md's M3 cap: "cumulative and Final Five
 * formats, plus a Trim column." One route; season and format are URL
 * parameters, so every state is a link and the server component stays the
 * source of truth. Season is the only filter the cap allows.
 *
 * Every number on the page traces to a v2 row through
 * src/lib/queries/rankings.ts. The page holds no literal figure about
 * surfing. Historical data is frozen between ingests: revalidate hourly.
 *
 * The URL keeps its query string (`/rankings?season=2024&format=cumulative`)
 * but no route reads it: beforeFiles rewrites in next.config.ts map each
 * query onto src/app/rankings/[season]/[format], which is prerendered.
 * Reading the query made the route dynamic and silently voided
 * `revalidate` (measured 15 October 2026: no-store, MISS, ~2 s every visit).
 */
function parseFormat(v: string | undefined): RankingsFormat {
  return v === "cumulative" ? "cumulative" : "final-five";
}

export default async function RankingsView({
  season,
  format: formatParam,
}: {
  season?: string;
  format?: string;
}) {
  const seasons = await getSeasons();
  if (seasons.length === 0) {
    return (
      <Container className="py-10">
        <EmptyState title="No seasons returned" detail="seasons answered with zero rows." />
      </Container>
    );
  }
  const requested = season != null ? Number(season) : NaN;
  const seasonYear = seasons.some((s) => s.year === requested) ? requested : seasons[0].year;
  const format = parseFormat(formatParam);

  const data = await getSeasonRankings(seasonYear);
  const seasonsLabel = seasonsListLabel(seasons);

  const rowsByPoints = data?.rows ?? [];
  const rows = format === "final-five" ? finalFiveOrder(rowsByPoints) : rowsByPoints;
  const pointsLeader = rowsByPoints[0] ?? null;
  const finalists = rowsByPoints.filter((r) => r.finalsPlacing != null).sort((a, b) => a.finalsPlacing! - b.finalsPlacing!);
  const seedByPoints = new Map<number, number>(rowsByPoints.slice(0, 5).map((r, i) => [r.surferId, i + 1]));
  const eventsCounted = data?.countedEvents.length ?? 0;
  const surfersWithTrim = rowsByPoints.filter((r) => r.trim != null).length;
  const championRow = rowsByPoints.find((r) => r.champion) ?? null;

  const href = (year: number, fmt: RankingsFormat) => {
    const q = new URLSearchParams();
    q.set("season", String(year));
    if (fmt !== "final-five") q.set("format", fmt);
    return `/rankings?${q.toString()}`;
  };

  return (
    <Container className="py-8 sm:py-10">
      {/* ---- Masthead ------------------------------------------------- */}
      <div className="border-b border-hairline pb-8">
        <p className="figures text-caption text-fg-subtle">
          {seasonYear} · {eventsCounted} events · {rowsByPoints.length} surfers on the points table · Men&apos;s CT{" "}
          {seasonsLabel}
        </p>
        <h1 className="mt-5 font-serif text-[clamp(2.6rem,7.5vw,6.25rem)] font-semibold italic leading-[1.06] tracking-[0.005em] text-fg">
          {championRow ? (
            <>
              {championRow.fullName}, <span className="text-accent">{seasonYear}</span>
              <br />
              <span className="text-accent">world champion.</span>
            </>
          ) : (
            <>
              Rankings, <span className="text-accent">{seasonYear}.</span>
            </>
          )}
        </h1>
        {championRow && (
          <p className="mt-5 max-w-[62ch] text-[1.08rem] leading-relaxed text-fg-muted">
            He finished the regular season {ordinal(championRow.pointsRank)} on points with{" "}
            <span className="figures text-fg">{formatPoints(championRow.points)}</span>
            {championRow.finalsPlacing === 1 ? " and then won the WSL Finals, which decide the title." : "."}
          </p>
        )}
        <p className="mt-4 max-w-[72ch] text-body text-fg-muted">
          Season points as WSL published them, event by event, with each surfer&apos;s
          published throwaway left out. The title is not the points: the five highest
          totals surf the WSL Finals and their finishing order there is the published
          final order. The Trim column is the same latest-Trim figure the leaderboard shows,
          not a season figure.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <StatLine
            label="World champion"
            value={data?.champion ? data.champion.fullName : "—"}
            unit={data?.champion ? "explicit field" : "not recorded"}
            size="sm"
            accent={Boolean(data?.champion)}
          />
          <StatLine
            label="Points leader"
            value={pointsLeader ? formatPoints(pointsLeader.points) : "—"}
            unit={pointsLeader ? pointsLeader.fullName : undefined}
            size="sm"
          />
          <StatLine
            label="Events counted"
            value={String(eventsCounted)}
            unit={data?.finalsEvent ? "plus the Finals" : undefined}
            size="sm"
          />
          <StatLine label="Surfers ranked" value={String(rowsByPoints.length)} size="sm" />
        </div>
      </div>

      {/* ---- Controls ------------------------------------------------- */}
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-body-sm">
        <div className="flex items-center gap-4">
          <span className="text-caption font-semibold tracking-[0.04em] text-fg-subtle">Season</span>
          <nav aria-label="Season" className="flex">
            {[...seasons].sort((a, b) => a.year - b.year).map((s, i) => (
              <Chip
                key={s.year}
                href={href(s.year, format)}
                active={s.year === seasonYear}
                first={i === 0}
                figures
                ariaCurrent="page"
              >
                {s.year}
              </Chip>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-caption font-semibold tracking-[0.04em] text-fg-subtle">Format</span>
          <nav aria-label="Format" className="flex">
            <Chip
              href={href(seasonYear, "final-five")}
              active={format === "final-five"}
              first
              ariaCurrent="page"
            >
              Final Five
            </Chip>
            <Chip
              href={href(seasonYear, "cumulative")}
              active={format === "cumulative"}
              ariaCurrent="page"
            >
              Cumulative
            </Chip>
          </nav>
        </div>
        {/* The chips carry the state in tone; this carries it in words. A
            filled box reads as "press me" as readily as "this one is on",
            and on a phone the masthead's year has scrolled away by the time
            the reader reaches the table. */}
        <p className="basis-full text-fg-subtle">
          <span className="font-semibold text-fg">
            Showing <span className="figures">{seasonYear}</span>,{" "}
            {format === "final-five" ? "published final order" : "points order"}
          </span>
          {format === "final-five"
            ? " — the Finals field by finishing position, then everyone else by points."
            : " — throwaway excluded. Tied totals share a rank; WSL's tiebreak is not held."}
        </p>
      </div>

      {/* ---- Final Five ----------------------------------------------- */}
      {format === "final-five" && data && (
        <section className="mt-8">
          <SectionHeader
            kicker="Final Five"
            title={data.finalsEvent ? data.finalsEvent.name : "WSL Finals"}
          />
          {finalists.length > 0 ? (
            <FinalFive finalists={finalists} seedByPoints={seedByPoints} seasonYear={seasonYear} />
          ) : (
            <EmptyState
              title="No Finals placings published"
              detail={`heat_entries carries no finished_position at a wsl_finals event for ${seasonYear}.`}
            />
          )}
          {data.finalsFieldDisagreement.length > 0 && (
            <p className="mt-3 text-body-sm text-fg-muted">
              The Finals field and the five highest totals disagree for:{" "}
              <span className="font-medium text-fg">{data.finalsFieldDisagreement.join(", ")}</span>. Both are
              shown as stored; nothing is reconciled here.
            </p>
          )}
        </section>
      )}

      {/* ---- Table ---------------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader
          kicker={format === "final-five" ? "Published order" : "Cumulative"}
          title={format === "final-five" ? `${seasonYear} final rankings` : `${seasonYear} by points`}
        />
        {rows.length > 0 ? (
          <RankingsTable rows={rows} format={format} minHeats={TRIM_MIN_HEATS} />
        ) : (
          <EmptyState
            title="No ranking rows returned"
            detail={`event_entries answered with zero rows for ${seasonYear}. That is a fact about the connection or its permissions, not about the tour.`}
          />
        )}
        <ProvenancePanel>
          <code className="figures">event_entries</code>{" "}for the{" "}
          <span className="figures">{eventsCounted}</span> {seasonYear} events that award ranking
          points — <span className="figures">{data?.entryRowCount ?? 0}</span>{" "}rows over{" "}
          <span className="figures">{rowsByPoints.length}</span>{" "}surfers, each row&apos;s{" "}
          <code className="figures">points</code>{" "}and <code className="figures">throwaway_published</code>{" "}
          read off WSL&apos;s final-rankings page, never derived from a placing. A season total is the
          sum with the published throwaway left out
          {data?.throwaway?.form && data.throwaway.eligibility && data.preCutEventCount != null && (
            <>
              {" "}
              (the era&apos;s stored rule: <span className="figures">{data.throwaway.form}</span>,{" "}
              <span className="figures">{data.throwaway.eligibility}</span>, over the{" "}
              <span className="figures">{data.preCutEventCount}</span>{" "}pre-cut events)
            </>
          )}
          . Wildcards hold heat results but no ranking row, so they are absent here, not zero.
          Finals placings are <code className="figures">heat_entries.finished_position</code>{" "}at{" "}
          {data?.finalsEvent ? <span className="figures">{data.finalsEvent.name}</span> : "the WSL Finals"};
          the champion is <code className="figures">seasons.world_champion_surfer_id</code>, never the points
          leader. The mid-season cut
          {data?.cutAfterEvent != null ? (
            <>
              {" "}
              fell after event <span className="figures">{data.cutAfterEvent}</span>{" "}(source grade:{" "}
              <span className="figures">{data.cutSourceGrade ?? "none"}</span>) and its position is not
              stored, so no cut line is drawn
            </>
          ) : (
            " is not recorded for this season"
          )}
          . Trim is <code className="figures">v_trim_current</code>{" "}for{" "}
          <span className="figures">{surfersWithTrim}</span>{" "}of these surfers — their latest rating over
          every season held, shown with its heat count and prior weight; below{" "}
          <span className="figures">{TRIM_MIN_HEATS}</span>{" "}heats it is muted, not hidden.
        </ProvenancePanel>
      </section>
    </Container>
  );
}

// ---------------------------------------------------------------------

function FinalFive({
  finalists,
  seedByPoints,
  seasonYear,
}: {
  finalists: RankingRow[];
  seedByPoints: Map<number, number>;
  seasonYear: number;
}) {
  const topPoints = Math.max(0, ...finalists.map((f) => f.points));
  return (
    <div>
      <ol className="grid gap-x-6 sm:grid-cols-5">
        {finalists.map((f) => {
          const seed = seedByPoints.get(f.surferId);
          return (
            <li
              key={f.surferId}
              className="flex flex-col gap-1.5 border-t-2 py-4"
              style={{ borderTopColor: MEDAL[f.finalsPlacing!] ?? "var(--hairline-strong)" }}
            >
              <p
                className="font-serif text-[2.4rem] font-medium italic leading-none"
                style={{ color: f.finalsPlacing === 1 ? "var(--accent)" : "var(--fg)" }}
              >
                {f.finalsPlacing}
              </p>
              <p className="figures text-caption font-medium tracking-[0.04em] text-fg-subtle">
                {ordinal(f.finalsPlacing!)} · {seed != null ? `${ordinal(seed)} on points` : "outside the top five on points"}
              </p>
              <p className="flex items-center gap-2 font-display text-heading font-bold leading-tight text-fg">
                <Link href={`/surfers/${f.slug}`} className="inline-flex min-h-6 items-center hover:text-link">
                  {f.fullName}
                </Link>
                <CountryTag code={f.countryCode} />
              </p>
              <p className="flex items-baseline gap-1">
                <span className={`figures text-heading font-medium leading-none ${f.champion ? "text-accent-strong" : "text-fg"}`}>
                  {formatPoints(f.points)}
                </span>
                <span className="text-caption font-medium text-fg-subtle">pts</span>
              </p>
              <MeasureBar
                fraction={topPoints > 0 ? f.points / topPoints : 0}
                accent={f.champion}
                label={`${formatPoints(f.points)} of the top seed's ${formatPoints(topPoints)}`}
              />
              {f.champion && (
                <div className="mt-1">
                  <ChampionBadge year={seasonYear} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Medal rules for the top three Finals placings. Gold is the site accent. */
const MEDAL: Record<number, string> = { 1: "var(--accent)", 2: "var(--silver)", 3: "var(--bronze)" };
