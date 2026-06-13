import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import queryKeys from "@/lib/query-keys";
import { activityActions } from "@/server-fcts/activities";
import type { CalendarScope } from "@/types/requests/activities";
import { CalendarDayItem } from "./day";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CalendarGrid: React.FC<{
  period: CalendarScope;
  anchor: string;
  setSelectedDay: (dayKey: string) => void;
}> = ({ period, anchor, setSelectedDay }) => {
  const periodUse = useDeferredValue(period);
  const anchorUse = useDeferredValue(anchor);

  const { data = [], isLoading } = useSuspenseQuery({
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
        {data.map((cell) => (
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
