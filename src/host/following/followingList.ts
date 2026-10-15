import type { ChannelInfo, StreamInfo } from '../../shared/protocol';
import type { TwitchAuth } from '../auth/twitchAuth';
import { Emitter, type Subscription } from '../emitter';
import type { Logger } from '../logger';
import {
  fetchFollowedChannels,
  fetchFollowedStreams,
  type FollowedChannel,
} from '../twitch/following';

const STREAMS_REFRESH_MS = 2 * 60_000;
const CHANNELS_REFRESH_MS = 30 * 60_000;

export type FollowingState =
  | { kind: 'signedOut' }
  | { kind: 'loading' }
  | { kind: 'ready'; channels: FollowedChannel[] }
  | { kind: 'failed' };

/**
 * The signed-in user's followed channels and which of them are live. Who is
 * live refreshes every few minutes, but only while the list is on screen.
 */
export class FollowingList {
  private channels: ChannelInfo[] | undefined;
  private channelsLoadedAt = 0;
  private current: FollowingState;
  private visible = false;
  private timer: NodeJS.Timeout | undefined;
  private loading: Promise<void> | undefined;
  /** Bumped on sign-in changes so results for the previous account are dropped. */
  private generation = 0;
  private readonly emitter = new Emitter<FollowingState>();
  private readonly subscription: Subscription;
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly auth: TwitchAuth,
    private readonly log: Logger,
  ) {
    this.current = auth.account ? { kind: 'loading' } : { kind: 'signedOut' };
    this.subscription = auth.onDidChangeAccount(() => this.reset());
  }

  get state(): FollowingState {
    return this.current;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    clearInterval(this.timer);
    this.timer = undefined;
    if (visible) {
      this.timer = setInterval(() => void this.refresh(), STREAMS_REFRESH_MS);
      void this.refresh();
    }
  }

  /** `reloadChannels` also reloads whom the user follows, not just who is live. */
  refresh(reloadChannels = false): Promise<void> {
    if (!this.auth.account) {
      this.setState({ kind: 'signedOut' });
      return Promise.resolve();
    }
    this.loading ??= this.load(reloadChannels).finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  dispose(): void {
    clearInterval(this.timer);
    this.subscription.dispose();
    this.emitter.dispose();
  }

  private async load(reloadChannels: boolean): Promise<void> {
    const generation = this.generation;
    if (this.current.kind !== 'ready') {
      this.setState({ kind: 'loading' });
    }
    try {
      const { channels, streams } = await this.auth.withCredentials(
        async (credentials, account) => {
          const live = await fetchFollowedStreams(credentials, account.id);
          const known = new Set(this.channels?.map((channel) => channel.id));
          const stale =
            reloadChannels ||
            !this.channels ||
            Date.now() - this.channelsLoadedAt > CHANNELS_REFRESH_MS ||
            [...live.keys()].some((id) => !known.has(id));
          const followed = stale
            ? await fetchFollowedChannels(credentials, account.id)
            : (this.channels ?? []);
          return { channels: followed, streams: live };
        },
      );
      if (generation !== this.generation) {
        return;
      }
      if (channels !== this.channels) {
        this.channels = channels;
        this.channelsLoadedAt = Date.now();
      }
      this.setState({ kind: 'ready', channels: withStreams(channels, streams) });
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      this.log.warn(`Loading followed channels failed: ${String(error)}`);
      if (this.current.kind !== 'ready') {
        this.setState({ kind: 'failed' });
      }
    }
  }

  private reset(): void {
    this.generation++;
    this.channels = undefined;
    this.loading = undefined;
    this.setState(this.auth.account ? { kind: 'loading' } : { kind: 'signedOut' });
    if (this.visible && this.auth.account) {
      void this.refresh(true);
    }
  }

  private setState(state: FollowingState): void {
    this.current = state;
    this.emitter.fire(state);
  }
}

function withStreams(channels: ChannelInfo[], streams: Map<string, StreamInfo>): FollowedChannel[] {
  return channels.map((channel) => ({ ...channel, stream: streams.get(channel.id) ?? null }));
}
