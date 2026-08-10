import { Suspense, useRef, useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { getToday } from "@/lib/utils/dates";
import type { CalendarScope } from "@/types/requests/activities";
import { CalendarGrid, CalendarGridLoading } from "../views/calendar/grid";
import { CalendarToggle } from "../views/calendar/toggle";
import { Visualizer } from "../views/visuals";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const Home: React.FC<{
  initialCalendarScope: CalendarScope;
  initialChartSettings: SessionChartSettings;
}> = ({ initialCalendarScope, initialChartSettings }) => {
  const [period, setPeriod] = useState(initialCalendarScope);
  const [anchor, setAnchor] = useState(() => getToday());

  const calendarSectionRef = useRef<HTMLElement | null>(null);

  return (
    <div className="space-y-8">
      <section ref={calendarSectionRef} className="space-y-2 scroll-mt-4">
        <CalendarToggle
          anchor={anchor}
          period={period}
          setAnchor={setAnchor}
          setPeriod={setPeriod}
        />
        <div className="grid min-w-0 grid-cols-7 gap-px rounded-lg overflow-hidden border border-zinc-800 bg-zinc-800">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-zinc-900 px-0.5 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500"
            >
              {w}
            </div>
          ))}
          <Suspense fallback={<CalendarGridLoading period={period} />}>
            <CalendarGrid anchor={anchor} period={period} />
          </Suspense>
        </div>
      </section>

      <Visualizer initialChartSettings={initialChartSettings} />
    </div>
  );
};
