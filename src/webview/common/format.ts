import { uiLanguage } from './l10n';

let compactNumber: Intl.NumberFormat | undefined;

export function formatViewerCount(viewers: number): string {
  compactNumber ??= new Intl.NumberFormat(uiLanguage(), {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return compactNumber.format(viewers);
}

export function formatExactCount(count: number): string {
  return count.toLocaleString(uiLanguage());
}

export function formatUptime(startedAt: string, now = Date.now()): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60_000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}
