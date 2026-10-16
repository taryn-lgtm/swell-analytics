import { ImageResponse } from "next/og";
import { db } from "@/lib/db/server";

/*
 * The link preview card (og:image) for every route that does not set its
 * own: what LinkedIn, Slack and iMessage show when the URL is pasted.
 *
 * The three figures are counted from v2 at build time, never typed in, so the
 * card cannot drift from the site. Colours are the Overcast tokens from
 * globals.css as literals, because the image renderer cannot read CSS
 * variables. The site's woff2 fonts are not usable by the renderer either, so
 * the card uses its default sans.
 */
export const alt = "Swell Analytics: independent analytics for the WSL men's Championship Tour";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const PAPER = "#1d2327";
const FG = "#eef1f2";
const FG_SUBTLE = "#a1acb2";
const ACCENT = "#f2b134";
const HAIRLINE = "#384349";

async function count(table: "heats" | "waves" | "surfers"): Promise<number | null> {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count failed: ${error.message.slice(0, 200)}`);
  return n;
}

async function seasonsLabel(): Promise<string> {
  const { data, error } = await db.from("seasons").select("year").order("year");
  if (error) throw new Error(`seasons query failed: ${error.message.slice(0, 200)}`);
  return data.map((s) => s.year).join(" and ");
}

export default async function OpengraphImage() {
  const [heats, rides, surfers, seasons] = await Promise.all([
    count("heats"),
    count("waves"),
    count("surfers"),
    seasonsLabel(),
  ]);
  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-GB"));
  const stats: [string, string][] = [
    [fmt(heats), "heats"],
    [fmt(rides), "scored rides"],
    [fmt(surfers), "surfers"],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: FG,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 28, letterSpacing: 4, color: ACCENT, textTransform: "uppercase" }}>
            {`Men's Championship Tour · ${seasons}`}
          </div>
          <div style={{ fontSize: 96, fontWeight: 700, marginTop: 16 }}>Swell Analytics</div>
          <div style={{ fontSize: 36, color: FG_SUBTLE, marginTop: 12, maxWidth: 900 }}>
            Every heat scored against what the round expects. Rankings, surfer records and
            head-to-head comparisons.
          </div>
        </div>
        <div style={{ display: "flex", borderTop: `2px solid ${HAIRLINE}`, paddingTop: 32 }}>
          {stats.map(([value, label]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", marginRight: 96 }}>
              <div style={{ fontSize: 64, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 28, color: FG_SUBTLE }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
