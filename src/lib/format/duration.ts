const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

export function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < MS_MIN) return "< 1m";
  if (clamped < MS_HOUR) return `${Math.floor(clamped / MS_MIN)}m`;
  if (clamped < MS_DAY) return `${Math.floor(clamped / MS_HOUR)}h`;
  return `${Math.floor(clamped / MS_DAY)}d`;
}
