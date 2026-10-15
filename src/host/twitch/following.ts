import type { ChannelInfo, StreamInfo } from '../../shared/protocol';
import { helixGetAll, type HelixCredentials } from './helix';
import { fetchUsers } from './helixUsers';

/** Enough for 2,000 followed channels; Twitch caps follows far above what a list can show. */
const MAX_FOLLOW_PAGES = 20;
const MAX_STREAM_PAGES = 5;

export interface FollowedChannel extends ChannelInfo {
  stream: StreamInfo | null;
}

interface HelixFollow {
  broadcaster_id: string;
}

interface HelixStream {
  user_id: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
}

/** Profiles of every channel the user follows, without live status. */
export async function fetchFollowedChannels(
  credentials: HelixCredentials,
  userId: string,
): Promise<ChannelInfo[]> {
  const follows = await helixGetAll<HelixFollow>(
    'channels/followed',
    new URLSearchParams({ user_id: userId }),
    credentials,
    { maxPages: MAX_FOLLOW_PAGES },
  );
  return fetchUsers(
    follows.map((follow) => follow.broadcaster_id),
    credentials,
  );
}

/** Live streams of followed channels, keyed by channel id. */
export async function fetchFollowedStreams(
  credentials: HelixCredentials,
  userId: string,
): Promise<Map<string, StreamInfo>> {
  const streams = await helixGetAll<HelixStream>(
    'streams/followed',
    new URLSearchParams({ user_id: userId }),
    credentials,
    { maxPages: MAX_STREAM_PAGES },
  );
  return new Map(
    streams.map((stream) => [
      stream.user_id,
      {
        title: stream.title,
        game: stream.game_name || null,
        viewers: stream.viewer_count,
        startedAt: stream.started_at,
      },
    ]),
  );
}
