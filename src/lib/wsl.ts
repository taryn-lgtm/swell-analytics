/**
 * WSL's results page for an event. Built from events.wsl_event_id and
 * events.slug; the pattern matches the url recorded in all 22 retained
 * results-page sidecars (docs/sources/raw/<year>_ct_<id>_<slug>_results.json),
 * checked 23 October 2026.
 */
export function wslResultsUrl(e: { season_year: number; wsl_event_id: string | number | null; slug: string }): string | null {
  if (e.wsl_event_id == null) return null;
  return `https://www.worldsurfleague.com/events/${e.season_year}/ct/${e.wsl_event_id}/${e.slug}/results`;
}
