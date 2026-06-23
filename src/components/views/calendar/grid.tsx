import { useSuspenseQuery } from "@tanstack/react-query";
import type React from "react";
import { useDeferredValue } from "react";
import queryKeys from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { activityActions } from "@/server-fcts/activities";
import type { CalendarScope } from "@/types/requests/activities";
import { CalendarDayItem } from "./day";

export const CalendarGridLoading: React.FC<{ period: CalendarScope }> = ({
  period,
}) => {
  return (
    <>
      {Array.from({ length: period === "week" ? 7 : 35 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "relative flex min-w-0 flex-col overflow-hidden bg-zinc-950",
            "calendar-cell-loading",
            period === "week" && "h-16 sm:h-18",
            period === "month" && "h-16 lg:h-18",
          )}
        />
      ))}
    </>
  );
};

export const CalendarGrid: React.FC<{
  period: CalendarScope;
  anchor: string;
  setSelectedDay: (dayKey: string) => void;
}> = ({ period, anchor, setSelectedDay }) => {
  const periodUse = useDeferredValue(period);
  const anchorUse = useDeferredValue(anchor);

  const { data } = useSuspenseQuery({
    queryKey: queryKeys.calendarQueryKey(periodUse, anchorUse),
    queryFn: () =>
      activityActions.calendar({
        data: {
          period: periodUse,
          anchor: anchorUse,
        },
      }),
  });

  return (
    <>
      {data.map((cell) => (
        <CalendarDayItem
          key={`${cell.dayKey}-${anchor}-${period}`}
          day={cell}
          period={period}
          onOpenDay={() => setSelectedDay(cell.dayKey)}
        />
      ))}
    </>
  );
};
