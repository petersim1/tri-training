import type { CalendarSchemaValues } from "@/types/requests/activities";

export const isValidIanaTimeZone = (tz: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return Boolean(tz.trim());
  } catch {
    return false;
  }
};

export const getTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export const getToday = (): string => {
  const timeZone = getTimezone();
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
};

export const toIsoDate = (date: Date, tz: string) => {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
};

export const enumerateLocalDayKeysInclusive = (
  from: string,
  to: string,
): string[] => {
  if (from > to) return [from];
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const d = new Date(`${cur}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
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
  const { period, anchor } = dates;

  const [yearStr, monthStr, dayStr] = anchor.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);

  // Use UTC noon to avoid any local timezone contamination
  const anchorDate = new Date(Date.UTC(year, month, day, 12));

  if (period === "month") {
    const firstDay = new Date(Date.UTC(year, month, 1, 12));
    const lastDay = new Date(Date.UTC(year, month + 1, 0, 12));
    firstDay.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay());
    lastDay.setUTCDate(lastDay.getUTCDate() + (6 - lastDay.getUTCDay()));
    return {
      dateFrom: firstDay.toISOString().slice(0, 10),
      dateTo: lastDay.toISOString().slice(0, 10),
    };
  }

  const dow = anchorDate.getUTCDay();
  const startOfWeek = new Date(Date.UTC(year, month, day - dow, 12));
  const endOfWeek = new Date(Date.UTC(year, month, day - dow + 6, 12));

  return {
    dateFrom: startOfWeek.toISOString().slice(0, 10),
    dateTo: endOfWeek.toISOString().slice(0, 10),
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

export const dayKeyToUtc = (dayKey: string, timeZone: string): Date => {
  const temp = new Date(`${dayKey}T00:00:00`);
  const localStr = temp.toLocaleString("en-US", { timeZone });
  const offset = new Date(localStr).getTime() - temp.getTime();
  return new Date(temp.getTime() - offset);
};
