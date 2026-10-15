import { describe, expect, it } from 'vitest';
import { parseChannelInput, parseTimestamp, parseWatchInput } from '../../src/shared/channelInput';

describe('parseChannelInput', () => {
  it.each([
    ['papaplatte', 'papaplatte'],
    ['  MontanaBlack88 ', 'montanablack88'],
    ['@xQc', 'xqc'],
    ['https://www.twitch.tv/papaplatte', 'papaplatte'],
    ['twitch.tv/papaplatte?sr=a', 'papaplatte'],
    ['https://m.twitch.tv/papaplatte/videos', 'papaplatte'],
    ['https://www.twitch.tv/popout/papaplatte/chat', 'papaplatte'],
  ])('reads %j as %j', (input, login) => {
    expect(parseChannelInput(input)).toBe(login);
  });

  it.each(['', '   ', 'not a name', 'https://youtube.com/papaplatte', 'a'.repeat(26), 'ümlaut'])(
    'rejects %j',
    (input) => {
      expect(parseChannelInput(input)).toBeUndefined();
    },
  );
});

describe('parseWatchInput', () => {
  it.each([
    ['papaplatte', { type: 'channel', login: 'papaplatte' }],
    ['https://www.twitch.tv/videos/2900363117', { type: 'video', id: '2900363117' }],
    ['twitch.tv/videos/2900363117?t=1h2m3s', { type: 'video', id: '2900363117', startAt: 3723 }],
    ['https://m.twitch.tv/videos/123?t=95s', { type: 'video', id: '123', startAt: 95 }],
  ])('reads %j', (input, expected) => {
    expect(parseWatchInput(input)).toEqual(expected);
  });

  it.each(['twitch.tv/videos/', 'twitch.tv/videos/abc', 'https://youtube.com/videos/1'])(
    'rejects %j',
    (input) => {
      expect(parseWatchInput(input)).toBeUndefined();
    },
  );

  it('does not mistake a video link for a channel', () => {
    expect(parseChannelInput('https://www.twitch.tv/videos/2900363117')).toBeUndefined();
  });
});

describe('parseTimestamp', () => {
  it.each([
    ['1h2m3s', 3723],
    ['15m', 900],
    ['95s', 95],
    ['42', 42],
  ])('reads %j as %d seconds', (value, seconds) => {
    expect(parseTimestamp(value)).toBe(seconds);
  });

  it.each([null, '', 'soon'])('ignores %j', (value) => {
    expect(parseTimestamp(value)).toBeUndefined();
  });
});
