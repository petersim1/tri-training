/** Compress assistant prose for downstream context (facts-only gist). */
export function deriveReplaySummaryFromAssistant(full: string): string {
  const t = full.trim().replace(/\s+/g, " ");
  if (t === "") {
    return "[empty reply]";
  }
  const hardCap = 420;
  const period = t.indexOf(". ");
  if (period >= 90 && period < 520) {
    return t.slice(0, Math.min(hardCap, period + 1)).trim();
  }
  if (t.length <= hardCap) {
    return t;
  }
  return `${t.slice(0, hardCap - 1).trim()}…`;
}
