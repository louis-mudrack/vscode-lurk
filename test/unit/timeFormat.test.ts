import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelativeTime, formatUptime } from '../../src/shared/timeFormat';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [65, '1:05'],
    [3723, '1:02:03'],
    [20420.7, '5:40:20'],
    [Number.NaN, '0:00'],
    [-5, '0:00'],
  ])('formats %d seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');

  it.each([
    ['2026-10-15T11:59:30Z', 'en', 'this minute'],
    ['2026-10-15T07:00:00Z', 'en', '5 hours ago'],
    ['2026-10-14T06:46:01Z', 'en', 'yesterday'],
    ['2026-10-12T06:46:01Z', 'de', 'vor 3 Tagen'],
    ['2026-09-01T00:00:00Z', 'de', 'letzten Monat'],
  ])('formats %s in %s as %j', (date, locale, text) => {
    expect(formatRelativeTime(date, locale, now)).toBe(text);
  });
});

describe('formatUptime', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');

  it.each([
    ['2026-10-15T11:58:00Z', '2m'],
    ['2026-10-15T09:55:00Z', '2h 05m'],
    ['2026-10-15T12:05:00Z', '0m'],
  ])('formats a stream started at %s as %s', (startedAt, text) => {
    expect(formatUptime(startedAt, now)).toBe(text);
  });
});
