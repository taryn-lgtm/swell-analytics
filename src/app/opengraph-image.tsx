import { ImageResponse } from "next/og";
import { db } from "@/lib/db/server";
import {
  ANALYTICS_PATH,
  ANALYTICS_X,
  LOCKUP_BOTTOM,
  LOCKUP_TOP,
  LOCKUP_WIDTH,
  MARK_CREST,
  MARK_DATUM,
  MARK_DATUM_Y,
  MARK_SCALE,
  MARK_TROUGH,
  MARK_X,
  SWELL_PATH,
  SWELL_X,
} from "@/components/logoGeometry";

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
const BELOW = "#6aaedb";

/* The Datum Crest lockup as a standalone svg. The renderer cannot use the
   site fonts, so the words come from the outlines in logoGeometry. */
const LOGO_WIDTH = 600;
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * (LOCKUP_BOTTOM - LOCKUP_TOP)) / LOCKUP_WIDTH);
const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${LOCKUP_TOP} ${LOCKUP_WIDTH} ${LOCKUP_BOTTOM - LOCKUP_TOP}">` +
  `<defs><clipPath id="u"><rect width="64" height="${MARK_DATUM_Y}"/></clipPath>` +
  `<clipPath id="l"><rect y="${MARK_DATUM_Y}" width="64" height="${64 - MARK_DATUM_Y}"/></clipPath></defs>` +
  `<g transform="translate(${MARK_X} ${-MARK_DATUM_Y * MARK_SCALE}) scale(${MARK_SCALE})">` +
  `<path d="${MARK_DATUM}" stroke="${FG_SUBTLE}" stroke-width="1.6"/>` +
  `<path clip-path="url(#l)" d="${MARK_TROUGH}" stroke="${BELOW}" stroke-width="5" fill="none"/>` +
  `<path clip-path="url(#u)" d="${MARK_CREST}" stroke="${ACCENT}" stroke-width="5" fill="none"/></g>` +
  `<path transform="translate(${SWELL_X} 0)" fill="${FG}" d="${SWELL_PATH}"/>` +
  `<path transform="translate(${ANALYTICS_X} 0)" fill="${FG_SUBTLE}" d="${ANALYTICS_PATH}"/></svg>`;
const LOGO_SRC = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

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
          <img src={LOGO_SRC} width={LOGO_WIDTH} height={LOGO_HEIGHT} alt="Swell Analytics" style={{ marginTop: 24 }} />
          <div style={{ fontSize: 36, color: FG_SUBTLE, marginTop: 20, maxWidth: 1040 }}>
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
