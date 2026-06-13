import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo } from "react";
import { Skeleton } from "@/components/Skeleton";
import queryKeys from "@/lib/query-keys";
import { getDateRange, getTimezone, toIsoDate } from "@/lib/utils/dates";
import { activityActions } from "@/server-fcts/activities";
import { cookieActions } from "@/server-fcts/cookies";
import type { CalendarScope } from "@/types/requests/activities";

export const CalendarToggle: React.FC<{
  period: CalendarScope;
  setPeriod: React.Dispatch<React.SetStateAction<CalendarScope>>;
  anchor: string;
  setAnchor: React.Dispatch<React.SetStateAction<string>>;
}> = ({ period, anchor, setPeriod, setAnchor }) => {
  const queryClient = useQueryClient();

  const runSetCalendarScope = useServerFn(cookieActions.setCalendarScope);

  const calStep = useCallback(
    (dir: 1 | -1) => {
      const [y, m, d] = anchor.split("-").map(Number);
      let next: Date;
      if (period === "month") {
        next = new Date(y, m - 1 + dir, 1);
      } else {
        next = new Date(y, m - 1, d + dir * 7);
      }
      const ny = next.getFullYear();
      const nm = String(next.getMonth() + 1).padStart(2, "0");
      const nd = String(next.getDate()).padStart(2, "0");
      return `${ny}-${nm}-${nd}`;
    },
    [anchor, period],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: <not using query client as dep>
  useEffect(() => {
    if (!anchor) return;
    const prevAnchor = calStep(-1);
    const nextAnchor = calStep(1);
    queryClient.prefetchQuery({
      queryKey: queryKeys.calendarQueryKey(period, prevAnchor),
      queryFn: () =>
        activityActions.calendar({
          data: {
            period,
            anchor: prevAnchor,
          },
        }),
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.calendarQueryKey(period, nextAnchor),
      queryFn: () =>
        activityActions.calendar({
          data: {
            period,
            anchor: nextAnchor,
          },
        }),
    });
  }, [period, anchor, calStep]);

  const persistCalendarScopeMutation = useMutation({
    mutationFn: (scope: CalendarScope) =>
      runSetCalendarScope({ data: { scope } }),
    onSuccess: (_, scope) => {
      setPeriod(scope);
    },
  });

  const periodLabel = useMemo(() => {
    if (!anchor) return;
    if (period === "month") {
      const [y, m] = anchor.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    }

    const { dateFrom, dateTo } = getDateRange({
      period,
      anchor,
    });
    const start = new Date(`${dateFrom}T12:00:00`);
    const end = new Date(`${dateTo}T12:00:00`);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [period, anchor]);

  return (
    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAnchor(calStep(-1))}
          aria-label={period === "week" ? "Previous week" : "Previous month"}
          className="touch-manipulation rounded border border-zinc-700 px-2.5 py-1 sm:px-3 sm:py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          ←
        </button>
        {periodLabel ? (
          <span className="min-w-0 max-w-[min(100%,16rem)] truncate text-center text-sm font-medium text-zinc-200">
            {periodLabel}
          </span>
        ) : (
          <Skeleton className="w-32 h-5" />
        )}
        <button
          type="button"
          onClick={() => setAnchor(calStep(1))}
          aria-label={period === "week" ? "Next week" : "Next month"}
          className="touch-manipulation rounded border border-zinc-700 px-2.5 py-1 sm:px-3 sm:py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          →
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAnchor(toIsoDate(new Date(), getTimezone()))}
          className="touch-manipulation rounded border border-zinc-700 px-2.5 py-1 sm:px-3 sm:py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          Today
        </button>
        <div className="flex rounded-md border border-zinc-700 p-0.5 text-xs text-zinc-400">
          <button
            type="button"
            aria-pressed={period === "month"}
            disabled={persistCalendarScopeMutation.isPending}
            onClick={() => persistCalendarScopeMutation.mutate("month")}
            className={`touch-manipulation rounded px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-50 ${
              period === "month"
                ? "bg-zinc-800 font-medium text-zinc-100"
                : "hover:bg-zinc-900/80"
            }`}
          >
            <span className="hidden sm:block">Month</span>
            <span className="block sm:hidden">M</span>
          </button>
          <button
            type="button"
            aria-pressed={period === "week"}
            disabled={persistCalendarScopeMutation.isPending}
            onClick={() => persistCalendarScopeMutation.mutate("week")}
            className={`touch-manipulation rounded px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-50 ${
              period === "week"
                ? "bg-zinc-800 font-medium text-zinc-100"
                : "hover:bg-zinc-900/80"
            }`}
          >
            <span className="hidden sm:block">Week</span>
            <span className="block sm:hidden">W</span>
          </button>
        </div>
      </div>
    </div>
  );
};
