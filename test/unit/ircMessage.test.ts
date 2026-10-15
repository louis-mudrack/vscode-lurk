import { describe, expect, it } from 'vitest';
import { nickFromPrefix, parseIrcLine, unescapeTagValue } from '../../src/webview/chat/ircMessage';

describe('parseIrcLine', () => {
  it('parses a tagged PRIVMSG', () => {
    const line =
      '@badges=subscriber/12,sub-gifter/10;color=#0000FF;display-name=sirob2389;emotes=;id=743a;room-id=45044816 ' +
      ':sirob2389!sirob2389@sirob2389.tmi.twitch.tv PRIVMSG #montanablack88 :Doch das springt hoch';
    const message = parseIrcLine(line);
    expect(message?.command).toBe('PRIVMSG');
    expect(message?.params).toEqual(['#montanablack88', 'Doch das springt hoch']);
    expect(message?.tags['display-name']).toBe('sirob2389');
    expect(message?.tags['emotes']).toBe('');
    expect(nickFromPrefix(message?.prefix)).toBe('sirob2389');
  });

  it('parses commands without tags or prefix', () => {
    expect(parseIrcLine('PING :tmi.twitch.tv')).toEqual({
      tags: {},
      prefix: undefined,
      command: 'PING',
      params: ['tmi.twitch.tv'],
    });
  });

  it('keeps colons inside the trailing parameter', () => {
    expect(parseIrcLine(':a!a@a PRIVMSG #c :look: https://x.y')?.params[1]).toBe(
      'look: https://x.y',
    );
  });

  it('unescapes tag values', () => {
    expect(unescapeTagValue('Hello\\sworld\\:\\\\done\\')).toBe('Hello world;\\done');
    expect(parseIrcLine('@system-msg=5\\sraiders USERNOTICE #c')?.tags['system-msg']).toBe(
      '5 raiders',
    );
  });

  it('rejects empty lines', () => {
    expect(parseIrcLine('')).toBeUndefined();
  });
});
