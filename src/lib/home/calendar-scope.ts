export const CALENDAR_SCOPE_COOKIE = "wt_calendar_scope" as const;

export type CalendarScope = "month" | "week";

export function parseCalendarScope(raw: string | undefined): CalendarScope {
  if (raw === "week" || raw === "month") {
    return raw;
  }
  return "month";
}
