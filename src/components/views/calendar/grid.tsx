import { useSuspenseQuery } from "@tanstack/react-query";
import type React from "react";
import { useDeferredValue, useState } from "react";
import { ActivityModal } from "@/components/Modals/activity";
import { getters } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import type { CalendarScope } from "@/types/requests/activities";
import { CalendarPageItem } from "@/types/responses/activities";
import { CalendarDayItem } from "./day";

export const CalendarGridLoading: React.FC<{ period: CalendarScope }> = ({ period }) => {
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
}> = ({ period, anchor }) => {
  const periodUse = useDeferredValue(period);
  const anchorUse = useDeferredValue(anchor);

  const [selectedDay, setSelectedDay] = useState<CalendarPageItem | undefined>(undefined);

  const { data } = useSuspenseQuery(
    getters.calendar.list({
      period: periodUse,
      anchor: anchorUse,
    }),
  );

  return (
    <>
      {data.map((cell) => (
        <CalendarDayItem
          key={`${cell.dayKey}-${anchor}-${period}`}
          day={cell}
          period={period}
          onOpenDay={() => setSelectedDay(cell)}
        />
      ))}
      {!!selectedDay && (
        <ActivityModal day={selectedDay} onClose={() => setSelectedDay(undefined)} />
      )}
    </>
  );
};
