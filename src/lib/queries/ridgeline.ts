import { cache } from "react";
import { db } from "@/lib/db/server";
import { num } from "@/lib/trim";

/**
 * The home page's ridgeline: every rated heat's gap to Datum, per surfer, in
 * career order. Read from `trim` (residual and seq as stored) under the latest
 * model run, the same run v_trim_current reports. Nothing is derived here.
 *
 * Added by the design thread (M4, 16 October 2026) for the Swell home hero.
 */

export interface RidgeSeries {
  surferId: number;
  /** trim.residual in seq order: heat total minus Datum. */
  gaps: number[];
}

const PAGE = 1000;

export const getRidgeSeries = cache(async (surferIds: number[]): Promise<RidgeSeries[]> => {
  if (surferIds.length === 0) return [];
  const run = await db.from("trim").select("model_run_id").order("model_run_id", { ascending: false }).limit(1);
  if (run.error) throw new Error(`trim model run query failed: ${run.error.message}`);
  const runId = run.data[0]?.model_run_id;
  if (runId == null) return [];

  const rows: { surfer_id: number; seq: number; residual: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("trim")
      .select("surfer_id, seq, residual")
      .eq("model_run_id", runId)
      .in("surfer_id", surferIds)
      .order("surfer_id", { ascending: true })
      .order("seq", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`trim residuals query failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const bySurfer = new Map<number, number[]>();
  for (const r of rows) {
    const g = num(r.residual);
    if (g == null) continue;
    const list = bySurfer.get(r.surfer_id) ?? [];
    list.push(g);
    bySurfer.set(r.surfer_id, list);
  }
  return surferIds.map((id) => ({ surferId: id, gaps: bySurfer.get(id) ?? [] }));
});
