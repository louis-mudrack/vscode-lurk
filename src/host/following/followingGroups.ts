import type { FollowedChannel } from '../twitch/following';

export interface FollowingGroups {
  live: FollowedChannel[];
  offline: FollowedChannel[];
}

/** Live channels by viewer count like twitch.tv's sidebar, offline ones alphabetically. */
export function groupByLiveStatus(channels: FollowedChannel[], locale: string): FollowingGroups {
  const live = channels
    .filter((channel) => channel.stream)
    .sort((a, b) => (b.stream?.viewers ?? 0) - (a.stream?.viewers ?? 0));
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const offline = channels
    .filter((channel) => !channel.stream)
    .sort((a, b) => collator.compare(a.displayName, b.displayName));
  return { live, offline };
}
