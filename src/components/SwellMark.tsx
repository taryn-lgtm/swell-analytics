/** The three-line wave mark from the Swell concept: sand yellow above, sea blue below. */
export default function SwellMark({ className = "" }: { className?: string }) {
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden className={className}>
      <path d="M1 7 C6 1, 10 1, 14 6 S23 12, 33 4" fill="none" stroke="var(--above)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M1 13 C6 8, 11 8, 15 12 S24 17, 33 10" fill="none" stroke="var(--fg)" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      <path d="M1 19 C7 15, 12 15, 16 18 S25 21, 33 16" fill="none" stroke="var(--below)" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

/** The wordmark: "Swell" in Bodoni italic, "Analytics" set small in the text face. */
export function Wordmark() {
  return (
    <span className="inline-flex items-baseline gap-1.5 leading-none">
      <span className="font-serif text-[1.55rem] font-medium italic tracking-[-0.01em]">Swell</span>
      <span className="text-caption font-medium tracking-[0.08em] text-chrome-fg-muted">Analytics</span>
    </span>
  );
}
