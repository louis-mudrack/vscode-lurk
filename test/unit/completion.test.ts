import { describe, expect, it } from 'vitest';
import { CompletionIndex } from '../../src/webview/chat/completion';

const emote = (name: string) => ({ name, url1x: `${name}.1x`, url2x: `${name}.2x` });

describe('CompletionIndex', () => {
  const index = new CompletionIndex();
  index.setEmotes(
    [emote('KEKW'), emote('Kappa'), emote('peepoKEK')],
    [emote('KEK'), emote('kekw')],
  );
  index.noteChatter('Papaplatte');
  index.noteChatter('Kaiwin');

  it('ranks prefix matches before substring matches and shorter names first', () => {
    expect(index.emotesMatching('KEK', 5).map((c) => c.text)).toEqual([
      'KEK',
      'KEKW',
      'kekw',
      'peepoKEK',
    ]);
  });

  it('prefers the exact casing the user typed', () => {
    expect(index.emotesMatching('kekw', 5).map((c) => c.text)).toEqual(['kekw', 'KEKW']);
  });

  it('completes chatters as mentions', () => {
    expect(index.chattersMatching('pap', 5)).toEqual([{ kind: 'chatter', text: '@Papaplatte' }]);
  });

  it('cycles bare words through emotes first, then chatters, by prefix only', () => {
    expect(index.completionsFor('ka', 5).map((c) => c.text)).toEqual(['Kappa', '@Kaiwin']);
  });

  it('forgets the oldest chatters', () => {
    const many = new CompletionIndex();
    for (let i = 0; i < 501; i++) {
      many.noteChatter(`user${i}`);
    }
    expect(many.chattersMatching('user0', 5)).toEqual([]);
    expect(many.chattersMatching('user500', 5)).toEqual([{ kind: 'chatter', text: '@user500' }]);
  });
});
