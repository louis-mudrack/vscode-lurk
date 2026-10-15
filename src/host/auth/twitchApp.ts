/**
 * Lurk's application on dev.twitch.tv. It is a "Public" client without a
 * secret, so the ID is not confidential. Forks register their own and set
 * `twitchPlayer.twitchClientId`.
 */
export const LURK_CLIENT_ID = '';

/** Read the follow list, offer the user's own emotes in chat, and send chat messages. */
export const TWITCH_SCOPES = ['user:read:follows', 'user:read:emotes', 'user:write:chat'];

export function resolveClientId(configured: string | undefined): string {
  return configured?.trim() || LURK_CLIENT_ID;
}
