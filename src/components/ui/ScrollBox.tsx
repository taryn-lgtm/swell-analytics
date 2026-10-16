"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one horizontal scroller on the site. Tables and the Trim timeline scroll
 * inside their own box rather than shrink or drop columns, and a sideways
 * scroll nothing announces hides whatever sits past the edge. So the box says
 * so in words while there is more in either direction.
 *
 * The cue line always takes its space, visible or not, so the page does not
 * shift as the reader scrolls. `data-scroller` / `data-scroll-cue` are what
 * scripts/mobile_audit.cjs checks.
 */
export default function ScrollBox({
  children,
  label,
  cueRight = "More columns — scroll sideways →",
  cueLeft = "← Scroll back",
  startAtEnd = false,
  bare = false,
  className = "",
}: {
  children: React.ReactNode;
  /** Accessible name for the scroll region, which is keyboard-focusable. */
  label: string;
  cueRight?: string;
  cueLeft?: string;
  /** Open scrolled to the right edge, e.g. a timeline whose latest point matters most. */
  startAtEnd?: boolean;
  /** No border or ground of its own: for a table already inside a Card. */
  bare?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rest = el.scrollWidth - el.clientWidth;
    setMore({ left: el.scrollLeft > 1, right: rest - el.scrollLeft > 1 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (startAtEnd) el.scrollLeft = el.scrollWidth;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [startAtEnd, measure]);

  const cue = more.right ? cueRight : more.left ? cueLeft : null;

  return (
    <div>
      <p
        aria-hidden
        data-scroll-cue={cue ? "visible" : "hidden"}
        className={`mb-1.5 text-caption tracking-[0.04em] text-fg-subtle ${bare ? "px-3 pt-2" : ""} ${
          more.right ? "text-right" : "text-left"
        } ${cue ? "" : "invisible"}`}
      >
        {cue ?? cueRight}
      </p>
      <div
        ref={ref}
        data-scroller
        tabIndex={0}
        role="region"
        aria-label={label}
        className={`overflow-x-auto ${bare ? "" : "border-t border-fg"} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
