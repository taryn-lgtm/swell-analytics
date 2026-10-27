import { ogCard, OG_SIZE } from "@/lib/ogCard";
import { getAllSurferSlugs, getSurferProfile } from "@/lib/queries/surfer";
import { countryName } from "@/lib/countries";
import { formatTrim } from "@/lib/trim";

/* The surfer's own link preview card. Every figure is the one the page's
   header shows, read through the same query. */
export const alt = "Surfer profile on Swell Analytics";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getAllSurferSlugs()).map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getSurferProfile(slug);
  if (!p) return ogCard({ kicker: "Men's Championship Tour", title: "Surfer not found", stats: [] });
  return ogCard({
    kicker: `Men's CT · ${p.seasons.join(" and ")}`,
    title: p.fullName,
    subtitle: p.countryCode ? countryName(p.countryCode) : undefined,
    stats: [
      [formatTrim(p.current?.trim), "Trim, per heat"],
      [String(p.ratedHeats), p.ratedHeats === 1 ? "rated heat" : "rated heats"],
      [`${p.heatsWon} of ${p.heats.length}`, "heats won"],
    ],
  });
}
