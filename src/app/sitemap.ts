import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { getAllSurferSlugs } from "@/lib/queries/surfer";
import { getAllEventParams } from "@/lib/queries/event";

export const revalidate = 3600;

/* Every indexable page, read from the same lists generateStaticParams uses,
   so the sitemap cannot name a page the build did not produce. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [surfers, events] = await Promise.all([getAllSurferSlugs(), getAllEventParams()]);
  const fixed = ["/", "/rankings", "/events", "/surfers", "/trim", "/compare", "/about"];
  return [
    ...fixed.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}`, priority: p === "/" ? 1 : 0.8 })),
    ...surfers.map((s) => ({ url: `${SITE_URL}/surfers/${s}`, priority: 0.6 })),
    ...events.map((e) => ({ url: `${SITE_URL}/events/${e}`, priority: 0.6 })),
  ];
}
