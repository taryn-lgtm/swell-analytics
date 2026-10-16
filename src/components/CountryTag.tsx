import { countryName } from "@/lib/countries";

/**
 * A surfer's country exactly as WSL publishes it ("Brazil", "Hawaii") —
 * migration 18 stores the published name, not a code, so nothing is mapped
 * here. Set small and muted beside the name; it never wraps mid-name.
 */
export default function CountryTag({
  code,
}: {
  code: string | null | undefined;
}) {
  if (!code) return null;
  return (
    <span className="whitespace-nowrap text-caption text-fg-subtle">
      {countryName(code)}
    </span>
  );
}
