import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import {
  enumerateLocalDayKeysInclusive,
  getDateRange,
  toIsoDate,
} from "@/lib/utils/dates";
import { activityActions, cookieActions } from "@/server-fcts";
import type { CalendarScope } from "@/types/requests/activities";
import { type CalendarCell, CalendarDayItem } from "../views/calendar";
import { Visualizer } from "../views/visuals";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const Home: React.FC<{
  initialCalendarScope: CalendarScope;
  initialChartSettings: SessionChartSettings;
}> = ({ initialCalendarScope, initialChartSettings }) => {
  const queryClient = useQueryClient();

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()),
    [tz],
  );

  const [period, setPeriod] = useState(initialCalendarScope);
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [highlightedDayKey, setHighlightedDayKey] = useState<string | null>(
    null,
  );

  const calendarSectionRef = useRef<HTMLElement | null>(null);

  const runSetCalendarScope = useServerFn(cookieActions.setCalendarScope);

  const navigate = useCallback(
    (dir: 1 | -1) => {
      const [y, m, d] = anchor.split("-").map(Number);
      let next: Date;
      if (period === "month") {
        next = new Date(y, m - 1 + dir, 1);
      } else {
        next = new Date(y, m - 1, d + dir * 7);
      }
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(next);
    },
    [anchor, period, tz],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: <not using query client as dep>
  useEffect(() => {
    const prevAnchor = navigate(-1);
    const nextAnchor = navigate(1);
    queryClient.prefetchQuery({
      queryKey: queryKeys.calendarQueryKey(period, prevAnchor),
      queryFn: () =>
        activityActions.calendar({
          data: {
            timezone: tz,
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
            timezone: tz,
            period,
            anchor: nextAnchor,
          },
        }),
    });
  }, [period, anchor, navigate]);

  const persistCalendarScopeMutation = useMutation({
    mutationFn: (scope: CalendarScope) =>
      runSetCalendarScope({ data: { scope } }),
    onSuccess: (_, scope) => {
      setPeriod(scope);
    },
  });

  const { data: periodActivities = [] } = useQuery({
    queryKey: queryKeys.calendarQueryKey(period, anchor),
    queryFn: () =>
      activityActions.calendar({
        data: {
          timezone: tz,
          period,
          anchor,
        },
      }),
  });

  const { data: unlinkedActivities } = useSuspenseQuery({
    queryKey: queryKeys.unlinkedActivities,
    queryFn: () => activityActions.unlinked(),
  });

  const calendarCells = useMemo((): CalendarCell[] => {
    const unlinkedByDay = Map.groupBy(unlinkedActivities, (a) =>
      toIsoDate(a.createdAt, tz),
    );

    const { dateFrom, dateTo } = getDateRange({ period, anchor, timezone: tz });
    const calendarByDay = new Map(
      periodActivities.map((item) => [item.dayKey, item]),
    );

    // Expand to full weeks for grid padding
    const [fy, fm, fd] = dateFrom.split("-").map(Number);
    const [ty, tm, td] = dateTo.split("-").map(Number);
    const gridStart = new Date(fy, fm - 1, fd);
    const gridEnd = new Date(ty, tm - 1, td);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const gridFrom = toIsoDate(gridStart, tz);
    const gridTo = toIsoDate(gridEnd, tz);

    return enumerateLocalDayKeysInclusive(gridFrom, gridTo).map((dayKey) => ({
      dayKey,
      activities: calendarByDay.get(dayKey)?.activities ?? [],
      hasWeight: calendarByDay.get(dayKey)?.hasWeight ?? false,
      hasUnlinked: (unlinkedByDay.get(dayKey)?.length ?? 0) > 0,
      isCurrentPeriod: dayKey >= dateFrom && dayKey <= dateTo,
      isToday: dayKey === today,
    }));
  }, [periodActivities, unlinkedActivities, period, anchor, tz, today]);

  const periodLabel = useMemo(() => {
    if (period === "month") {
      const [y, m] = anchor.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    }

    const { dateFrom, dateTo } = getDateRange({ period, anchor, timezone: tz });
    const start = new Date(`${dateFrom}T12:00:00`);
    const end = new Date(`${dateTo}T12:00:00`);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [period, anchor, tz]);

  function openDay(dayKey: string) {
    setHighlightedDayKey(null);
    setSelectedDay(dayKey);
  }

  return (
    <div className="space-y-8">
      <section ref={calendarSectionRef} className="space-y-2 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAnchor(navigate(-1))}
              aria-label={
                period === "week" ? "Previous week" : "Previous month"
              }
              className="touch-manipulation rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              ←
            </button>
            <span className="min-w-0 max-w-[min(100%,16rem)] truncate text-center text-sm font-medium text-zinc-200">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={() => setAnchor(navigate(1))}
              aria-label={period === "week" ? "Next week" : "Next month"}
              className="touch-manipulation rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              className="touch-manipulation rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
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
                Month
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
                Week
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
          <div className="grid min-w-0 grid-cols-7 gap-px">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="bg-zinc-900 px-0.5 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500"
              >
                {w}
              </div>
            ))}
            {calendarCells.map((cell) => {
              return (
                <CalendarDayItem
                  key={`${cell.dayKey}-${anchor}-${period}`}
                  day={cell}
                  isHighlighted={cell.dayKey === selectedDay}
                  layout={period}
                  onOpenDay={() => openDay(cell.dayKey)}
                />
              );
            })}
          </div>
        </div>
      </section>

      <Visualizer initialChartSettings={initialChartSettings} />

      {/* {!!selectedDay && (
        <ActivityModal
          day={selectedDay}
          state="summary"
          onClose={closeWeightDialog}
        />
      )} */}
    </div>
  );
};
