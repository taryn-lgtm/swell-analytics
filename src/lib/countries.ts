/**
 * Surfer countries for the frontend.
 *
 * `surfers.country_code` holds the country exactly as WSL publishes it on its
 * results pages — the athlete flag's title, e.g. "Brazil", "Hawaii" — because
 * no retained artefact publishes a code (migration 18, Taryn's decision,
 * 7 October 2026). So the display name is the stored value itself: nothing is
 * mapped, and Hawaii stays separate as WSL keeps it.
 *
 * The previous ISO alpha-2 lookup was removed with that migration; it described
 * a v1 column that v2 never populated.
 */
export function countryName(code: string | null | undefined): string {
  return code ?? "";
}
