import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelSession, type SessionServices } from '../../src/host/session/channelSession';
import type { ChannelLookup } from '../../src/host/twitch/channels';
import type { RaidTarget } from '../../src/host/twitch/raidEvents';
import type { RaidWatch } from '../../src/host/twitch/raidWatcher';
import type { VideoLookup } from '../../src/host/twitch/videos';
import type { VideoPlaylist } from '../../src/host/twitch/playback';
import type { ChannelInfo, PlayerStatus } from '../../src/shared/protocol';

function channel(login: string): ChannelInfo {
  return { id: `id-${login}`, login, displayName: login.toUpperCase(), profileImageUrl: '' };
}

function live(login: string): ChannelLookup {
  return {
    channel: channel(login),
    stream: { title: 't', game: null, viewers: 1, startedAt: '2026-01-01T00:00:00Z' },
  };
}

function video(id: string, owner: string): VideoLookup {
  return {
    channel: channel(owner),
    video: {
      id,
      title: 'v',
      game: null,
      durationSeconds: 3600,
      createdAt: '2026-01-01T00:00:00Z',
      thumbnailUrl: '',
      viewCount: 1,
      isRecording: false,
    },
  };
}

class FakeRaidWatch implements RaidWatch {
  isConnected = true;
  prepared: RaidTarget | undefined;
  disposed = false;
  constructor(readonly fire: (target: RaidTarget) => void) {}
  recentlyPreparedTarget() {
    return this.prepared;
  }
  dispose() {
    this.disposed = true;
  }
}

interface VideoFixtures {
  videos?: Record<string, VideoLookup>;
  subscribersOnly?: string[];
  positions?: Record<string, number>;
}

