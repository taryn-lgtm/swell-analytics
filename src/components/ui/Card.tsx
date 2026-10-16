/**
 * The data container. In the Swell style (M4) it is a ruled block, not a box:
 * a rule above, no side walls, no surface shift, never a shadow.
 */
export default function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-t border-hairline-strong ${className}`}>
      {children}
    </div>
  );
}
