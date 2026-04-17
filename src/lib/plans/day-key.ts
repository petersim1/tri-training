/** Calendar day `YYYY-MM-DD` — browser-sourced for plans; lexicographic compare works for ranges. */
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDayKey(s: string): boolean {
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
}

/** Local noon ISO for a valid day key — synthetic anchor when linking (server uses browser day key only). */
export function noonIsoFromDayKey(dayKey: string): string {
  const m = DAY_KEY.exec(dayKey.trim());
  if (!m) {
    throw new Error("Invalid dayKey");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d, 12, 0, 0, 0).toISOString();
}

export function dayBoundsLocalFromDayKey(dayKey: string): {
  startMs: number;
  endMs: number;
} {
  const m = DAY_KEY.exec(dayKey.trim());
  if (!m) {
    return { startMs: 0, endMs: 0 };
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const startMs = new Date(y, mo, d, 0, 0, 0, 0).getTime();
  const endMs = new Date(y, mo, d, 23, 59, 59, 999).getTime();
  return { startMs, endMs };
}

/** “When” on that calendar day for picking closest session start — local noon. */
export function scheduledMsAnchorFromDayKey(dayKey: string): number {
  const m = DAY_KEY.exec(dayKey.trim());
  if (!m) {
    return NaN;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d, 12, 0, 0, 0).getTime();
}
