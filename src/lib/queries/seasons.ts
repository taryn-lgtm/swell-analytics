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
