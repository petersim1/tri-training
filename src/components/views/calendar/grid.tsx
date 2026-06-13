import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import queryKeys from "@/lib/query-keys";
import {
  enumerateLocalDayKeysInclusive,
  getDateRange,
  toIsoDate,
} from "@/lib/utils/dates";
import { useDay } from "@/providers/day";
import { activityActions } from "@/server-fcts/activities";
import type { CalendarScope } from "@/types/requests/activities";
import { type CalendarCell, CalendarDayItem } from "./day";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CalendarGrid: React.FC<{
  period: CalendarScope;
  anchor: string;
  setSelectedDay: (dayKey: string) => void;
}> = ({ period, anchor, setSelectedDay }) => {
  const { todayKey, timeZone } = useDay();

  const { data: periodActivities = [], isLoading } = useQuery({
    queryKey: queryKeys.calendarQueryKey(period, anchor),
    queryFn: () =>
      activityActions.calendar({
        data: {
          period,
          anchor,
          timezone: timeZone,
        },
      }),
  });

  const { data: unlinkedActivities } = useSuspenseQuery({
    queryKey: queryKeys.unlinkedActivities,
    queryFn: () => activityActions.unlinked(),
  });

  const calendarCells = useMemo((): CalendarCell[] => {
    const unlinkedByDay = Map.groupBy(unlinkedActivities, (a) =>
      toIsoDate(a.createdAt, timeZone),
    );

    const { dateFrom, dateTo } = getDateRange({
      period,
      anchor,
      timezone: timeZone,
    });
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

    const gridFrom = toIsoDate(gridStart, timeZone);
    const gridTo = toIsoDate(gridEnd, timeZone);

    console.log({
      todayKey,
      timeZone,
      gridFrom,
      gridTo,
      keys: enumerateLocalDayKeysInclusive(gridFrom, gridTo),
      todayCell: enumerateLocalDayKeysInclusive(gridFrom, gridTo).find(
        (k) => k === todayKey,
      ),
    });

    return enumerateLocalDayKeysInclusive(gridFrom, gridTo).map((dayKey) => ({
      dayKey,
      activities: calendarByDay.get(dayKey)?.activities ?? [],
      hasWeight: calendarByDay.get(dayKey)?.hasWeight ?? false,
      hasUnlinked: (unlinkedByDay.get(dayKey)?.length ?? 0) > 0,
      isCurrentPeriod: dayKey >= dateFrom && dayKey <= dateTo,
      isToday: dayKey === todayKey,
    }));
  }, [
    periodActivities,
    unlinkedActivities,
    period,
    anchor,
    timeZone,
    todayKey,
  ]);

  return (
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
        {calendarCells.map((cell) => (
          <CalendarDayItem
            key={`${cell.dayKey}-${anchor}-${period}`}
            day={cell}
            isLoading={isLoading}
            layout={period}
            onOpenDay={() => setSelectedDay(cell.dayKey)}
          />
        ))}
      </div>
    </div>
  );
};
