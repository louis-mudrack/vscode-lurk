import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const PLACEHOLDER = /\{\d+\}/g;

function readJson(path: string): Record<string, string> {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, string>;
}

function placeholders(text: string): string[] {
  return (text.match(PLACEHOLDER) ?? []).sort();
}

const runtimeSource = readJson('l10n/bundle.l10n.json');
const manifestSource = readJson('package.nls.json');
const runtimeLanguages = readdirSync(join(ROOT, 'l10n'))
  .map((file) => /^bundle\.l10n\.(.+)\.json$/.exec(file)?.[1])
  .filter((language): language is string => language !== undefined);
const manifestLanguages = readdirSync(ROOT)
  .map((file) => /^package\.nls\.(.+)\.json$/.exec(file)?.[1])
  .filter((language): language is string => language !== undefined);

describe.each(runtimeLanguages)('runtime translations (%s)', (language) => {
  const translations = readJson(`l10n/bundle.l10n.${language}.json`);

  it('translates exactly the extracted strings', () => {
    expect(Object.keys(translations).sort()).toEqual(Object.keys(runtimeSource).sort());
  });

  it('keeps every placeholder', () => {
    for (const [source, translation] of Object.entries(translations)) {
      expect(placeholders(translation), source).toEqual(placeholders(source));
    }
  });
});

describe.each(manifestLanguages)('manifest translations (%s)', (language) => {
  it('covers every manifest string', () => {
    const translations = readJson(`package.nls.${language}.json`);
    expect(Object.keys(translations).sort()).toEqual(Object.keys(manifestSource).sort());
  });
});

describe('manifest', () => {
  it('only references strings that exist in package.nls.json', () => {
    const manifest = readFileSync(join(ROOT, 'package.json'), 'utf8');
    const references = [...manifest.matchAll(/"%([^%"]+)%"/g)].map((match) => match[1]);
    for (const key of references) {
      expect(manifestSource, key).toHaveProperty([key as string]);
    }
  });
});
