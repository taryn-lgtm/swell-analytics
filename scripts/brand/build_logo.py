"""Build the Swell Analytics logo files from one geometry.

The logo is the Datum Crest, picked by Taryn on 16 October 2026: a grey Datum
line with a sine wave rising 24 units above it in sand and falling 12 units
below it in sea, on a 64-unit grid. The Datum line is the baseline of the
wordmark. "Swell" is Fraunces 600 at opsz 144 and "ANALYTICS" is Bricolage
600, both converted to outlines here so the logo looks the same everywhere
(the site only loads Fraunces italic, and the og:image renderer cannot use
the site fonts at all).

Writes:
  src/components/logoGeometry.ts   path data for the React logo and og:image
  src/app/icon.svg                 favicon (dark tile, works on light and dark tabs)
  src/app/favicon.ico              16/32/48 fallback for browsers without SVG icons
  src/app/apple-icon.png           180 px home-screen icon
  public/brand/*.svg, *.png        lockups for LinkedIn, slides and print

Run from the repo root:  python3 scripts/brand/build_logo.py
Needs: fonttools, brotli, uharfbuzz, Pillow, and Chromium for the PNGs
(CHROMIUM env var, default /opt/pw-browsers/chromium).
Fonts are SIL Open Font License.
"""

import base64
import io
import os
import subprocess
import tempfile

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FRAUNCES = os.path.join(ROOT, "scripts/brand/fraunces-600-opsz144-latin.woff2")
BRICOLAGE = os.path.join(ROOT, "src/fonts/bricolage-grotesque-var-latin.woff2")
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium")

# Overcast tokens (globals.css).
PAPER, FG, FG_SUBTLE, ABOVE, BELOW = "#1d2327", "#eef1f2", "#a1acb2", "#f2b134", "#6aaedb"
BONE, INK, INK_MUTED, ABOVE_ON_LIGHT, BELOW_ON_LIGHT = "#f4f1e8", "#101c26", "#5b6b74", "#c48510", "#2d6f9e"


def num(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def outline(font_path, text, size, tracking_em, location=None):
    """Shape `text` with kerning and return (svg path, advance) in units of `size` = 1 em."""
    font = TTFont(font_path)
    if location:
        font = instantiateVariableFont(font, location)
    font.flavor = None
    buf_io = io.BytesIO()
    font.save(buf_io)
    upm = font["head"].unitsPerEm
    hbfont = hb.Font(hb.Face(hb.Blob(buf_io.getvalue())))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True})
    glyphs, order = font.getGlyphSet(), font.getGlyphOrder()
    k = size / upm
    x, parts = 0.0, []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = SVGPathPen(glyphs, ntos=num)
        glyphs[order[info.codepoint]].draw(TransformPen(pen, (k, 0, 0, -k, x + pos.x_offset * k, 0)))
        parts.append(pen.getCommands())
        x += pos.x_advance * k + tracking_em * size
    return "".join(parts), x - tracking_em * size


# The mark on its 64-unit grid. Datum at y = 38. Each half of the wave is a
# true sine half-period (cubic approximation), 24 units wide. The ends run on
# past the Datum along their tangent and are clipped flat on it.
DATUM_Y = 38
CREST = "M6.44 42.92L8 38C11.91 25.71 15.66 14 20 14C24.34 14 28.09 25.71 32 38L33.56 42.92"
TROUGH = "M29.26 33.7L32 38C35.91 44.15 39.66 50 44 50C48.34 50 52.09 44.15 56 38L58.74 33.7"
DATUM = "M4 38H60"

# Lockup space: "Swell" set at 2000 units (its font units), baseline at y = 0.
SWELL_SIZE = 2000
MARK_SCALE = 48  # lockup units per grid unit, so the crest stands a touch above the cap height
SWELL_PATH, SWELL_ADV = outline(FRAUNCES, "Swell", SWELL_SIZE, -0.02)
ANALYTICS_SIZE = 372
ANALYTICS_PATH, ANALYTICS_ADV = outline(BRICOLAGE, "ANALYTICS", ANALYTICS_SIZE, 0.3, {"wght": 600, "opsz": 24})

MARK_X = -4 * MARK_SCALE  # the visible mark starts at x = 0
MARK_RIGHT = 56 * MARK_SCALE
SWELL_X = MARK_RIGHT + 560
ANALYTICS_X = SWELL_X + SWELL_ADV + 430
WIDTH = ANALYTICS_X + ANALYTICS_ADV
TOP = -1500  # just above the l ascenders
BOTTOM = round((50 + 2.7 - DATUM_Y) * MARK_SCALE)  # trough plus its stroke


def mark_group(above, below, datum, stroke=5.0, datum_stroke=1.6, clip="dc", transform=""):
    t = f' transform="{transform}"' if transform else ""
    return (
        f'<defs><clipPath id="{clip}u"><rect width="64" height="38"/></clipPath>'
        f'<clipPath id="{clip}l"><rect y="38" width="64" height="26"/></clipPath></defs>'
        f"<g{t}>"
        f'<path d="{DATUM}" stroke="{datum}" stroke-width="{datum_stroke}"/>'
        f'<path clip-path="url(#{clip}l)" d="{TROUGH}" stroke="{below}" stroke-width="{stroke}" fill="none"/>'
        f'<path clip-path="url(#{clip}u)" d="{CREST}" stroke="{above}" stroke-width="{stroke}" fill="none"/>'
        "</g>"
    )


