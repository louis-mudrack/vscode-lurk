import type { ChannelInfo, PlayerStatus, WatchTarget } from '../../shared/protocol';
import { Emitter } from '../emitter';
import type { Logger } from '../logger';
import type { ChannelLookup } from '../twitch/channels';
import type { VideoPlaylist } from '../twitch/playback';
import type { RaidTarget } from '../twitch/raidEvents';
import type { RaidWatch } from '../twitch/raidWatcher';
import type { VideoLookup } from '../twitch/videos';
import { RestartBudget } from './restartBudget';

const REFRESH_INTERVAL_MS = 60_000;
const MAX_PLAYBACK_RESTARTS = 3;
const PLAYBACK_RESTART_WINDOW_MS = 5 * 60_000;

/** Network access, injected so the session logic can be tested without Twitch. */
export interface SessionServices {
  lookupChannel(login: string): Promise<ChannelLookup | null>;
  resolvePlaylistUrl(login: string): Promise<string>;
  lookupVideo(id: string): Promise<VideoLookup | null>;
  resolveVideoPlaylist(id: string): Promise<VideoPlaylist>;
  watchRaids(channelId: string, onRaid: (target: RaidTarget) => void): RaidWatch;
}

export interface SessionHooks {
  shouldFollowRaids(): boolean;
  onRaidNotFollowed(from: ChannelInfo, target: RaidTarget): void;
  rememberChannel(channel: ChannelInfo): Promise<void>;
  /** Where the user stopped watching this video last time, in seconds. */
  resumePosition(videoId: string): number | undefined;
}

type VideoStatus = Extract<PlayerStatus, { kind: 'video' }>;

/**
 * Owns "what is being watched": resolves channels and videos, hands playlist
 * URLs to the player, follows raids and notices when a stream ends or comes back.
 */
export class ChannelSession {
  private readonly statusEmitter = new Emitter<PlayerStatus>();
  readonly onDidChangeStatus = this.statusEmitter.event;

  private currentStatus: PlayerStatus = { kind: 'idle' };
  /** Bumped on every navigation so results of superseded requests are dropped. */
  private navigation = 0;
  private playbackId = 0;
  private readonly restarts = new RestartBudget(MAX_PLAYBACK_RESTARTS, PLAYBACK_RESTART_WINDOW_MS);
  private raidWatch: { channelId: string; watch: RaidWatch } | undefined;
  private readonly refreshTimer: NodeJS.Timeout;

