import type { ChannelInfo, StreamInfo } from '../../shared/protocol';
import { gqlQuery } from './gqlClient';

export interface ChannelLookup {
  channel: ChannelInfo;
  stream: StreamInfo | null;
}

interface ChannelQueryResult {
  user: {
    id: string;
    login: string;
    displayName: string;
    profileImageURL: string;
    stream: {
      title: string | null;
      viewersCount: number | null;
      createdAt: string;
      game: { displayName: string } | null;
    } | null;
  } | null;
}

const CHANNEL_QUERY = `query ChannelLookup($login: String!) {
  user(login: $login) {
    id
    login
    displayName
    profileImageURL(width: 70)
    stream { title viewersCount createdAt game { displayName } }
  }
}`;

export async function lookupChannel(login: string): Promise<ChannelLookup | null> {
  const { user } = await gqlQuery<ChannelQueryResult>(CHANNEL_QUERY, { login });
  if (!user) {
    return null;
  }
  return {
    channel: {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      profileImageUrl: user.profileImageURL,
    },
    stream: user.stream
      ? {
          title: user.stream.title ?? '',
          game: user.stream.game?.displayName ?? null,
          viewers: user.stream.viewersCount ?? 0,
          startedAt: user.stream.createdAt,
        }
      : null,
  };
}
