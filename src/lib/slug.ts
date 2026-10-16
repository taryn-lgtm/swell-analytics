export function surferSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")          // O'Leary → oleary (apostrophe removed, not dashed)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function eventSlug(name: string, year: number): string {
  const base = name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${year}`;
}