function setup(
  channels: Record<string, ChannelLookup | null>,
  followRaids = true,
  fixtures: VideoFixtures = {},
) {
  const watches = new Map<string, FakeRaidWatch>();
  const lookupChannel = vi.fn((login: string) => Promise.resolve(channels[login] ?? null));
  const resolvePlaylistUrl = vi.fn((login: string) =>
    Promise.resolve(`https://usher/${login}.m3u8`),
  );
  const resolveVideoPlaylist = vi.fn((id: string): Promise<VideoPlaylist> =>
    Promise.resolve(
      fixtures.subscribersOnly?.includes(id)
        ? { kind: 'subscribersOnly' }
        : { kind: 'playable', url: `https://usher/vod/${id}.m3u8` },
    ),
  );
  const services: SessionServices = {
    lookupChannel,
    resolvePlaylistUrl,
    lookupVideo: (id) => Promise.resolve(fixtures.videos?.[id] ?? null),
    resolveVideoPlaylist,
    watchRaids: (channelId, onRaid) => {
      const watch = new FakeRaidWatch(onRaid);
      watches.set(channelId, watch);
      return watch;
    },
  };
  const onRaidNotFollowed = vi.fn();
  const session = new ChannelSession(
    services,
    {
      shouldFollowRaids: () => followRaids,
      onRaidNotFollowed,
      rememberChannel: () => Promise.resolve(),
      resumePosition: (id) => fixtures.positions?.[id],
    },
    { info: () => undefined, warn: () => undefined, error: () => undefined },
  );
  const statuses: PlayerStatus[] = [];
  session.onDidChangeStatus((status) => statuses.push(status));
  return {
    session,
    lookupChannel,
    resolvePlaylistUrl,
    resolveVideoPlaylist,
    watches,
    statuses,
    onRaidNotFollowed,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ChannelSession', () => {
  const sessions: ChannelSession[] = [];
  afterEach(() => sessions.splice(0).forEach((session) => session.dispose()));

  it('goes from loading to live with a playlist and watches for raids', async () => {
    const { session, statuses, watches } = setup({ papaplatte: live('papaplatte') });
    sessions.push(session);
    await session.open('papaplatte');
    expect(statuses.map((status) => status.kind)).toEqual(['loading', 'live']);
    const status = session.status;
    expect(status.kind === 'live' && status.playback.url).toBe('https://usher/papaplatte.m3u8');
    expect(watches.has('id-papaplatte')).toBe(true);
  });

  it('reports unknown channels as errors', async () => {
    const { session } = setup({});
    sessions.push(session);
    await session.open('nobody');
    expect(session.status.kind).toBe('error');
  });

  it('follows a raid to the target and remembers who raided', async () => {
    const { session, watches } = setup({ source: live('source'), target: live('target') });
    sessions.push(session);
    await session.open('source');
    watches.get('id-source')?.fire({ id: 'id-target', login: 'target', displayName: 'TARGET' });
    await flush();
    const status = session.status;
    expect(status.kind).toBe('live');
    expect(status.kind === 'live' && status.channel.login).toBe('target');
    expect(status.kind === 'live' && status.raidedFrom).toBe('SOURCE');
    expect(watches.get('id-source')?.disposed).toBe(true);
    expect(watches.has('id-target')).toBe(true);
  });

  it('only asks when raid following is turned off', async () => {
    const { session, watches, onRaidNotFollowed } = setup({ source: live('source') }, false);
    sessions.push(session);
    await session.open('source');
    watches.get('id-source')?.fire({ id: 'id-target', login: 'target', displayName: 'TARGET' });
    await flush();
    expect(onRaidNotFollowed).toHaveBeenCalledOnce();
    expect(session.channel?.login).toBe('source');
  });

  it('follows a prepared raid when the stream ends before the "go" event arrives', async () => {
    const channels: Record<string, ChannelLookup | null> = {
      source: live('source'),
      target: live('target'),
    };
    const { session, watches } = setup(channels);
    sessions.push(session);
    await session.open('source');
    const watch = watches.get('id-source');
    if (watch) {
      watch.prepared = { id: 'id-target', login: 'target', displayName: 'TARGET' };
    }
    channels['source'] = { channel: channel('source'), stream: null };
    await session.handlePlaybackFailure('stream ended');
    await flush();
    expect(session.channel?.login).toBe('target');
  });

  it('shows the channel as offline when its stream ends without a raid', async () => {
    const channels: Record<string, ChannelLookup | null> = { source: live('source') };
    const { session } = setup(channels);
    sessions.push(session);
    await session.open('source');
    channels['source'] = { channel: channel('source'), stream: null };
    await session.handlePlaybackFailure('stream ended');
    expect(session.status.kind).toBe('offline');
  });

  it('restarts failing playback with a fresh playlist, but not forever', async () => {
    const { session, resolvePlaylistUrl } = setup({ source: live('source') });
    sessions.push(session);
    await session.open('source');
    const firstId = session.status.kind === 'live' ? session.status.playback.id : -1;
    await session.handlePlaybackFailure('network');
    const status = session.status;
    expect(status.kind === 'live' && status.playback.id).toBeGreaterThan(firstId);
    await session.handlePlaybackFailure('network');
    await session.handlePlaybackFailure('network');
    await session.handlePlaybackFailure('network');
    expect(session.status.kind).toBe('error');
    expect(resolvePlaylistUrl).toHaveBeenCalledTimes(4);
  });

  it('drops results of a navigation that was superseded', async () => {
    let releaseSlow: (value: ChannelLookup) => void = () => undefined;
    const { session, lookupChannel } = setup({ fast: live('fast') });
    sessions.push(session);
    lookupChannel.mockImplementationOnce(
      () => new Promise<ChannelLookup>((resolve) => (releaseSlow = resolve)),
    );
    const slow = session.open('slow');
    await session.open('fast');
    releaseSlow(live('slow'));
    await slow;
    expect(session.channel?.login).toBe('fast');
  });

  it('plays a video from where the user left off and stops watching raids', async () => {
    const { session, watches } = setup({ source: live('source') }, true, {
      videos: { '42': video('42', 'source') },
      positions: { '42': 1234 },
    });
    sessions.push(session);
    await session.open('source');
    await session.openVideo('42');
    const status = session.status;
    expect(status.kind).toBe('video');
    expect(status.kind === 'video' && status.startAt).toBe(1234);
    expect(status.kind === 'video' && status.playback.url).toBe('https://usher/vod/42.m3u8');
    expect(session.channel?.login).toBe('source');
    expect(watches.get('id-source')?.disposed).toBe(true);
  });

  it('prefers an explicit start time over the saved position', async () => {
    const { session } = setup({}, true, {
      videos: { '42': video('42', 'source') },
      positions: { '42': 1234 },
    });
    sessions.push(session);
    await session.openVideo('42', 60);
    const status = session.status;
    expect(status.kind === 'video' && status.startAt).toBe(60);
  });

  it('reports unknown and subscriber-only videos', async () => {
    const { session } = setup({}, true, {
      videos: { '7': video('7', 'source') },
      subscribersOnly: ['7'],
    });
    sessions.push(session);
    await session.openVideo('404');
    expect(session.status).toEqual({
      kind: 'error',
      target: { type: 'video', id: '404' },
      reason: 'notFound',
    });
    await session.openVideo('7');
    expect(session.status.kind === 'error' && session.status.reason).toBe('subscribersOnly');
  });

  it('reloads a failing video at the last saved position', async () => {
    const positions: Record<string, number> = {};
    const { session, resolveVideoPlaylist } = setup({}, true, {
      videos: { '42': video('42', 'source') },
      positions,
    });
    sessions.push(session);
    await session.openVideo('42');
    positions['42'] = 600;
    await session.handlePlaybackFailure('network');
    const status = session.status;
    expect(status.kind === 'video' && status.startAt).toBe(600);
    expect(status.kind === 'video' && status.playback.id).toBe(2);
    expect(resolveVideoPlaylist).toHaveBeenCalledTimes(2);
  });

  it('retries what failed, channel or video', async () => {
    const { session, lookupChannel } = setup({}, true, { videos: {} });
    sessions.push(session);
    await session.open('nobody');
    await session.retry();
    expect(lookupChannel).toHaveBeenCalledTimes(2);
    await session.openVideo('404');
    await session.retry();
    expect(session.status).toMatchObject({ kind: 'error', target: { type: 'video', id: '404' } });
  });
});
