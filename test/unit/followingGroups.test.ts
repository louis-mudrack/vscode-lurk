import { describe, expect, it } from 'vitest';
import { groupByLiveStatus } from '../../src/host/following/followingGroups';
import type { FollowedChannel } from '../../src/host/twitch/following';

function channel(displayName: string, viewers?: number): FollowedChannel {
  return {
    id: displayName,
    login: displayName.toLowerCase(),
    displayName,
    profileImageUrl: '',
    stream:
      viewers === undefined
        ? null
        : { title: '', game: null, viewers, startedAt: '2026-10-15T10:00:00Z' },
  };
}

describe('groupByLiveStatus', () => {
  it('sorts live channels by viewers and offline channels alphabetically', () => {
    const groups = groupByLiveStatus(
      [
        channel('zeta'),
        channel('Big', 9000),
        channel('Äpfel'),
        channel('Small', 12),
        channel('alpha'),
      ],
      'de',
    );
    expect(groups.live.map((c) => c.displayName)).toEqual(['Big', 'Small']);
    expect(groups.offline.map((c) => c.displayName)).toEqual(['alpha', 'Äpfel', 'zeta']);
  });
});
