import { PlanActivityKindIcon, WeightIcon } from "@/components/assets";
import { cn } from "@/lib/utils";
import type {
  ActivityItem,
  CalendarPageItem,
} from "@/types/responses/activities";

export type HomeCalendarDayLayout = "month" | "week";

const CalendarDayActivityIcons = ({
  dayPlans,
}: {
  dayPlans: ActivityItem[];
}) => {
  if (dayPlans.length === 0) {
    return (
      <span className="text-sm leading-none text-zinc-600" aria-hidden>
        ·
      </span>
    );
  }

  return (
    <>
      {dayPlans.map((p) => (
        <span
          key={p.id}
          title={`${p.kind}${p.status === "completed" ? " · completed" : ""}`}
          className={
            p.status === "completed"
              ? "inline-flex shrink-0 text-emerald-500"
              : "inline-flex shrink-0 text-zinc-500"
          }
        >
          <PlanActivityKindIcon kind={p.kind} />
        </span>
      ))}
    </>
  );
};

const CAL_DAY_DOT_BASE =
  "inline-flex size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/25";
const CAL_DAY_DOT_UNLINKED = `${CAL_DAY_DOT_BASE} bg-violet-400`;

type CalendarDayProps = {
  day: CalendarCell;
  isHighlighted: boolean;
  layout: HomeCalendarDayLayout;
  onOpenDay: () => void;
};

export type CalendarCell = CalendarPageItem & {
  hasUnlinked: boolean;
  isCurrentPeriod: boolean;
  isToday: boolean;
};

export const CalendarDayItem: React.FC<CalendarDayProps> = ({
  day,
  layout,
  isHighlighted,
  onOpenDay,
}) => {
  const dayN = Number(day.dayKey.split("-").slice(-1)[0]);
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden bg-zinc-950",
        layout === "week" && "h-18",
        layout === "month" && "h-16 lg:h-18",
        isHighlighted
          ? "z-4 ring-2 ring-sky-500/80 ring-inset"
          : day.isToday
            ? "ring-1 ring-emerald-600/50 ring-inset"
            : "",
      )}
    >
      {day.isCurrentPeriod && (
        <>
          <button
            type="button"
            className={cn(
              "absolute inset-0 z-1 border-0 bg-transparent p-0",
              "cursor-pointer hover:bg-zinc-900/45 focus-visible:z-5 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset touch-manipulation",
            )}
            onClick={onOpenDay}
          />
          <div className="relative z-2 flex h-full min-h-0 w-full flex-col px-0.5 pt-1 pb-0 pointer-events-none">
            <div className="relative mb-0.5 min-h-5 w-full shrink-0">
              <span
                className={cn(
                  "relative z-1 block w-full text-center text-sm font-medium tabular-nums leading-none",
                  day.isToday ? "text-emerald-400" : "text-zinc-200/50",
                )}
              >
                {dayN}
              </span>
              {day.hasWeight ? (
                <WeightIcon className="pointer-events-auto absolute right-0.5 top-0.5 z-4 text-amber-400" />
              ) : null}
              {day.hasUnlinked ? (
                <span
                  className={`absolute right-0.5 top-0.5 z-4 ${CAL_DAY_DOT_UNLINKED}`}
                  title="Session not linked to a plan"
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-1 sm:gap-2">
              <CalendarDayActivityIcons dayPlans={day.activities} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
