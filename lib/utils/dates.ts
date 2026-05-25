import type { CalendarSchemaValues } from "@/types/requests/activities";

export const isValidIanaTimeZone = (tz: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return Boolean(tz.trim());
  } catch {
    return false;
  }
};

export const todayLocalDayKey = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

export const dayKeyFromParts = (y: number, m0: number, day: number): string => {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const toIsoDate = (date: Date, tz: string) => {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
};

export const enumerateLocalDayKeysInclusive = (
  from: string,
  to: string,
): string[] => {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [from];
  }
  if (start > end) {
    return [from];
  }
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

export const formatPlanDayKey = (dayKey: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) {
    return dayKey;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const toUtcBounds = (
  dayKey: string,
  tz: string,
): { start: Date; end: Date } => {
  const offsetMs = (date: Date) =>
    new Date(date.toLocaleString("en-US", { timeZone: tz })).getTime() -
    date.getTime();

  const start = new Date(`${dayKey}T00:00:00`);
  const end = new Date(`${dayKey}T23:59:59.999`);

  return {
    start: new Date(start.getTime() - offsetMs(start)),
    end: new Date(end.getTime() - offsetMs(end)),
  };
};

export const getDateRange = (
  dates: CalendarSchemaValues,
): { dateFrom: string; dateTo: string } => {
  const { period, anchor, timezone } = dates;

  const [yearStr, monthStr, dayStr] = anchor.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);

  if (period === "month") {
    return {
      dateFrom: toIsoDate(new Date(year, month, 1), timezone),
      dateTo: toIsoDate(new Date(year, month + 1, 0), timezone),
    };
  }

  const dow = new Date(year, month, day).getDay();
  const startOfWeek = new Date(year, month, day - dow);

  return {
    dateFrom: toIsoDate(startOfWeek, timezone),
    dateTo: toIsoDate(
      new Date(
        startOfWeek.getFullYear(),
        startOfWeek.getMonth(),
        startOfWeek.getDate() + 6,
      ),
      timezone,
    ),
  };
};

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isValidDayKey = (s: string): boolean => {
  const m = DAY_KEY.exec(s.trim());
  if (!m) {
    return false;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
  );
};

export const durationSecondsFromIsoRange = (
  startIso: string | undefined,
  endIso: string | undefined,
): number | null => {
  if (!startIso?.trim() || !endIso?.trim()) {
    return null;
  }
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return Math.max(0, Math.floor((b - a) / 1000));
};
