import Link from "next/link";
import SwellMark, { Wordmark } from "@/components/SwellMark";
import NavLinks from "@/components/NavLinks";

/**
 * Chrome, in the Swell design (M4). The nav carries only routes that exist as
 * index pages; surfer and event pages are reached from the tables.
 *
 * The seasons readout is passed in from the database by the layout -- the
 * chrome names the seasons held rather than asserting a range.
 */
export default function SiteHeader({ seasonsLabel }: { seasonsLabel: string }) {
  return (
    <header className="z-50 border-b border-chrome-hairline bg-chrome/95 text-chrome-fg backdrop-blur md:sticky md:top-0">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-1 px-4 py-2 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2.5" aria-label="Swell Analytics home">
          <SwellMark />
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="order-last w-full overflow-x-auto md:order-none md:w-auto">
          <NavLinks />
        </nav>
        <p className="figures ml-auto hidden text-caption text-chrome-fg-muted md:block">
          {seasonsLabel ? `Men's CT ${seasonsLabel} · results to 4 September 2025` : "No seasons loaded"}
        </p>
      </div>
    </header>
  );
}
