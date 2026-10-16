"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/rankings", label: "Rankings" },
  { href: "/trim", label: "Trim" },
  { href: "/compare", label: "Compare" },
] as const;

/** Client only for the current-page underline. */
export default function NavLinks() {
  const path = usePathname();
  return (
    <ul className="flex gap-1 whitespace-nowrap text-body-sm">
      {NAV_LINKS.map(({ href, label }) => {
        const current = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-3 transition-colors ${
                current
                  ? "border-accent text-chrome-fg"
                  : "border-transparent text-chrome-fg-muted hover:text-chrome-fg"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
