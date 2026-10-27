import { cache } from "react";
import { db } from "@/lib/db/server";
import type { Tables } from "@/lib/database.types";

export type SeasonRow = Tables<"seasons">;

/**
 * Every season in the database, newest first. The table IS the coverage
 * statement: V1 holds 2024 and 2025 and nothing else, and the chrome reads
 * the list rather than asserting a range (definition of beta: "the site
 * must say which seasons it covers rather than implying Era A entire").
 */
export const getSeasons = cache(async (): Promise<SeasonRow[]> => {
  const { data, error } = await db
    .from("seasons")
    .select("*")
    .order("year", { ascending: false });
  if (error) throw new Error(`seasons query failed: ${error.message}`);
  return data;
});

export const getSeason = cache(async (year: number): Promise<SeasonRow | null> => {
  const seasons = await getSeasons();
  return seasons.find((s) => s.year === year) ?? null;
});

/** Latest season with data. Never hardcoded. */
export const getLatestSeasonYear = cache(async (): Promise<number> => {
  const seasons = await getSeasons();
  if (seasons.length === 0) throw new Error("no seasons found");
  return seasons[0].year;
});

/**
 * The seasons named one by one -- "2024 and 2025" -- never as a range. A
 * range ("2022–2025") would imply the years between are held; a list
 * cannot.
 */
export function seasonsListLabel(seasons: { year: number }[]): string {
  const years = seasons.map((s) => s.year).sort((a, b) => a - b).map(String);
  if (years.length === 0) return "";
  if (years.length === 1) return years[0];
  return `${years.slice(0, -1).join(", ")} and ${years[years.length - 1]}`;
}

/**
 * The date the held results run to: the latest event end date in v2, as
 * "4 September 2025". Read, never typed: the chrome said it as a literal
 * until 23 October 2026, which M6's 2026 season would have made false.
 */
export const getResultsThrough = cache(async (): Promise<string | null> => {
  const { data, error } = await db
    .from("events")
    .select("end_date")
    .not("end_date", "is", null)
    .order("end_date", { ascending: false })
    .limit(1);
  if (error) throw new Error(`events (results through) query failed: ${error.message}`);
  const d = data[0]?.end_date;
  if (!d) return null;
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
});
