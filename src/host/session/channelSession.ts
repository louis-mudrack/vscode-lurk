import type { ChannelInfo, PlayerStatus } from '../../shared/protocol';
import { Emitter } from '../emitter';
import type { Logger } from '../logger';
import type { ChannelLookup } from '../twitch/channels';
import type { RaidTarget } from '../twitch/raidEvents';
import type { RaidWatch } from '../twitch/raidWatcher';

const REFRESH_INTERVAL_MS = 60_000;
const MAX_PLAYBACK_RESTARTS = 3;
const PLAYBACK_RESTART_WINDOW_MS = 5 * 60_000;

/** Network access, injected so the session logic can be tested without Twitch. */
export interface SessionServices {
  lookupChannel(login: string): Promise<ChannelLookup | null>;
  resolvePlaylistUrl(login: string): Promise<string>;
  watchRaids(channelId: string, onRaid: (target: RaidTarget) => void): RaidWatch;
}

export interface SessionHooks {
  shouldFollowRaids(): boolean;
  onRaidNotFollowed(from: ChannelInfo, target: RaidTarget): void;
  rememberChannel(channel: ChannelInfo): Promise<void>;
}

/**
 * Owns "what is being watched": resolves channels, hands playlist URLs to the
 * player, follows raids and notices when a stream ends or comes back.
 */
export class ChannelSession {
  private readonly statusEmitter = new Emitter<PlayerStatus>();
  readonly onDidChangeStatus = this.statusEmitter.event;

  private currentStatus: PlayerStatus = { kind: 'idle' };
  /** Bumped on every navigation so results of superseded requests are dropped. */
  private navigation = 0;
  private playbackId = 0;
  private restartTimestamps: number[] = [];
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
    return status.kind === 'live' || status.kind === 'offline' ? status.channel : undefined;
  }

  get isWatchingRaids(): boolean {
    return this.raidWatch?.watch.isConnected ?? false;
  }

  async open(login: string, raidedFrom?: string): Promise<void> {
    const navigation = ++this.navigation;
    this.restartTimestamps = [];
    this.setStatus({ kind: 'loading', login });
    try {
      const lookup = await this.services.lookupChannel(login);
      if (navigation !== this.navigation) {
        return;
      }
      if (!lookup) {
        this.stopWatchingRaids();
        this.setStatus({ kind: 'error', login, message: `There is no Twitch channel "${login}".` });
        return;
      }
      await this.hooks.rememberChannel(lookup.channel);
      this.watchRaids(lookup.channel);
      await this.applyLookup(lookup, navigation, raidedFrom);
    } catch (error) {
      if (navigation === this.navigation) {
        this.log.error(`Opening ${login} failed: ${String(error)}`);
        this.setStatus({
          kind: 'error',
          login,
          message: 'Could not reach Twitch. Check your connection and try again.',
        });
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
    if (status.kind === 'error' || status.kind === 'loading') {
      await this.open(status.login);
    } else if (status.kind === 'live' || status.kind === 'offline') {
      await this.open(status.channel.login);
    }
  }

  /** Called when the player gave up on the current playlist (stream ended, token expired, …). */
  async handlePlaybackFailure(reason: string): Promise<void> {
    const status = this.currentStatus;
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
      if (!this.allowRestart()) {
        this.setStatus({
          kind: 'error',
          login: status.channel.login,
          message: 'The stream keeps failing to play. Try again in a moment.',
        });
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

  private allowRestart(now = Date.now()): boolean {
    this.restartTimestamps = this.restartTimestamps.filter(
      (timestamp) => now - timestamp < PLAYBACK_RESTART_WINDOW_MS,
    );
    if (this.restartTimestamps.length >= MAX_PLAYBACK_RESTARTS) {
      return false;
    }
    this.restartTimestamps.push(now);
    return true;
  }

  private setStatus(status: PlayerStatus): void {
    this.currentStatus = status;
    this.statusEmitter.fire(status);
  }
}
