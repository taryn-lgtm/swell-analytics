import type { Metadata } from "next";
import HomeView from "@/components/views/HomeView";

/*
 * `/` at the default minimum-heats threshold. Static: the "every surfer"
 * variant (`/?all=1`) is its own prerendered route, src/app/home/all, reached
 * by a rewrite in next.config.ts. See HomeView for why no route reads the
 * query string.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Trim leaderboard",
  description:
    "How far each Championship Tour surfer beats what the round expects of them, heat by heat.",
};

export default function HomePage() {
  return <HomeView showingAll={false} />;
}
