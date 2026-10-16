"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { CompareDataset } from "@/lib/queries/compare";
import {
  SMALL_SAMPLE_HEATS,
  VENUE_MIN_HEATS,
  headToHead,
  placingRows,
  summarise,
  venueRows,
  type Rate,
  type SurferSummary,
} from "@/lib/compare";
import { EM_DASH, formatDerived, formatDerivedSigned, formatScore, ordinal } from "@/lib/format";
import { eventSlug } from "@/lib/slug";
import { formatTrim } from "@/lib/trim";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import EmptyState from "@/components/ui/EmptyState";
import ProvenancePanel from "@/components/Provenance";
import { CHIP_BASE, CHIP_OFF, CHIP_ON } from "@/components/ui/ChipNav";

/**
 * The interactive half of `/compare`. State lives in the URL
 * (`?a=<slug>&b=<slug>&season=<year>`) so every comparison is a shareable
 * link, but it is read on the client: the page itself stays static. Updates
 * use history.replaceState, which Next keeps in sync with useSearchParams.
 *
 * Every figure comes from src/lib/compare.ts over the shipped dataset.
 */

const STATUS_TEXT: Record<string, string> = {
  did_not_contest: "did not compete",
  injured_withdrawal: "withdrew, injured",
  non_injury_withdrawal: "withdrew",
};

/**
 * Entry point. The dataset crosses the server/client boundary once, here.
 * The URL-reading half needs a Suspense boundary on a static page, and its
 * fallback is the read-only view at the default pair, which is what the
 * prerendered HTML carries.
 */
export default function CompareTool({
  data,
  defaultA,
  defaultB,
}: {
  data: CompareDataset;
  defaultA: string;
  defaultB: string;
}) {
  return (
    <Suspense fallback={<CompareView data={data} aSlug={defaultA} bSlug={defaultB} season={null} />}>
      <CompareFromUrl data={data} defaultA={defaultA} defaultB={defaultB} />
    </Suspense>
  );
}

