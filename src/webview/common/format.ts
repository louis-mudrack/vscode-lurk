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
