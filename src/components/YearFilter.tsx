"use client";

import Link from "next/link";
import { Year } from "@/lib/constants";

interface YearLink {
  year: Year;
  href: string;
}

interface Props {
  currentYear: Year;
  links: YearLink[];
}

export default function YearFilter({ currentYear, links }: Props) {
  return (
    <div className="flex gap-1">
      {links.map(({ year, href }) => (
        <Link
          key={year}
          href={href}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            year === currentYear
              ? "bg-cyan-500 text-white"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
          }`}
        >
          {year}
        </Link>
      ))}
    </div>
  );
}
