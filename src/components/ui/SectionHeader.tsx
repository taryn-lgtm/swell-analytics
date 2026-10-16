import Link from "next/link";

/**
 * Section header in the Swell style (M4): a hairline overline, a quiet
 * kicker and a plain Bricolage heading. The accent is not used here; it is
 * reserved for meaning (above the line, leader, champion).
 */
export default function SectionHeader({
  title,
  kicker,
  href,
  hrefLabel = "View all",
}: {
  title: string;
  kicker?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-6 border-t border-fg pt-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          {kicker && (
            <p className="text-caption tracking-[0.06em] text-fg-subtle">
              {kicker}
            </p>
          )}
          <h2 className="mt-1 text-balance font-display text-[clamp(1.4rem,2.6vw,2rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
            {title}
          </h2>
        </div>
        {href && (
          <Link
            href={href}
            className="mb-0.5 shrink-0 text-body-sm font-medium text-link hover:underline"
          >
            {hrefLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}
