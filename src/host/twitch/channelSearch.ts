import type { ChannelSuggestion } from '../../shared/protocol';
import { gqlQuery } from './gqlClient';

export const MAX_SUGGESTIONS = 8;
const SEARCHABLE_QUERY = /^[a-z0-9_]{1,25}$/;

interface SuggestionNode {
  content: {
    __typename: string;
    login?: string;
    isLive?: boolean;
    profileImageURL?: string;
    user?: {
      displayName: string;
      stream: { viewersCount: number | null; game: { displayName: string } | null } | null;
    } | null;
  } | null;
}

export interface SearchSuggestionsResult {
  searchSuggestions: { edges: { node: SuggestionNode }[] } | null;
}

/** The same suggestion search the twitch.tv search box uses. */
const SEARCH_QUERY = `query ChannelSuggestions($query: String!) {
  searchSuggestions(queryFragment: $query, withOfflineChannelContent: true) {
    edges { node { content {
      __typename
      ... on SearchSuggestionChannel {
        login
        isLive
        profileImageURL(width: 50)
        user { displayName stream { viewersCount game { displayName } } }
      }
    } } }
  }
}`;

export function toSuggestions(result: SearchSuggestionsResult): ChannelSuggestion[] {
  return (result.searchSuggestions?.edges ?? []).flatMap(({ node }) => {
    const content = node.content;
    if (content?.__typename !== 'SearchSuggestionChannel' || !content.login) {
      return [];
    }
    const stream = content.user?.stream ?? null;
    const isLive = content.isLive === true;
    return [
      {
        login: content.login,
        displayName: content.user?.displayName || content.login,
        profileImageUrl: content.profileImageURL ?? '',
        isLive,
        game: isLive ? (stream?.game?.displayName ?? null) : null,
        viewers: isLive ? (stream?.viewersCount ?? null) : null,
      },
    ];
  });
}

/**
 * Keeps Twitch's popularity order but lifts the exact login and logins that
 * start with the query to the top, since that is usually what was typed.
 */
export function rankSuggestions(
  query: string,
  suggestions: ChannelSuggestion[],
): ChannelSuggestion[] {
  const rank = (suggestion: ChannelSuggestion) =>
    suggestion.login === query ? 0 : suggestion.login.startsWith(query) ? 1 : 2;
  return suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .sort((a, b) => rank(a.suggestion) - rank(b.suggestion) || a.index - b.index)
    .map(({ suggestion }) => suggestion)
    .slice(0, MAX_SUGGESTIONS);
}

export async function searchChannels(input: string): Promise<ChannelSuggestion[]> {
  const query = input.trim().replace(/^@/, '').toLowerCase();
  if (!SEARCHABLE_QUERY.test(query)) {
    return [];
  }
  const result = await gqlQuery<SearchSuggestionsResult>(SEARCH_QUERY, { query });
  return rankSuggestions(query, toSuggestions(result));
}