  constructor(
    private readonly services: SessionServices,
    private readonly hooks: SessionHooks,
    private readonly log: Logger,
  ) {
    this.refreshTimer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  get status(): PlayerStatus {
    return this.currentStatus;
  }

  get channel(): ChannelInfo | undefined {
    const status = this.currentStatus;
    return status.kind === 'live' || status.kind === 'offline' || status.kind === 'video'
      ? status.channel
      : undefined;
  }

  get isWatchingRaids(): boolean {
    return this.raidWatch?.watch.isConnected ?? false;
  }

  async open(login: string, raidedFrom?: string): Promise<void> {
    const target: WatchTarget = { type: 'channel', login };
    const navigation = this.beginNavigation(target);
    try {
      const lookup = await this.services.lookupChannel(login);
      if (navigation !== this.navigation) {
        return;
      }
      if (!lookup) {
        this.stopWatchingRaids();
        this.setStatus({ kind: 'error', target, reason: 'notFound' });
        return;
      }
      await this.hooks.rememberChannel(lookup.channel);
      this.watchRaids(lookup.channel);
      await this.applyLookup(lookup, navigation, raidedFrom);
    } catch (error) {
      if (navigation === this.navigation) {
        this.log.error(`Opening ${login} failed: ${String(error)}`);
        this.setStatus({ kind: 'error', target, reason: 'unreachable' });
      }
    }
  }

  /** Plays a past broadcast, by default from where the user left off. */
  async openVideo(id: string, startAt?: number): Promise<void> {
    const target: WatchTarget = { type: 'video', id };
    const navigation = this.beginNavigation(target);
    this.stopWatchingRaids();
    try {
      const lookup = await this.services.lookupVideo(id);
      if (navigation !== this.navigation) {
        return;
      }
      if (!lookup) {
        this.setStatus({ kind: 'error', target, reason: 'notFound' });
        return;
      }
      const playlist = await this.services.resolveVideoPlaylist(id);
      if (navigation !== this.navigation) {
        return;
      }
      if (playlist.kind === 'subscribersOnly') {
        this.setStatus({ kind: 'error', target, reason: 'subscribersOnly' });
        return;
      }
      this.setStatus({
        kind: 'video',
        channel: lookup.channel,
        video: lookup.video,
        playback: { id: ++this.playbackId, url: playlist.url },
        startAt: startAt ?? this.hooks.resumePosition(id) ?? 0,
      });
    } catch (error) {
      if (navigation === this.navigation) {
        this.log.error(`Opening video ${id} failed: ${String(error)}`);
        this.setStatus({ kind: 'error', target, reason: 'unreachable' });
      }
    }
  }

  stop(): void {
    this.navigation++;
    this.stopWatchingRaids();
    this.setStatus({ kind: 'idle' });
  }

  async retry(): Promise<void> {
    const status = this.currentStatus;
    switch (status.kind) {
      case 'loading':
      case 'error':
        await (status.target.type === 'channel'
          ? this.open(status.target.login)
          : this.openVideo(status.target.id));
        break;
      case 'live':
      case 'offline':
        await this.open(status.channel.login);
        break;
      case 'video':
        await this.openVideo(status.video.id);
        break;
    }
  }

  /** Called when the player gave up on the current playlist (stream ended, token expired, …). */
  async handlePlaybackFailure(reason: string): Promise<void> {
    const status = this.currentStatus;
    if (status.kind === 'video') {
      await this.restartVideo(status, reason);
      return;
    }
    if (status.kind !== 'live') {
      return;
    }
    this.log.warn(`Playback of ${status.channel.login} failed: ${reason}`);
    const navigation = this.navigation;
    try {
      const lookup = await this.services.lookupChannel(status.channel.login);
      if (navigation !== this.navigation) {
        return;
      }
      if (!lookup?.stream) {
        this.handleStreamEnded(status.channel);
        return;
      }
      if (!this.restarts.tryConsume()) {
        const target: WatchTarget = { type: 'channel', login: status.channel.login };
        this.setStatus({ kind: 'error', target, reason: 'playbackFailing' });
        return;
      }
      await this.applyLookup(lookup, navigation, status.raidedFrom);
    } catch (error) {
      this.log.error(`Re-checking ${status.channel.login} failed: ${String(error)}`);
    }
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    this.stopWatchingRaids();
    this.statusEmitter.dispose();
  }

  private beginNavigation(target: WatchTarget): number {
    const navigation = ++this.navigation;
    this.restarts.reset();
    this.setStatus({ kind: 'loading', target });
    return navigation;
  }

  /** Continues where the player stopped, with a fresh playlist (tokens expire). */
  private async restartVideo(status: VideoStatus, reason: string): Promise<void> {
    const { id } = status.video;
    this.log.warn(`Playback of video ${id} failed: ${reason}`);
    const target: WatchTarget = { type: 'video', id };
    if (!this.restarts.tryConsume()) {
      this.setStatus({ kind: 'error', target, reason: 'playbackFailing' });
      return;
    }
    const navigation = this.navigation;
    try {
      const playlist = await this.services.resolveVideoPlaylist(id);
      if (navigation !== this.navigation) {
        return;
      }
      if (playlist.kind === 'subscribersOnly') {
        this.setStatus({ kind: 'error', target, reason: 'subscribersOnly' });
        return;
      }
      this.setStatus({
        ...status,
        playback: { id: ++this.playbackId, url: playlist.url },
        startAt: this.hooks.resumePosition(id) ?? status.startAt,
      });
    } catch (error) {
      if (navigation === this.navigation) {
        this.log.error(`Reloading video ${id} failed: ${String(error)}`);
        this.setStatus({ kind: 'error', target, reason: 'unreachable' });
      }
    }
  }

  private async applyLookup(
    lookup: ChannelLookup,
    navigation: number,
    raidedFrom: string | undefined,
  ): Promise<void> {
    const raidInfo = raidedFrom ? { raidedFrom } : {};
    if (!lookup.stream) {
      this.setStatus({ kind: 'offline', channel: lookup.channel, ...raidInfo });
      return;
    }
    const url = await this.services.resolvePlaylistUrl(lookup.channel.login);
    if (navigation !== this.navigation) {
      return;
    }
    this.setStatus({
      kind: 'live',
      channel: lookup.channel,
      stream: lookup.stream,
      playback: { id: ++this.playbackId, url },
      ...raidInfo,
    });
  }

  /** Keeps viewer count/title fresh and notices when an offline channel goes live. */
  private async refresh(): Promise<void> {
    const status = this.currentStatus;
    if (status.kind !== 'live' && status.kind !== 'offline') {
      return;
    }
    const navigation = this.navigation;
    try {
      const lookup = await this.services.lookupChannel(status.channel.login);
      if (navigation !== this.navigation || !lookup) {
        return;
      }
      if (status.kind === 'offline' && lookup.stream) {
        this.log.info(`${lookup.channel.displayName} went live`);
        await this.applyLookup(lookup, navigation, undefined);
      } else if (status.kind === 'live' && lookup.stream) {
        this.setStatus({ ...status, channel: lookup.channel, stream: lookup.stream });
      }
    } catch (error) {
      this.log.warn(`Refreshing ${status.channel.login} failed: ${String(error)}`);
    }
  }

  private handleStreamEnded(channel: ChannelInfo): void {
    const pendingRaid = this.raidWatch?.watch.recentlyPreparedTarget();
    if (pendingRaid) {
      this.log.info(`${channel.displayName} went offline right after preparing a raid`);
      this.handleRaid(channel, pendingRaid);
      return;
    }
    this.setStatus({ kind: 'offline', channel });
  }

  private handleRaid(from: ChannelInfo, target: RaidTarget): void {
    this.log.info(`${from.displayName} raided ${target.displayName}`);
    if (!this.hooks.shouldFollowRaids()) {
      this.hooks.onRaidNotFollowed(from, target);
      return;
    }
    void this.open(target.login, from.displayName);
  }

  private watchRaids(channel: ChannelInfo): void {
    if (this.raidWatch?.channelId === channel.id) {
      return;
    }
    this.stopWatchingRaids();
    this.raidWatch = {
      channelId: channel.id,
      watch: this.services.watchRaids(channel.id, (target) => this.handleRaid(channel, target)),
    };
  }

  private stopWatchingRaids(): void {
    this.raidWatch?.watch.dispose();
    this.raidWatch = undefined;
  }

  private setStatus(status: PlayerStatus): void {
    this.currentStatus = status;
    this.statusEmitter.fire(status);
  }
}
