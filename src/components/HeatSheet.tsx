import Link from "next/link";
import CountryTag from "@/components/CountryTag";
import { EM_DASH, formatScore } from "@/lib/format";

export interface HeatSurferRow {
  surferName: string;
  surferSlug: string | null;
  countryCode: string | null;
  /** Published placing in the heat. Never re-ranked by total. */
  position: number | null;
  /**
   * The stored counting rides (`waves.counted`), in SCORE order (trap 15).
   * Empty when no ride rows are loaded for the entry -- which is a gap in
   * the ride data, not a surfer who caught nothing.
   */
  countedScores: number[];
  /** null = no published total: an em-dash, never 0. */
  heatTotal: number | null;
  progressionText: string | null;
}

export interface HeatData {
  heatNumber: number | null;
  /** heats.venue_id's name; null renders as "venue unknown", never the event's venue. */
  venueName: string | null;
  waveHeight: string | null;
  wind: string | null;
  surfers: HeatSurferRow[];
}

export interface RoundData {
  roundKey: string | number;
  roundName: string;
  /** rounds.counting_rides -- belongs to the round, not the event (trap 8). */
  countingRides: number | null;
  heats: HeatData[];
}

/**
 * The dense heat sheet: one semantic table per heat, grouped by round.
 * Every cell is published: position, the counting rides as the stored flag
 * reads them (never the best two -- trap 14), the heat total and the
 * progression note. A pair shorter than the round's counting_rides says
 * so rather than padding with a zero.
 *
 * REWRITTEN for v2 on 30 September. The v1 version took `wave1`/`wave2` and
 * an `advanced` flag; `heat_entries.advanced_to_round_id` is NULL on all
 * 1,852 rows, so that tick would have been derived, and a fixed two-wave
 * grid rendered a missing ride as "DNS".
 */
export default function HeatSheet({ rounds }: { rounds: RoundData[] }) {
  return (
    <div className="space-y-8">
      {rounds.map((round) => (
        <section key={round.roundKey} aria-label={round.roundName}>
          <h3 className="mb-3 border-t-2 border-fg pt-1.5 font-display text-display-sm font-bold tracking-tight text-fg">
            {round.roundName}
            <span className="figures ml-2 text-caption font-medium tracking-[0.04em] text-fg-subtle">
              {round.heats.length} {round.heats.length === 1 ? "heat" : "heats"}
            </span>
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {round.heats.map((heat, i) => (
              <table
                key={heat.heatNumber ?? i}
                data-heat
                className="w-full border-collapse border-t border-fg text-stat"
              >
                <caption className="border-b border-table-hairline px-2.5 py-1.5 text-left">
                  <span
                    data-v="heat-label"
                    className="figures block text-caption font-semibold tracking-[0.04em] text-fg-muted"
                  >
                    {heat.heatNumber != null ? `Heat ${String(heat.heatNumber).padStart(2, "0")}` : "Heat"}
                  </span>
                  <span className="block text-caption text-fg-subtle">
                    <span data-v="heat-venue">{heat.venueName ?? "venue unknown"}</span>
                    {" · "}
                    <span data-v="heat-conditions" className="figures">
                      {heat.waveHeight || heat.wind
                        ? [heat.waveHeight ?? EM_DASH, heat.wind ?? EM_DASH].join(" · ")
                        : "conditions not published"}
                    </span>
                  </span>
                </caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Position</th>
                    <th scope="col">Surfer and progression</th>
                    <th scope="col">Counting rides</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {heat.surfers.map((s) => {
                    const short =
                      round.countingRides != null &&
                      s.countedScores.length > 0 &&
                      s.countedScores.length !== round.countingRides;
                    return (
                      <tr key={s.surferName} data-entry className="border-b border-table-hairline last:border-b-0 align-baseline">
                        <td data-v="position" className="figures w-6 py-1.5 pl-2.5 text-fg-subtle">
                          {s.position ?? EM_DASH}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="flex items-baseline gap-1.5">
                            {s.surferSlug ? (
                              <Link
                                data-v="surfer"
                                href={`/surfers/${s.surferSlug}`}
                                className={`inline-flex min-h-6 items-center ${s.position === 1 ? "font-medium text-fg" : "text-fg-muted"} hover:text-link`}
                              >
                                {s.surferName}
                              </Link>
                            ) : (
                              <span data-v="surfer" className="font-medium">
                                {s.surferName}
                              </span>
                            )}
                            <CountryTag code={s.countryCode} />
                          </span>
                          {s.progressionText && (
                            <span data-v="progression" className="block text-caption text-fg-subtle">
                              {s.progressionText}
                            </span>
                          )}
                        </td>
                        <td className="figures px-2 py-1.5 text-right text-caption text-fg-subtle">
                          <span data-v="rides">
                            {s.countedScores.length > 0
                              ? s.countedScores.map((v) => v.toFixed(2)).join(" + ")
                              : EM_DASH}
                          </span>
                          {short && (
                            <span className="block">
                              {s.countedScores.length} of {round.countingRides}
                            </span>
                          )}
                        </td>
                        <td
                          data-v="total"
                          className={`figures w-16 py-1.5 pr-2.5 text-right ${
                            s.heatTotal == null ? "text-fg-subtle" : "font-semibold text-fg"
                          }`}
                          title={s.heatTotal == null ? "No published heat total" : undefined}
                        >
                          {formatScore(s.heatTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
