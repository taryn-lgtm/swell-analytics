const VARIANTS = {
  neutral: "border border-hairline bg-paper-sunken text-fg-muted",
  accent: "border border-accent-strong/40 bg-accent-soft text-accent-strong",
  chrome: "bg-chrome text-chrome-fg",
  outline: "border border-hairline-strong text-fg-muted",
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export default function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-caption font-semibold tracking-[0.04em] ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
