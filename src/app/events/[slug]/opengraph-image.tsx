import { ogCard, OG_SIZE } from "@/lib/ogCard";
import { getAllEventParams, getEventPage } from "@/lib/queries/event";
import { EM_DASH } from "@/lib/format";

/* The event's own link preview card: the figures the page header shows. */
export const alt = "Event page on Swell Analytics";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getAllEventParams()).map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ev = await getEventPage(slug);
  if (!ev) return ogCard({ kicker: "Men's Championship Tour", title: "Event not found", stats: [] });
  const venues = ev.heatVenues.map((v) => v.name).join(" · ") || ev.nominalVenueName || undefined;
  return ogCard({
    kicker: ev.kind === "wsl_finals" ? `Men's CT ${ev.seasonYear} · WSL Finals` : `Men's CT ${ev.seasonYear} · Stop ${String(ev.eventNumber).padStart(2, "0")}`,
    title: ev.name,
    subtitle: venues,
    stats: [
      [String(ev.heatCount), ev.heatCount === 1 ? "heat" : "heats"],
      [String(ev.surfedCount), "surfers"],
      [ev.winner?.fullName ?? EM_DASH, "winner"],
    ],
  });
}
