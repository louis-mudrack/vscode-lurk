import type { ChatEmote } from '../../shared/protocol';
import { helixGetAll, type HelixCredentials } from './helix';

const MAX_PAGES = 10;
const EMOTE_CDN = 'https://static-cdn.jtvnw.net/emoticons/v2';

interface HelixEmote {
  id: string;
  name: string;
}

/**
 * Every Twitch emote the user may use in this channel: global, subscriptions,
 * bit rewards and the channel's follower emotes.
 */
export async function fetchUserEmotes(
  credentials: HelixCredentials,
  userId: string,
  broadcasterId: string,
): Promise<ChatEmote[]> {
  const emotes = await helixGetAll<HelixEmote>(
    'chat/emotes/user',
    new URLSearchParams({ user_id: userId, broadcaster_id: broadcasterId }),
    credentials,
    { maxPages: MAX_PAGES, sendPageSize: false },
  );
  return emotes.map((emote) => {
    const base = `${EMOTE_CDN}/${encodeURIComponent(emote.id)}/default/dark`;
    return { name: emote.name, url1x: `${base}/1.0`, url2x: `${base}/2.0`, zeroWidth: false };
  });
}
