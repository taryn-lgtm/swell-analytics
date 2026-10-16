import Link from "next/link";
import SwellMark from "@/components/SwellMark";

/**
 * The seasons line is the coverage statement the definition of beta
 * requires in the chrome, read from `seasons` -- two seasons, named,
 * never "Era A" and never a range.
 */
export default function SiteFooter({ seasonsLabel }: { seasonsLabel: string }) {
  const linkClass = "inline-flex min-h-8 items-center text-fg-muted hover:text-fg";
  return (
    <footer className="mt-16 border-t border-hairline bg-paper-sunken">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 text-body-sm sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-fg" aria-label="WSL Analytics home">
            <SwellMark />
            <span className="font-serif text-[1.45rem] font-medium italic leading-none">WSL Analytics</span>
          </Link>
          <p className="mt-3 max-w-[42ch] text-fg-subtle">
            An independent read of the men&apos;s Championship Tour: every heat measured against
            what the round normally produces.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-caption font-semibold uppercase tracking-[0.12em] text-fg-subtle">Read</h2>
          <ul>
            <li><Link href="/" className={linkClass}>Home</Link></li>
            <li><Link href="/rankings" className={linkClass}>Rankings</Link></li>
            <li><Link href="/trim" className={linkClass}>How Trim works</Link></li>
            <li><Link href="/about" className={linkClass}>How the numbers are made</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-caption font-semibold uppercase tracking-[0.12em] text-fg-subtle">Data</h2>
          <ul className="space-y-1.5 text-fg-muted">
            <li>
              {seasonsLabel
                ? `Men's Championship Tour, ${seasonsLabel} seasons only`
                : "No seasons loaded"}
            </li>
            <li>Results to 4 September 2025</li>
            <li>2026 season not yet loaded</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-hairline">
        <p className="mx-auto max-w-7xl px-4 py-5 text-caption text-fg-subtle sm:px-6">
          Unofficial. An independent project, not affiliated with or endorsed by the World Surf
          League. Results are as published on worldsurfleague.com; Datum and Trim are this
          project&apos;s own derived measures.
        </p>
      </div>
    </footer>
  );
}