def lockup_svg(fg, sub, above, below, datum, pad=240):
    vb = f"{num(-pad)} {num(TOP - pad)} {num(WIDTH + 2 * pad)} {num(BOTTOM - TOP + 2 * pad)}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
        + mark_group(above, below, datum, transform=f"translate({MARK_X} {-DATUM_Y * MARK_SCALE}) scale({MARK_SCALE})")
        + f'<path transform="translate({num(SWELL_X)} 0)" fill="{fg}" d="{SWELL_PATH}"/>'
        + f'<path transform="translate({num(ANALYTICS_X)} 0)" fill="{sub}" d="{ANALYTICS_PATH}"/>'
        + "</svg>"
    )


def icon_svg(size_hint):
    # Thicker strokes for the 16 and 32 px favicons so the wave survives.
    stroke, datum = (9.5, 4.6) if size_hint <= 32 else (5.4, 2)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="12" fill="{PAPER}"/>'
        + mark_group(ABOVE, BELOW, FG_SUBTLE, stroke, datum, transform="translate(4 4) scale(0.875)")
        + "</svg>"
    )


def render_png(svg, w, h, background="transparent"):
    # Chromium will not shoot a window much under 500 px, so render at least
    # 8x and downsample.
    k = max(1, -(-1024 // w))
    rw, rh = w * k, h * k
    html = (
        f'<html><body style="margin:0;background:{background}">'
        f'<img src="data:image/svg+xml;base64,{base64.b64encode(svg.encode()).decode()}" width="{rw}" height="{rh}" style="display:block">'
        "</body></html>"
    )
    with tempfile.TemporaryDirectory() as tmp:
        page, out = os.path.join(tmp, "p.html"), os.path.join(tmp, "o.png")
        with open(page, "w") as f:
            f.write(html)
        subprocess.run(
            [CHROMIUM, "--headless", "--no-sandbox", "--hide-scrollbars", "--default-background-color=00000000",
             "--force-device-scale-factor=1", f"--window-size={rw},{rh + 240}", f"--screenshot={out}", "file://" + page],
            check=True, capture_output=True,
        )
        img = Image.open(out).convert("RGBA").crop((0, 0, rw, rh))
        return img.resize((w, h), Image.LANCZOS) if k > 1 else img.copy()


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(text)


def main():
    write(
        "src/components/logoGeometry.ts",
        "// Generated by scripts/brand/build_logo.py. Do not edit by hand.\n"
        "// Lockup units: \"Swell\" set at 2000, baseline (= the Datum line) at y = 0.\n"
        f'export const MARK_CREST = "{CREST}";\n'
        f'export const MARK_TROUGH = "{TROUGH}";\n'
        f'export const MARK_DATUM = "{DATUM}";\n'
        f"export const MARK_DATUM_Y = {DATUM_Y};\n"
        f"export const MARK_SCALE = {MARK_SCALE};\n"
        f"export const MARK_X = {MARK_X};\n"
        f"export const SWELL_X = {num(SWELL_X)};\n"
        f"export const ANALYTICS_X = {num(ANALYTICS_X)};\n"
        f"export const LOCKUP_TOP = {TOP};\n"
        f"export const LOCKUP_BOTTOM = {BOTTOM};\n"
        f"export const SWELL_RIGHT = {num(SWELL_X + SWELL_ADV)};\n"
        f"export const LOCKUP_WIDTH = {num(WIDTH)};\n"
        f'export const SWELL_PATH = "{SWELL_PATH}";\n'
        f'export const ANALYTICS_PATH = "{ANALYTICS_PATH}";\n',
    )

    write("src/app/icon.svg", icon_svg(16))
    render_png(icon_svg(180), 180, 180).save(os.path.join(ROOT, "src/app/apple-icon.png"))
    ico = [render_png(icon_svg(s), s, s) for s in (16, 32, 48)]
    ico[2].save(os.path.join(ROOT, "src/app/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])

    dark = lockup_svg(FG, FG_SUBTLE, ABOVE, BELOW, FG_SUBTLE)
    light = lockup_svg(INK, INK_MUTED, ABOVE_ON_LIGHT, BELOW_ON_LIGHT, "#75838c")
    mono = lockup_svg(INK, INK, INK, INK, INK)
    write("public/brand/swell-analytics-logo-dark.svg", dark)
    write("public/brand/swell-analytics-logo-light.svg", light)
    write("public/brand/swell-analytics-logo-mono.svg", mono)
    write("public/brand/swell-analytics-mark.svg", icon_svg(180))
    aspect = (BOTTOM - TOP + 480) / (WIDTH + 480)
    render_png(dark, 2400, round(2400 * aspect), PAPER).save(os.path.join(ROOT, "public/brand/swell-analytics-logo-dark.png"))
    render_png(light, 2400, round(2400 * aspect), BONE).save(os.path.join(ROOT, "public/brand/swell-analytics-logo-light.png"))
    render_png(icon_svg(400), 400, 400).save(os.path.join(ROOT, "public/brand/swell-analytics-mark.png"))
    print("width", num(WIDTH), "swell", num(SWELL_ADV), "analytics", num(ANALYTICS_ADV))


if __name__ == "__main__":
    main()
