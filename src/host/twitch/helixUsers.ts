import type { ChannelInfo, TwitchAccount } from '../../shared/protocol';
import { HELIX_MAX_IDS_PER_REQUEST, helixGet, type HelixCredentials } from './helix';

interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

/** Helix hands out 300×300 avatars; the CDN serves the same image at 70×70. */
const LARGE_AVATAR = /-300x300\./;

function smallAvatar(url: string): string {
  return url.replace(LARGE_AVATAR, '-70x70.');
}

function toChannel(user: HelixUser): ChannelInfo {
  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImageUrl: smallAvatar(user.profile_image_url),
  };
}

/** The user the token belongs to. */
export async function fetchOwnAccount(credentials: HelixCredentials): Promise<TwitchAccount> {
  const { data } = await helixGet<{ data: HelixUser[] }>(
    'users',
    new URLSearchParams(),
    credentials,
  );
  const [user] = data;
  if (!user) {
    throw new Error('Twitch returned no user for the token');
  }
  return toChannel(user);
}

export async function fetchUsers(
  ids: string[],
  credentials: HelixCredentials,
): Promise<ChannelInfo[]> {
  const users: ChannelInfo[] = [];
  for (let start = 0; start < ids.length; start += HELIX_MAX_IDS_PER_REQUEST) {
    const params = new URLSearchParams(
      ids.slice(start, start + HELIX_MAX_IDS_PER_REQUEST).map((id): [string, string] => ['id', id]),
    );
    const { data } = await helixGet<{ data: HelixUser[] }>('users', params, credentials);
    users.push(...data.map(toChannel));
  }
  return users;
}
