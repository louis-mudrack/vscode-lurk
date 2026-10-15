import * as l10n from '@vscode/l10n';

/**
 * Loads the translations the extension host embedded into the page. Must run
 * before any `l10n.t` call; strings without a translation stay English.
 */
export function initializeL10n(): void {
  const contents = document.getElementById('l10n')?.textContent;
  if (!contents) {
    return;
  }
  const bundle = JSON.parse(contents) as Record<string, string>;
  if (Object.keys(bundle).length > 0) {
    l10n.config({ contents: bundle });
  }
}

/** The VS Code UI language, for number formatting. */
export function uiLanguage(): string {
  return document.documentElement.lang || 'en';
}
