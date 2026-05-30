import { useMemo, useRef, useState } from "react";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import type { CalendarScope } from "@/types/requests/activities";
import { ActivityModal } from "../Modals/activity";
import { CalendarGrid } from "../views/calendar/grid";
import { CalendarToggle } from "../views/calendar/toggle";
import { Visualizer } from "../views/visuals";

export const Home: React.FC<{
  initialCalendarScope: CalendarScope;
  initialChartSettings: SessionChartSettings;
}> = ({ initialCalendarScope, initialChartSettings }) => {
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()),
    [tz],
  );

  const [period, setPeriod] = useState(initialCalendarScope);
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // const [highlightedDayKey, setHighlightedDayKey] = useState<string | null>(
  //   null,
  // );

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
          timeZone={tz}
          today={today}
          setAnchor={setAnchor}
          setPeriod={setPeriod}
        />

        <CalendarGrid
          anchor={anchor}
          period={period}
          timeZone={tz}
          today={today}
          selectedDay={selectedDay}
          setSelectedDay={openDay}
        />
      </section>

      <Visualizer initialChartSettings={initialChartSettings} />

      {!!selectedDay && (
        <ActivityModal
          dayKey={selectedDay}
          timeZone={tz}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
};
