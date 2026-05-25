const ISO_DAY = /\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * Detect “here is your week awaiting approval” style replies so we persist `is_proposal`
 * without relying on `mark_as_proposal`.
 */
export function looksLikeScheduleProposalAwaitingConsent(
  persistedAssistantContent: string,
): boolean {
  const t = persistedAssistantContent.trim();
  if (t.length < 80) {
    return false;
  }
  const lower = t.toLowerCase();

  const dates = [...t.matchAll(ISO_DAY)].map((m) => m[0]);
  const uniqueDates = new Set(dates);

  const workoutCue =
    /(recovery|easy run|long run|swim session|brick|spin|trainer|bike|lifting|lift|run|threshold|hill|brick|zones?|interval|workout|crosstrain|strength|yoga|open water|pool|drill)/.test(
      lower,
    ) ||
    /\d+\s*(min|minutes?|hours?|hr|h)\b/.test(lower) ||
    /\d+(\.\d+)?\s*(km|mi|m|yd|meter|meters|mile|miles)\b/.test(lower) ||
    /zone\s*[1-5]/.test(lower);

  const weekdayHits = (
    lower.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g,
    ) ?? []
  ).length;

  const consentOrConfirmLanguage =
    /(add (these|this|them)?\s+to|put (this|these)\s+on|your calendar|book (it|this)|let me know if|want (me )?to add|ready to add|make any adjustments|sound good|work for you|go ahead and add|add (it|them))/.test(
      t,
    );

  if (uniqueDates.size >= 2 && workoutCue) {
    return true;
  }

  if (weekdayHits >= 3 && workoutCue) {
    return true;
  }

  if ((uniqueDates.size >= 2 || weekdayHits >= 3) && consentOrConfirmLanguage) {
    return true;
  }

  return false;
}
