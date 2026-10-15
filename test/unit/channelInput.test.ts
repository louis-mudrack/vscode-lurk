import { describe, expect, it } from 'vitest';
import { parseChannelInput } from '../../src/shared/channelInput';

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
