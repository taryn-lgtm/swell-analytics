/**
 * National colours for surfer pages (Swell, M4). Two colours per country as
 * WSL publishes it (`surfers.country_code`), taken from the flag and lifted
 * where needed so they read on the Overcast ground. They mark identity only:
 * the name and a rule. Data colours stay sand above Datum and sea below on
 * every page, whatever the surfer's country.
 */
export interface NationColours {
  /** The surname and the heavier half of the rule. */
  primary: string;
  /** The second stripe. */
  secondary: string;
}

const NATIONS: Record<string, NationColours> = {
  Australia: { primary: "#ffcd00", secondary: "#2fa35b" },
  Brazil: { primary: "#ffd43b", secondary: "#2fb36b" },
  Hawaii: { primary: "#e8505b", secondary: "#f2f4f5" },
  "United States": { primary: "#ff4d5e", secondary: "#7aa7ff" },
  France: { primary: "#7aa7ff", secondary: "#ff5a5f" },
  Portugal: { primary: "#ff5a5f", secondary: "#3fb06a" },
  "South Africa": { primary: "#ffb81c", secondary: "#3fb06a" },
  "French Polynesia": { primary: "#ff5a5f", secondary: "#f2f4f5" },
  Indonesia: { primary: "#ff5a5f", secondary: "#f2f4f5" },
  Japan: { primary: "#ff5a6e", secondary: "#f2f4f5" },
  "El Salvador": { primary: "#5b9bff", secondary: "#f2f4f5" },
  Morocco: { primary: "#ff5a5f", secondary: "#3fb06a" },
  Mexico: { primary: "#3fb06a", secondary: "#ff5a5f" },
  Italy: { primary: "#3fb06a", secondary: "#ff5a5f" },
  Fiji: { primary: "#7cc6f2", secondary: "#f2f4f5" },
};

/** Null for a country not listed, and the page falls back to the site's own ink. */
export function nationColours(country: string | null | undefined): NationColours | null {
  return country ? (NATIONS[country] ?? null) : null;
}
