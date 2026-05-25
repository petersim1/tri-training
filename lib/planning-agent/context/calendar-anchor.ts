/**
 * Derive "today" and weekday labels in the user's timezone (IANA from client).
 * Used for planning-chat system prompt and for tools that interpret calendar days.
 */
export type PlanningCalendarAnchor = {
  todayYmd: string;
  weekdayLong: string;
};

export function planningCalendarAnchorInTimeZone(
  ianaTimeZone: string,
  instant: Date = new Date(),
): PlanningCalendarAnchor {
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

  const weekdayLong = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaTimeZone,
    weekday: "long",
  }).format(instant);

  return { todayYmd, weekdayLong };
}
