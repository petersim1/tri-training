/** Pulse bar for loading placeholders. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-zinc-800/90 ${className}`}
    />
  );
}

function PlanRowSkeleton() {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-[min(100%,18rem)]" />
        <Skeleton className="h-3 w-[min(100%,24rem)]" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-9" />
      </div>
    </li>
  );
}

const ROW_KEYS = [
  "sk-0",
  "sk-1",
  "sk-2",
  "sk-3",
  "sk-4",
  "sk-5",
  "sk-6",
  "sk-7",
  "sk-8",
  "sk-9",
  "sk-10",
  "sk-11",
] as const;

export function PlanListSkeleton({ count = 6 }: { count?: number }) {
  const keys = ROW_KEYS.slice(0, count);
  return (
    <ul
      className="divide-y divide-zinc-800 rounded border border-zinc-800"
      aria-busy
      aria-label="Loading plans"
    >
      {keys.map((k) => (
        <PlanRowSkeleton key={k} />
      ))}
    </ul>
  );
}

function ActivityRowSkeleton() {
  return (
    <li className="min-w-0 rounded-lg border border-zinc-800/90 bg-zinc-950/50 px-3 py-3 shadow-sm shadow-black/30">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-24 shrink-0" />
        </div>
        <Skeleton className="h-8 w-full max-w-full" />
        <Skeleton className="h-6 w-full max-w-full" />
      </div>
    </li>
  );
}

export function ActivityListSkeleton({ count = 6 }: { count?: number }) {
  const keys = ROW_KEYS.slice(0, count);
  return (
    <ul
      className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-5 md:gap-y-5"
      aria-busy
      aria-label="Loading activities"
    >
      {keys.map((k) => (
        <ActivityRowSkeleton key={k} />
      ))}
    </ul>
  );
}
