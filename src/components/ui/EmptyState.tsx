/** Honest empty state — data is never invented; absence is stated. */
export default function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="border border-dashed border-hairline-strong bg-paper-sunken px-6 py-10 text-center">
      <p className="text-body font-medium text-fg-muted">{title}</p>
      {detail && <p className="mt-1 text-body-sm text-fg-subtle">{detail}</p>}
    </div>
  );
}
