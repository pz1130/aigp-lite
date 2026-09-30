const MS_PER_DAY = 86_400_000;

/**
 * Whole calendar days from `now` to `sunsetDate`. Positive when the sunset is
 * in the future, negative when overdue, 0 on the sunset day, null when no date.
 * Compares date parts only (time-of-day ignored) so "same day" is always 0.
 */
export function daysToSunset(
  sunsetDate: Date | null,
  now: Date = new Date(),
): number | null {
  if (!sunsetDate) return null;
  const a = Date.UTC(
    sunsetDate.getUTCFullYear(),
    sunsetDate.getUTCMonth(),
    sunsetDate.getUTCDate(),
  );
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / MS_PER_DAY);
}
