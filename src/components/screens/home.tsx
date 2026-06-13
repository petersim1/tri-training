import { useRef, useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { useDay } from "@/providers/day";
import type { CalendarScope } from "@/types/requests/activities";
import { ActivityModal } from "../Modals/activity";
import { CalendarGrid } from "../views/calendar/grid";
import { CalendarToggle } from "../views/calendar/toggle";
import { Visualizer } from "../views/visuals";

export const Home: React.FC<{
  initialCalendarScope: CalendarScope;
  initialChartSettings: SessionChartSettings;
}> = ({ initialCalendarScope, initialChartSettings }) => {
  const { todayKey } = useDay();

  const [period, setPeriod] = useState(initialCalendarScope);
  const [anchor, setAnchor] = useState(todayKey);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const calendarSectionRef = useRef<HTMLElement | null>(null);

  function openDay(dayKey: string) {
    // setHighlightedDayKey(null);
    setSelectedDay(dayKey);
  }

  return (
    <div className="space-y-8">
      <section ref={calendarSectionRef} className="space-y-2 scroll-mt-4">
        <CalendarToggle
          anchor={anchor}
          period={period}
          setAnchor={setAnchor}
          setPeriod={setPeriod}
        />

        <CalendarGrid
          anchor={anchor}
          period={period}
          setSelectedDay={openDay}
        />
      </section>

      <Visualizer initialChartSettings={initialChartSettings} />

      {!!selectedDay && (
        <ActivityModal
          dayKey={selectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
};
