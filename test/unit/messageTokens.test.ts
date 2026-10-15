import { describe, expect, it } from 'vitest';
import { MessageTokenizer, parseTwitchEmotesTag } from '../../src/webview/chat/messageTokens';
import type { ChatEmote } from '../../src/shared/protocol';

const emote = (name: string, zeroWidth = false): ChatEmote => ({
  name,
  url1x: `https://cdn/${name}/1x.webp`,
  url2x: `https://cdn/${name}/2x.webp`,
  zeroWidth,
});

describe('parseTwitchEmotesTag', () => {
  it('parses ids and ranges, sorted by position', () => {
    expect(parseTwitchEmotesTag('25:12-16,0-4/1902:6-10')).toEqual([
      { id: '25', start: 0, end: 4 },
      { id: '1902', start: 6, end: 10 },
      { id: '25', start: 12, end: 16 },
    ]);
    expect(parseTwitchEmotesTag('')).toEqual([]);
    expect(parseTwitchEmotesTag(undefined)).toEqual([]);
  });
});

describe('MessageTokenizer', () => {
  it('replaces Twitch emote ranges, counting code points rather than UTF-16 units', () => {
    const tokens = new MessageTokenizer('dark').tokenize('😀 Kappa hi', [
      { id: '25', start: 2, end: 6 },
    ]);
    expect(tokens.map((token) => token.kind)).toEqual(['text', 'emote', 'text']);
    expect(tokens[1]).toMatchObject({
      kind: 'emote',
      emote: {
        name: 'Kappa',
        url1x: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0',
      },
    });
  });

  it('turns 7TV emote words, links and mentions into tokens', () => {
    const tokenizer = new MessageTokenizer();
    tokenizer.setThirdPartyEmotes([emote('OMEGALUL')]);
    const tokens = tokenizer.tokenize('@lena OMEGALUL see twitch.tv/papaplatte', []);
    expect(tokens.map((token) => token.kind)).toEqual(['mention', 'text', 'emote', 'text', 'link']);
    expect(tokens[4]).toEqual({ kind: 'link', url: 'https://twitch.tv/papaplatte' });
  });

  it('stacks zero-width emotes onto the previous emote', () => {
    const tokenizer = new MessageTokenizer();
    tokenizer.setThirdPartyEmotes([emote('catJAM'), emote('RainTime', true)]);
    const tokens = tokenizer.tokenize('catJAM RainTime', []);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ kind: 'emote', overlays: [{ name: 'RainTime' }] });
  });

  it('shows a zero-width emote on its own when nothing precedes it', () => {
    const tokenizer = new MessageTokenizer();
    tokenizer.setThirdPartyEmotes([emote('RainTime', true)]);
    expect(tokenizer.tokenize('RainTime', [])).toMatchObject([{ kind: 'emote', overlays: [] }]);
  });

  it('lets channel emotes override global emotes of the same name', () => {
    const tokenizer = new MessageTokenizer();
    tokenizer.setThirdPartyEmotes([emote('Clap'), { ...emote('Clap'), url1x: 'channel' }]);
    expect(tokenizer.tokenize('Clap', [])[0]).toMatchObject({ emote: { url1x: 'channel' } });
  });
});
