import { ImageResponse } from "next/og";
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
 * Shared pieces of the link preview cards (og:image): the Overcast colours as
 * literals (the image renderer cannot read CSS variables), the Datum Crest
 * lockup as an svg, and the card layout the per-surfer and per-event images
 * use. The site-wide card in app/opengraph-image.tsx keeps its own layout.
 */
export const OG_SIZE = { width: 1200, height: 630 };

export const PAPER = "#1d2327";
export const FG = "#eef1f2";
export const FG_SUBTLE = "#a1acb2";
export const ACCENT = "#f2b134";
export const HAIRLINE = "#384349";
export const BELOW = "#6aaedb";

/* The Datum Crest lockup as a standalone svg. The renderer cannot use the
   site fonts, so the words come from the outlines in logoGeometry. */
export const LOGO_WIDTH = 600;
export const LOGO_HEIGHT = Math.round((LOGO_WIDTH * (LOCKUP_BOTTOM - LOCKUP_TOP)) / LOCKUP_WIDTH);
export const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${LOCKUP_TOP} ${LOCKUP_WIDTH} ${LOCKUP_BOTTOM - LOCKUP_TOP}">` +
  `<defs><clipPath id="u"><rect width="64" height="${MARK_DATUM_Y}"/></clipPath>` +
  `<clipPath id="l"><rect y="${MARK_DATUM_Y}" width="64" height="${64 - MARK_DATUM_Y}"/></clipPath></defs>` +
  `<g transform="translate(${MARK_X} ${-MARK_DATUM_Y * MARK_SCALE}) scale(${MARK_SCALE})">` +
  `<path d="${MARK_DATUM}" stroke="${FG_SUBTLE}" stroke-width="1.6"/>` +
  `<path clip-path="url(#l)" d="${MARK_TROUGH}" stroke="${BELOW}" stroke-width="5" fill="none"/>` +
  `<path clip-path="url(#u)" d="${MARK_CREST}" stroke="${ACCENT}" stroke-width="5" fill="none"/></g>` +
  `<path transform="translate(${SWELL_X} 0)" fill="${FG}" d="${SWELL_PATH}"/>` +
  `<path transform="translate(${ANALYTICS_X} 0)" fill="${FG_SUBTLE}" d="${ANALYTICS_PATH}"/></svg>`;
export const LOGO_SRC = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;


export function ogCard({
  kicker,
  title,
  subtitle,
  stats,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  stats: [string, string][];
}): ImageResponse {
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
          padding: "64px 80px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a browser */}
          <img src={LOGO_SRC} width={LOGO_WIDTH / 2} height={LOGO_HEIGHT / 2} alt="Swell Analytics" />
          <div style={{ fontSize: 26, letterSpacing: 4, color: ACCENT, textTransform: "uppercase", marginTop: 40 }}>
            {kicker}
          </div>
          <div style={{ fontSize: 84, fontWeight: 700, marginTop: 12, lineHeight: 1.05 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 34, color: FG_SUBTLE, marginTop: 14 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", borderTop: `2px solid ${HAIRLINE}`, paddingTop: 28 }}>
          {stats.map(([value, label]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", marginRight: 88 }}>
              <div style={{ fontSize: 60, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 26, color: FG_SUBTLE }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    OG_SIZE
  );
}
