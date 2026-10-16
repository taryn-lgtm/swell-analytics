"use client";

import Link from "next/link";

/**
 * Season navigation. URL-driven (no client state): each season is a link
 * built from `basePath`, so server components stay the source of truth.
 * 2020 is intentionally absent from `seasons` (COVID — no heat data).
 */
export default function SeasonSelector({
  seasons,
  current,
  basePath,
}: {
  seasons: number[];
  current: number;
  basePath: string;
}) {
  return (
    <nav aria-label="Season" className="border-b border-hairline">
      <ul className="flex flex-wrap">
        {seasons.map((year) => {
          const active = year === current;
          return (
            <li key={year}>
              <Link
                href={`${basePath}/${year}`}
                aria-current={active ? "page" : undefined}
                className={`figures -mb-px inline-block border-b-2 px-2.5 py-1.5 text-body-sm font-medium transition-colors ${
                  active
                    ? "border-fg text-fg"
                    : "border-transparent text-fg-subtle hover:border-hairline-strong hover:text-fg"
                }`}
              >
                {year}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
