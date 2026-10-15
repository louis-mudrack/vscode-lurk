import { describe, expect, it } from 'vitest';
import {
  MAX_SUGGESTIONS,
  rankSuggestions,
  toSuggestions,
  type SearchSuggestionsResult,
} from '../../src/host/twitch/channelSearch';
import type { ChannelSuggestion } from '../../src/shared/protocol';

function suggestion(login: string): ChannelSuggestion {
  return {
    login,
    displayName: login,
    profileImageUrl: '',
    isLive: false,
    game: null,
    viewers: null,
  };
}

describe('toSuggestions', () => {
  it('keeps channels and their live details, dropping other suggestion types', () => {
    const result: SearchSuggestionsResult = {
      searchSuggestions: {
        edges: [
          {
            node: {
              content: {
                __typename: 'SearchSuggestionChannel',
                login: 'montanablack88',
                isLive: true,
                profileImageURL: 'https://img/m.png',
                user: {
                  displayName: 'MontanaBlack88',
                  stream: { viewersCount: 21018, game: { displayName: 'Minecraft' } },
                },
              },
            },
          },
          { node: { content: { __typename: 'SearchSuggestionCategory' } } },
          {
            node: {
              content: {
                __typename: 'SearchSuggestionChannel',
                login: 'papaplatte',
                isLive: false,
                user: { displayName: 'Papaplatte', stream: null },
              },
            },
          },
          { node: { content: null } },
        ],
      },
    };
    expect(toSuggestions(result)).toEqual([
      {
        login: 'montanablack88',
        displayName: 'MontanaBlack88',
        profileImageUrl: 'https://img/m.png',
        isLive: true,
        game: 'Minecraft',
        viewers: 21018,
      },
      {
        login: 'papaplatte',
        displayName: 'Papaplatte',
        profileImageUrl: '',
        isLive: false,
        game: null,
        viewers: null,
      },
    ]);
  });

  it('handles an empty response', () => {
    expect(toSuggestions({ searchSuggestions: null })).toEqual([]);
  });
});

describe('rankSuggestions', () => {
  it('puts the exact login first and prefix matches next, otherwise keeping Twitch order', () => {
    const ranked = rankSuggestions('papa', [
      suggestion('letshugotv'),
      suggestion('papaplatte'),
      suggestion('montanablack88'),
      suggestion('papa'),
      suggestion('papapawian'),
    ]);
    expect(ranked.map((entry) => entry.login)).toEqual([
      'papa',
      'papaplatte',
      'papapawian',
      'letshugotv',
      'montanablack88',
    ]);
  });

  it(`returns at most ${MAX_SUGGESTIONS} suggestions`, () => {
    const many = Array.from({ length: 12 }, (_, index) => suggestion(`channel${index}`));
    expect(rankSuggestions('channel', many)).toHaveLength(MAX_SUGGESTIONS);
  });
});
