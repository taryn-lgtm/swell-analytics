"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as THREEType from "three";
import { roundHalfUp } from "@/lib/format";

/*
 * The scrolling swell from the Swell concept (docs/concepts/m4_site,
 * surfer-griffin-colapinto.html), brought into the app on 16 October 2026.
 *
 * A lit sea built from one surfer's heats in career order: the front edge is
 * each heat's gap to Datum (trim.residual as stored), smoothed outward into
 * swell behind it. Sand where he beat Datum, sea where he fell short -- the
 * same two colours as every other chart (national colours tint only the
 * header). Scrolling moves a camera along the swell and pauses on four beats
 * whose words are all computed from the same rows.
 *
 * three.js is imported only on the client and only when WebGL works and
 * motion is allowed. Otherwise the section renders the four beats as text,
 * which is also what the server prerenders.
 */

export interface SwellHeat {
  year: number;
  event: string;
  round: string;
  datum: number;
  posted: number;
  gap: number;
  trim: number;
  venue: string | null;
  waveHeight: string | null;
  wind: string | null;
}

interface Beat {
  heat: number; // 1-based position in career order
  kicker: string;
  head: string;
  body: string;
}

// Half-up, as every other figure on the site (decision 68): toFixed rounds the
// binary float, so a stored 1.4705 could print as 1.470 here and 1.471 in the
// timeline beside it.
const f2 = (v: number) => roundHalfUp(v, 2).toFixed(2);
const f3 = (v: number) => {
  const r = roundHalfUp(v, 3);
  return (r < 0 ? "−" : "") + Math.abs(r).toFixed(3);
};
const s2 = (v: number) => {
  const r = roundHalfUp(v, 2);
  return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(2);
};
const label = (h: SwellHeat) => `${h.event} ${h.year} · ${h.round}`;
const where = (h: SwellHeat) =>
  [h.venue, h.waveHeight ? `${h.waveHeight}${h.wind ? `, ${h.wind.toLowerCase()}` : ""}` : null]
    .filter(Boolean)
    .join(", ") || "conditions not published";

function beatsFor(heats: SwellHeat[]): Beat[] {
  const N = heats.length;
  const idx = (pick: (a: SwellHeat, b: SwellHeat) => boolean) =>
    heats.reduce((best, h, i) => (pick(h, heats[best]) ? i : best), 0);
  const lowT = idx((a, b) => a.trim < b.trim);
  const lowR = idx((a, b) => a.gap < b.gap);
  const highR = idx((a, b) => a.gap > b.gap);
  const last = N - 1;
  const raw: Beat[] = [
    {
      heat: lowT + 1,
      kicker: `Heat ${lowT + 1} · ${label(heats[lowT])}`,
      head: "The low tide.",
      body: `${f2(heats[lowT].posted)} against an expected ${f2(heats[lowT].datum)} (${where(heats[lowT])}). His Trim bottoms out at ${f3(heats[lowT].trim)}.`,
    },
    {
      heat: lowR + 1,
      kicker: `Heat ${lowR + 1} · ${label(heats[lowR])}`,
      head: "The deepest trough.",
      body: `${f2(heats[lowR].posted)} against an expected ${f2(heats[lowR].datum)}: a gap of ${s2(heats[lowR].gap)}, his largest miss in these seasons.`,
    },
    {
      heat: highR + 1,
      kicker: `Heat ${highR + 1} · ${label(heats[highR])}`,
      head: "The highest crest.",
      body: `${f2(heats[highR].posted)} (${where(heats[highR])}) against an expected ${f2(heats[highR].datum)}. A gap of ${s2(heats[highR].gap)}.`,
    },
    {
      heat: N,
      kicker: `Heat ${N} · ${label(heats[last])}`,
      head: "Where it ends.",
      body: `${f2(heats[last].posted)} against ${f2(heats[last].datum)}, leaving his Trim at ${f3(heats[last].trim)}.`,
    },
  ];
  // Keep the camera moving forwards: beats in career order, one per heat.
  const seen = new Set<number>();
  return raw.sort((a, b) => a.heat - b.heat).filter((b) => (seen.has(b.heat) ? false : (seen.add(b.heat), true)));
}