/** Reads the pair from the URL and writes it back. */
function CompareFromUrl({
  data,
  defaultA,
  defaultB,
}: {
  data: CompareDataset;
  defaultA: string;
  defaultB: string;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const known = (slug: string | null) =>
    slug != null && data.surfers.some((s) => s.slug === slug) ? slug : null;
  const aSlug = known(params.get("a")) ?? defaultA;
  const bSlug = known(params.get("b")) ?? defaultB;
  const seasonParam = Number(params.get("season"));
  const season = data.seasons.includes(seasonParam) ? seasonParam : null;

  const onChange = (next: { a?: string; b?: string; season?: number | null }) => {
    const q = new URLSearchParams(params.toString());
    q.set("a", next.a ?? aSlug);
    q.set("b", next.b ?? bSlug);
    const s = next.season === undefined ? season : next.season;
    if (s == null) q.delete("season");
    else q.set("season", String(s));
    window.history.replaceState(null, "", `${pathname}?${q.toString()}`);
  };

  return <CompareView data={data} aSlug={aSlug} bSlug={bSlug} season={season} onChange={onChange} />;
}

/**
 * The comparison itself, from explicit props. With no `onChange` it renders
 * read-only: that is the prerendered fallback, which shows real figures for
 * the default pair before JavaScript runs.
 */
export function CompareView({
  data,
  aSlug,
  bSlug,
  season,
  onChange,
}: {
  data: CompareDataset;
  aSlug: string;
  bSlug: string;
  season: number | null;
  onChange?: (next: { a?: string; b?: string; season?: number | null }) => void;
}) {
  const bySlug = useMemo(() => new Map(data.surfers.map((s) => [s.slug, s])), [data.surfers]);
  const a = bySlug.get(aSlug) ?? null;
  const b = bySlug.get(bSlug) ?? null;
  const setParams = (next: { a?: string; b?: string; season?: number | null }) => onChange?.(next);
  const disabled = onChange == null;

  const eventById = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data.events]);
  const venueById = useMemo(() => new Map(data.venues.map((v) => [v.id, v.name])), [data.venues]);
  // Counted from the shipped rows, never typed in (trap 21).
  const venueCoverage = useMemo(() => {
    const all = new Set(data.heats.map((h) => h.h));
    const none = new Set(data.heats.filter((h) => h.v == null).map((h) => h.h));
    return { heats: all.size, noVenue: none.size };
  }, [data.heats]);

  if (!a || !b) {
    return <EmptyState title="Pick two surfers" detail="The surfer list came back empty." />;
  }

  const sa = summarise(data, a.id, season);
  const sb = summarise(data, b.id, season);
  const h2h = headToHead(data, a.id, b.id, season);
  const venues = venueRows(data, a.id, b.id, season);
  const placings = placingRows(data, a.id, b.id, season);
  const scope = season == null ? data.seasons.join(" and ") : String(season);
  const same = a.id === b.id;

  return (
    <div>
      {/* ---- Controls ----------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <SurferPicker
          id="compare-a"
          label="Surfer A"
          value={a.slug}
          surfers={data.surfers}
          onChange={(slug) => setParams({ a: slug })}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setParams({ a: b.slug, b: a.slug })}
          disabled={disabled}
          className={`${CHIP_BASE} ${CHIP_OFF} min-h-11 justify-self-start sm:justify-self-center`}
          aria-label="Swap surfers A and B"
        >
          ⇄ Swap
        </button>
        <SurferPicker
          id="compare-b"
          label="Surfer B"
          value={b.slug}
          surfers={data.surfers}
          onChange={(slug) => setParams({ b: slug })}
          disabled={disabled}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm">
        <span className="text-caption tracking-[0.06em] text-fg-subtle">
          Season
        </span>
        <div role="group" aria-label="Season" className="flex">
          {[null, ...data.seasons].map((s, i) => (
            <button
              key={s ?? "all"}
              type="button"
              aria-pressed={season === s}
              onClick={() => setParams({ season: s })}
              disabled={disabled}
              className={[
                "figures min-h-11",
                i === 0 ? "" : "-ml-px",
                CHIP_BASE,
                season === s ? CHIP_ON : CHIP_OFF,
              ].join(" ")}
            >
              {s ?? "Both"}
            </button>
          ))}
        </div>
        <span className="text-fg-subtle">Showing {scope}</span>
      </div>

      {same && (
        <p className="mt-6 text-body text-fg-muted">
          Surfer A and surfer B are the same person. Pick a different surfer to compare.
        </p>
      )}

      {/* ---- Coverage ----------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader kicker="Coverage" title="What each record is built on" />
        <p className="mb-4 max-w-3xl text-body-sm text-fg-muted">
          Read this first. A surfer with fewer heats in the data has a noisier record, and a
          surfer who missed a season is only being compared on the other one.
        </p>
        <CompareTable
          a={a.name}
          b={b.name}
          rows={[
            { label: "Heats surfed", a: String(sa.heats), b: String(sb.heats) },
            { label: "Events", a: String(sa.events), b: String(sb.events) },
            {
              label: "Seasons in the data",
              a: sa.seasons.join(", ") || EM_DASH,
              b: sb.seasons.join(", ") || EM_DASH,
            },
            {
              label: "Latest Trim",
              a: formatTrim(a.trim),
              b: formatTrim(b.trim),
              note: "Both seasons, whatever the season filter says",
            },
          ]}
        />
      </section>

      {/* ---- Performance -------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader kicker="Performance" title="Heat results and scoring" />
        <CompareTable
          a={a.name}
          b={b.name}
          rows={[
            {
              label: "Won, 3-surfer heats",
              a: rateText(sa.wins3),
              b: rateText(sb.wins3),
              note: "Mostly the Opening Round. Winning one of three is harder than one of two",
              bars: [sa.wins3.pct, sb.wins3.pct],
            },
            {
              label: "Won, 2-surfer heats",
              a: rateText(sa.wins2),
              b: rateText(sb.wins2),
              note: "Mostly the Round of 32 onwards, plus the WSL Finals",
              bars: [sa.wins2.pct, sb.wins2.pct],
            },
            {
              label: "Average heat total",
              a: withN(formatDerived(sa.meanTotal), sa.rated),
              b: withN(formatDerived(sb.meanTotal), sb.rated),
              note: "Out of 20. Flatters surfers who reach late rounds, where scores run higher",
            },
            {
              label: "Average vs Datum",
              a: withN(formatDerivedSigned(sa.meanVsDatum), sa.withDatum),
              b: withN(formatDerivedSigned(sb.meanVsDatum), sb.withDatum),
              note: "Points per heat above or below the typical score for that round. The fairer score comparison",
              tone: [sa.withDatum ? sa.meanVsDatum : null, sb.withDatum ? sb.meanVsDatum : null],
            },
            {
              label: "Best heat total",
              a: formatScore(sa.bestTotal),
              b: formatScore(sb.bestTotal),
            },
          ]}
        />
        <SmallSampleNote a={a.name} b={b.name} sa={sa} sb={sb} />
      </section>

      {/* ---- Head-to-head ------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader kicker="Head-to-head" title={h2hTitle(a.name, b.name, h2h.meetings.length, h2h.aAhead, h2h.bAhead)} />
        {h2h.meetings.length === 0 ? (
          <p className="text-body text-fg-muted">
            {same ? "" : `${a.name} and ${b.name} never surfed in the same heat in ${scope}.`}
          </p>
        ) : (
          <Card>
            <ol className="divide-y divide-table-hairline">
              {h2h.meetings.map((m) => {
                const ev = eventById.get(m.eventId);
                return (
                  <li key={m.heatId} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[1fr_auto]">
                    <div className="text-body-sm">
                      {ev ? (
                        <Link
                          href={`/events/${eventSlug(ev.slug, ev.seasonYear)}`}
                          className="inline-block min-h-6 py-1 font-medium text-link hover:underline"
                        >
                          {ev.name} {ev.seasonYear}
                        </Link>
                      ) : (
                        EM_DASH
                      )}
                      <span className="text-fg-subtle">
                        {" "}
                        · {m.roundName}
                        {m.heatNumber != null ? `, heat ${m.heatNumber}` : ""} · {m.heatSize} surfers
                      </span>
                    </div>
                    <div className="figures text-body-sm">
                      <MeetingSide name={a.name} side={m.a} ahead={m.ahead === "a"} />
                      <span className="text-fg-subtle"> · </span>
                      <MeetingSide name={b.name} side={m.b} ahead={m.ahead === "b"} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
        {h2h.meetings.length > 0 && h2h.meetings.length < 5 && (
          <p className="mt-3 text-caption text-fg-subtle">
            {h2h.meetings.length === 1 ? "One meeting" : `${h2h.meetings.length} meetings`} is too
            few to say who has the edge. It is a record of what happened, not a rating.
          </p>
        )}
      </section>

      {/* ---- Venues ------------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader kicker="Venues" title="Average vs Datum by venue" />
        {venues.length === 0 ? (
          <p className="text-body text-fg-muted">
            No venue where both surfers have at least {VENUE_MIN_HEATS} heats in {scope}.
          </p>
        ) : (
          <CompareTable
            a={a.name}
            b={b.name}
            rows={venues.map((v) => ({
              label: venueById.get(v.venueId) ?? EM_DASH,
              a: withN(formatDerivedSigned(v.a.meanVsDatum), v.a.withDatum),
              b: withN(formatDerivedSigned(v.b.meanVsDatum), v.b.withDatum),
              tone: [v.a.withDatum ? v.a.meanVsDatum : null, v.b.withDatum ? v.b.meanVsDatum : null],
            }))}
          />
        )}
        <ProvenancePanel>
          venues where both surfers have at least <span className="figures">{VENUE_MIN_HEATS}</span>{" "}
          heats. The venue is where each heat was actually surfed, which can differ from the
          event&apos;s named venue. <span className="figures">{venueCoverage.noVenue}</span> of{" "}
          <span className="figures">{venueCoverage.heats}</span> heats have no recorded venue and are
          left out here.
        </ProvenancePanel>
      </section>

      {/* ---- Placings ----------------------------------------------- */}
      <section className="mt-10">
        <SectionHeader kicker="Events" title="Event finishes" />
        {placings.length === 0 ? (
          <p className="text-body text-fg-muted">Neither surfer has an event result in {scope}.</p>
        ) : (
          <CompareTable
            a={a.name}
            b={b.name}
            rows={placings.map((p) => {
              const ev = eventById.get(p.eventId);
              return {
                label: ev ? `${ev.name} ${ev.seasonYear}` : EM_DASH,
                a: placingText(p.a),
                b: placingText(p.b),
              };
            })}
          />
        )}
        <ProvenancePanel>
          regular-season events as WSL published them. Finishes are bands, so 5th is shared by
          four surfers and 9th by eight. The WSL Finals publishes no event finish; its heats are
          counted above. A dash means the surfer was not in that event.
        </ProvenancePanel>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------

function SurferPicker({
  id,
  label,
  value,
  surfers,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  surfers: CompareDataset["surfers"];
  onChange: (slug: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className="text-caption tracking-[0.06em] text-fg-subtle"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-11 w-full border border-hairline-strong bg-paper-raised px-3 text-body text-fg"
      >
        {surfers.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

interface Row {
  label: string;
  a: string;
  b: string;
  note?: string;
  /** Optional 0..100 values drawn as bars under each figure. */
  bars?: [number | null, number | null];
  /** Signed figures: coloured above (sand) or below (sea) the line by sign. */
  tone?: [number | null, number | null];
}

function toneClass(v: number | null | undefined): string {
  if (v == null || v === 0) return "text-fg";
  return v > 0 ? "text-above" : "text-below";
}

function CompareTable({ a, b, rows }: { a: string; b: string; rows: Row[] }) {
  return (
    <Card>
      <table className="w-full table-fixed text-body-sm">
        <caption className="sr-only">
          {a} compared with {b}
        </caption>
        <thead>
          <tr className="border-b border-hairline text-left text-body-sm text-fg">
            <th scope="col" className="w-2/5 px-4 py-2 font-semibold">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col" className="px-4 py-2 font-semibold">
              {a}
            </th>
            <th scope="col" className="px-4 py-2 font-semibold">
              {b}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-table-hairline">
          {rows.map((r) => (
            <tr key={r.label} className="align-top">
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg">
                {r.label}
                {r.note && <span className="mt-0.5 block text-caption font-normal text-fg-subtle">{r.note}</span>}
              </th>
              <td className={`figures px-4 py-2.5 ${toneClass(r.tone?.[0])}`}>
                {r.a}
                {r.bars && <Bar value={r.bars[0]} />}
              </td>
              <td className={`figures px-4 py-2.5 ${toneClass(r.tone?.[1])}`}>
                {r.b}
                {r.bars && <Bar value={r.bars[1]} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Bar({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <div aria-hidden className="mt-1.5 h-1 w-full max-w-40 bg-bar-track">
      <div className="h-full bg-fg-muted" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MeetingSide({
  name,
  side,
  ahead,
}: {
  name: string;
  side: { position: number | null; total: number | null };
  ahead: boolean;
}) {
  return (
    <span className={ahead ? "font-semibold text-fg" : "text-fg-muted"}>
      {name.split(" ").slice(-1)[0]} {formatScore(side.total)}
      {side.position != null && <span className="text-fg-subtle"> ({ordinal(side.position)})</span>}
    </span>
  );
}

function SmallSampleNote({ a, b, sa, sb }: { a: string; b: string; sa: SurferSummary; sb: SurferSummary }) {
  const small = [sa.heats < SMALL_SAMPLE_HEATS ? a : null, sb.heats < SMALL_SAMPLE_HEATS ? b : null].filter(
    Boolean
  );
  if (small.length === 0) return null;
  return (
    <p className="mt-3 text-caption text-fg-subtle">
      {small.join(" and ")} {small.length === 1 ? "has" : "have"} fewer than {SMALL_SAMPLE_HEATS} heats
      here. One good or bad heat moves these figures a long way.
    </p>
  );
}

function rateText(r: Rate): string {
  if (r.of === 0) return `${EM_DASH} (0 heats)`;
  return `${r.won} of ${r.of} (${r.pct}%)`;
}

function withN(value: string, n: number): string {
  return n === 0 ? EM_DASH : `${value} (${n} heats)`;
}

function placingText(p: { placing: number | null; status: string | null } | null): string {
  if (p == null) return EM_DASH;
  if (p.placing != null) return ordinal(p.placing);
  return p.status ? (STATUS_TEXT[p.status] ?? p.status.replace(/_/g, " ")) : EM_DASH;
}

function h2hTitle(a: string, b: string, n: number, aAhead: number, bAhead: number): string {
  if (n === 0) return "Never met";
  const last = (s: string) => s.split(" ").slice(-1)[0];
  const times = n === 1 ? "once" : `${n} times`;
  return `Met ${times}: ${last(a)} ahead ${aAhead}, ${last(b)} ahead ${bAhead}`;
}
