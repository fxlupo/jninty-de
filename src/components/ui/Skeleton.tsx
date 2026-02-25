export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded-lg bg-cream-200 ${className}`}
    />
  );
}
