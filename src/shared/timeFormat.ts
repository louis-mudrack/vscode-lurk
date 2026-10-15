const SECONDS_PER_UNIT: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** `1:02:03` or `2:03`, like video players show positions. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** How long a stream has been live, e.g. `2h 05m`. */
export function formatUptime(startedAt: string, now = Date.now()): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60_000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

/** "2 days ago", "yesterday", … in the given UI language. */
export function formatRelativeTime(isoDate: string, locale: string, now = Date.now()): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const elapsed = Math.max(0, (now - Date.parse(isoDate)) / 1000);
  for (const [unit, unitSeconds] of SECONDS_PER_UNIT) {
    if (elapsed >= unitSeconds) {
      return formatter.format(-Math.floor(elapsed / unitSeconds), unit);
    }
  }
  return formatter.format(0, 'minute');
}