function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function SwellScroll({ fullName, heats, seasonsLabel }: { fullName: string; heats: SwellHeat[]; seasonsLabel: string }) {
  const beats = useMemo(() => beatsFor(heats), [heats]);
  const [live, setLive] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [heatNow, setHeatNow] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const N = heats.length;
  const surname = fullName.split(" ").slice(-1)[0];

  // Decide on the client whether the 3D version runs. The server and a
  // motion-off or no-WebGL visitor get the text version.
  useEffect(() => {
    if (reducedMotion() || !webglOk()) return;
    const id = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!live) return;
    const cvs = canvasRef.current;
    const section = sectionRef.current;
    if (!cvs || !section) return;
    let disposed = false;
    let cleanup = () => {};

    import("three").then((THREE: typeof THREEType) => {
      if (disposed) return;
      const R = heats.map((h) => h.gap);
      const SX = 2;
      const ROWS = 46;
      const RZ = 1.8;
      const SEG = Math.max(40, N * 5);
      const SPAN = (N - 1) * SX;
      const HS = 1.25;
      const C = {
        ground: new THREE.Color(cssVar("--paper", "#1d2327")),
        base: new THREE.Color(cssVar("--hairline-strong", "#4a5760")),
        up: new THREE.Color(cssVar("--above", "#f2b134")),
        dn: new THREE.Color(cssVar("--below", "#6aaedb")),
        foam: new THREE.Color(cssVar("--fg", "#eef1f2")),
      };

      const height = (x: number, row: number) => {
        const sig = (0.55 + row * 0.11) * SX;
        let num = 0;
        let den = 0;
        const lo = Math.max(0, Math.floor((x - 4 * sig) / SX));
        const hi = Math.min(N - 1, Math.ceil((x + 4 * sig) / SX));
        for (let k = lo; k <= hi; k++) {
          const dx = x - k * SX;
          const w = Math.exp((-dx * dx) / (2 * sig * sig));
          num += R[k] * w;
          den += w;
        }
        return den ? (num / den) * HS * Math.exp(-row / 42) : 0;
      };
      const rng = (seed0: number) => {
        let seed = seed0;
        return () => {
          seed |= 0;
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };

      let renderer: THREEType.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true });
      } catch {
        setLive(false);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(C.ground, 1);
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(C.ground, 50, 210);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 700);
      scene.add(new THREE.HemisphereLight(0xb8c4cc, C.ground, 0.55));
      const moon = new THREE.DirectionalLight(0xffffff, 0.95);
      moon.position.set(-40, 60, 40);
      scene.add(moon);
      const rim = new THREE.DirectionalLight(C.up, 0.18);
      rim.position.set(80, 10, -60);
      scene.add(rim);

      // Surface
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array((ROWS + 1) * (SEG + 1) * 3);
      const col = new Float32Array(pos.length);
      const index: number[] = [];
      for (let j = 0; j < ROWS; j++)
        for (let i = 0; i < SEG; i++) {
          const a = j * (SEG + 1) + i;
          const b = a + 1;
          const c = a + SEG + 1;
          const d = c + 1;
          index.push(a, c, b, b, c, d);
        }
      const tmp = new THREE.Color();
      const edgePos = new Float32Array((SEG + 1) * 3);
      for (let j = 0; j <= ROWS; j++)
        for (let i = 0; i <= SEG; i++) {
          const x = (i / SEG) * SPAN;
          const h = height(x, j);
          const o = (j * (SEG + 1) + i) * 3;
          pos[o] = x;
          pos[o + 1] = h;
          pos[o + 2] = -j * RZ;
          const t = Math.max(-1, Math.min(1, h / (5 * HS)));
          tmp.copy(C.base).lerp(t >= 0 ? C.up : C.dn, Math.min(1, Math.abs(t) * 1.1));
          col[o] = tmp.r;
          col[o + 1] = tmp.g;
          col[o + 2] = tmp.b;
          if (j === 0) {
            edgePos[i * 3] = x;
            edgePos[i * 3 + 1] = h + 0.04;
            edgePos[i * 3 + 2] = 0.02;
          }
        }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setIndex(index);
      g.computeVertexNormals();
      const seaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
      scene.add(new THREE.Mesh(g, seaMat));

      // Front edge: the data line itself
      const eg = new THREE.BufferGeometry();
      eg.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
      const edgeMat = new THREE.LineBasicMaterial({ color: C.foam, transparent: true, opacity: 0.85 });
      scene.add(new THREE.Line(eg, edgeMat));

      // Foam only above Datum: ten flecks per point of gap, placed deterministically
      const sprite = (draw: (cx: CanvasRenderingContext2D) => void) => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 64;
        const cx = cv.getContext("2d");
        if (cx) draw(cx);
        return new THREE.CanvasTexture(cv);
      };
      const foamTex = sprite((cx) => {
        const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        cx.fillStyle = gr;
        cx.fillRect(0, 0, 64, 64);
      });
      const fp: number[] = [];
      R.forEach((r, k) => {
        if (r <= 0) return;
        const n = Math.round(r * 10);
        const rr = rng(k + 1);
        for (let q = 0; q < n; q++) {
          const x = k * SX + (rr() - 0.5) * SX * 1.1;
          const row = rr() * 5;
          fp.push(x, height(x, row) + 0.12, -row * RZ);
        }
      });
      const fg = new THREE.BufferGeometry();
      fg.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
      const foamMat = new THREE.PointsMaterial({ size: 0.55, map: foamTex, transparent: true, depthWrite: false, color: C.foam, opacity: 0.45 });
      scene.add(new THREE.Points(fg, foamMat));

      // One dot per heat on the front edge
      const dotTex = sprite((cx) => {
        cx.fillStyle = "#fff";
        cx.beginPath();
        cx.arc(32, 32, 28, 0, Math.PI * 2);
        cx.fill();
      });
      const dp: number[] = [];
      const dc: number[] = [];
      R.forEach((r, k) => {
        dp.push(k * SX, height(k * SX, 0) + 0.06, 0.12);
        const c = r >= 0 ? C.up : C.dn;
        dc.push(c.r, c.g, c.b);
      });
      const dg = new THREE.BufferGeometry();
      dg.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
      dg.setAttribute("color", new THREE.Float32BufferAttribute(dc, 3));
      const dotMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, map: dotTex, alphaTest: 0.5, transparent: true });
      scene.add(new THREE.Points(dg, dotMat));

      // Camera: overview, then travel-and-hold through each beat, then overview
      const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      const OV = { p: V(SPAN / 2, 30, 98), l: V(SPAN / 2, -15, -44) };
      const FL = (h: number) => ({ p: V((h - 1) * SX - 16, 8.5, 22), l: V((h - 1) * SX + 10, -0.5, -8) });
      const sm = (t: number) => t * t * (3 - 2 * t);
      const STOPS = [1, ...beats.map((b) => b.heat)];
      const place = (a: { p: THREEType.Vector3; l: THREEType.Vector3 }, b: { p: THREEType.Vector3; l: THREEType.Vector3 }, t: number) => {
        camera.position.copy(a.p).lerp(b.p, t);
        camera.lookAt(a.l.clone().lerp(b.l, t));
      };
      const camAt = (p: number): { h: number | null; beat: number } => {
        if (p < 0.06) {
          place(OV, FL(1), sm(p / 0.06));
          return { h: null, beat: -1 };
        }
        if (p > 0.94) {
          place(FL(N), OV, sm((p - 0.94) / 0.06));
          return { h: null, beat: -1 };
        }
        const t = (p - 0.06) / 0.88;
        const S = STOPS.length - 1;
        const seg = Math.min(S - 1, Math.floor(t * S));
        const loc = t * S - seg;
        if (loc < 0.55) {
          const h = STOPS[seg] + (STOPS[seg + 1] - STOPS[seg]) * sm(loc / 0.55);
          place(FL(h), FL(h), 0);
          return { h: Math.round(h), beat: -1 };
        }
        place(FL(STOPS[seg + 1]), FL(STOPS[seg + 1]), 0);
        return { h: STOPS[seg + 1], beat: seg };
      };

      let prog = 0;
      let needs = true;
      let raf = 0;
      const frame = () => {
        const w = cvs.clientWidth;
        const h = cvs.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.fov = w < 600 ? 54 : 38;
        camera.updateProjectionMatrix();
        needs = true;
      };
      const onScroll = () => {
        const r = section.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        prog = Math.max(0, Math.min(1, -r.top / Math.max(1, total)));
        needs = true;
      };
      const loop = () => {
        if (needs) {
          const s = camAt(prog);
          setBeat(s.beat);
          setHeatNow(s.h);
          renderer.render(scene, camera);
          needs = false;
        }
        raf = requestAnimationFrame(loop);
      };
      const onMove = (e: PointerEvent) => {
        const r = cvs.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        let best = -1;
        let bd = 30 * 30;
        for (let k = 0; k < N; k++) {
          const v = V(k * SX, height(k * SX, 0), 0).project(camera);
          if (v.z > 1) continue;
          const sx = ((v.x + 1) / 2) * r.width;
          const sy = ((1 - v.y) / 2) * r.height;
          const d = (sx - mx) ** 2 + (sy - my) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
        setTip(best < 0 ? null : { x: Math.max(130, Math.min(r.width - 130, mx)), y: my, i: best });
      };
      const onLeave = () => setTip(null);

      frame();
      onScroll();
      window.addEventListener("resize", frame);
      window.addEventListener("scroll", onScroll, { passive: true });
      cvs.addEventListener("pointermove", onMove);
      cvs.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", frame);
        window.removeEventListener("scroll", onScroll);
        cvs.removeEventListener("pointermove", onMove);
        cvs.removeEventListener("pointerleave", onLeave);
        [g, eg, fg, dg].forEach((x) => x.dispose());
        [seaMat, edgeMat, foamMat, dotMat].forEach((x) => x.dispose());
        [foamTex, dotTex].forEach((x) => x.dispose());
        renderer.dispose();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [live, heats, beats, N]);

  const b = beat >= 0 ? beats[beat] : null;
  const t = tip ? heats[tip.i] : null;

  return (
    <section
      ref={sectionRef}
      aria-label={`${fullName}'s heats as a swell`}
      className={live ? "relative h-[520svh]" : "relative"}
    >
      {live ? (
        <div className="sticky top-0 h-[100svh] overflow-hidden md:top-[3.75rem] md:h-[calc(100svh-3.75rem)]">
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full touch-pan-y" />
          <div className="pointer-events-none absolute inset-0 mx-auto flex max-w-7xl flex-col justify-between px-4 pb-6 pt-5 sm:px-6">
            <p className="figures flex justify-between gap-4 text-caption text-fg-subtle">
              <span>The swell · {surname}</span>
              <span>{heatNow ? `Heat ${heatNow} of ${N}` : `${seasonsLabel} · ${N} rated heats`}</span>
            </p>
            <div
              aria-live="polite"
              className={`max-w-[30rem] border-l-2 border-fg-subtle bg-paper/80 px-4 py-3 transition-[opacity,transform] duration-500 ${
                b ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              {b && (
                <>
                  <span className="figures block text-caption text-fg-subtle">{b.kicker}</span>
                  <span className="mt-1 block font-serif text-[clamp(1.6rem,3.2vw,2.4rem)] italic leading-[1.05] text-fg">{b.head}</span>
                  <span className="mt-2 block text-body text-fg">{b.body}</span>
                </>
              )}
            </div>
          </div>
          <p
            className={`figures pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-caption text-fg-subtle transition-opacity ${
              heatNow == null && beat < 0 ? "opacity-100" : "opacity-0"
            }`}
          >
            Scroll to ride {N} heats
          </p>
          {t && tip && (
            <div
              className="pointer-events-none absolute min-w-[15rem] -translate-x-1/2 -translate-y-[calc(100%+1rem)] border border-hairline bg-paper/95 px-3 py-2 text-body-sm"
              style={{ left: tip.x, top: tip.y }}
            >
              <b className="block font-semibold text-fg">{label(t)}</b>
              <span className="flex justify-between gap-4 text-fg-muted">
                <span>{t.venue ?? "Venue not published"}</span>
                <span>{t.waveHeight ?? ""}</span>
              </span>
              <span className="flex justify-between gap-4 text-fg-muted">
                <span>Posted / expected</span>
                <span className="figures">
                  {f2(t.posted)} / {f2(t.datum)}
                </span>
              </span>
              <span className="flex justify-between gap-4 text-fg-muted">
                <span>Gap</span>
                <span className={`figures ${t.gap >= 0 ? "text-above" : "text-below"}`}>{s2(t.gap)}</span>
              </span>
            </div>
          )}
        </div>
      ) : null}

      {/* The four beats as text: the whole section for motion-off and no-WebGL
          visitors (and the prerendered HTML), screen-reader text otherwise. */}
      <div className={live ? "sr-only" : "mx-auto max-w-7xl px-4 pt-10 sm:px-6"}>
        <p className="text-caption text-fg-subtle">The swell · four moments from {N} rated heats</p>
        <ol className="mt-3 grid gap-x-8 border-t border-fg sm:grid-cols-2 lg:grid-cols-4">
          {beats.map((x) => (
            <li key={x.heat} className="border-b border-hairline py-4">
              <span className="figures block text-caption text-fg-subtle">{x.kicker}</span>
              <span className="mt-1 block font-serif text-[1.6rem] italic leading-tight text-fg">{x.head}</span>
              <span className="mt-1 block text-body-sm text-fg-muted">{x.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
