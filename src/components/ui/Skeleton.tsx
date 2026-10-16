export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`animate-pulse bg-paper-sunken ${className}`} />
  );
}
