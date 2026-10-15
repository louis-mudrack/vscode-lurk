import { describe, expect, it } from 'vitest';
import { toChatEmote } from '../../src/host/emotes/sevenTv';

describe('toChatEmote', () => {
  const host = {
    url: '//cdn.7tv.app/emote/01FGH8NE3800064MEQW00DNBNG',
    files: [
      { name: '1x.avif', format: 'AVIF' },
      { name: '1x.webp', format: 'WEBP' },
      { name: '2x.webp', format: 'WEBP' },
    ],
  };

  it('builds https URLs preferring WEBP files', () => {
    expect(toChatEmote({ name: 'reckH', flags: 0, data: { flags: 0, host } })).toEqual({
      name: 'reckH',
      url1x: 'https://cdn.7tv.app/emote/01FGH8NE3800064MEQW00DNBNG/1x.webp',
      url2x: 'https://cdn.7tv.app/emote/01FGH8NE3800064MEQW00DNBNG/2x.webp',
      zeroWidth: false,
    });
  });

  it('detects zero-width emotes from either flag', () => {
    expect(toChatEmote({ name: 'a', flags: 1, data: { host } })?.zeroWidth).toBe(true);
    expect(toChatEmote({ name: 'b', flags: 0, data: { flags: 256, host } })?.zeroWidth).toBe(true);
  });

  it('skips emotes without image data', () => {
    expect(toChatEmote({ name: 'gone', data: null })).toBeUndefined();
  });
});
