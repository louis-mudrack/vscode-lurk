import type { Logger } from '../logger';
import { HermesSubscription } from './hermesSubscription';
import { parseRaidEvent, type RaidTarget } from './raidEvents';

/** A prepared raid this old is assumed abandoned when the stream goes offline. */
const PREPARED_RAID_TTL_MS = 3 * 60_000;

export interface RaidWatch {
  readonly isConnected: boolean;
  recentlyPreparedTarget(): RaidTarget | undefined;
  dispose(): void;
}

/** Turns the raid notification stream into "raid executed" moments, each reported once. */
export class RaidTracker {
  private readonly handledRaidIds = new Set<string>();
  private prepared: { target: RaidTarget; preparedAt: number } | undefined;

  /** Returns the raid target when this payload executes a raid not seen before. */
  accept(payload: unknown, now = Date.now()): RaidTarget | undefined {
    const event = parseRaidEvent(payload);
    switch (event?.kind) {
      case 'prepared':
        this.prepared = { target: event.target, preparedAt: now };
        return undefined;
      case 'cancelled':
        this.prepared = undefined;
        return undefined;
      case 'executed': {
        // Twitch sends the "go" event more than once.
        const key = event.raidId || event.target.login;
        if (this.handledRaidIds.has(key)) {
          return undefined;
        }
        this.handledRaidIds.add(key);
        this.prepared = undefined;
        return event.target;
      }
      default:
        return undefined;
    }
  }

  /** The target of a raid that was announced but whose "go" event never arrived. */
  recentlyPreparedTarget(now = Date.now()): RaidTarget | undefined {
    if (!this.prepared || now - this.prepared.preparedAt > PREPARED_RAID_TTL_MS) {
      return undefined;
    }
    return this.prepared.target;
  }
}

/** Watches one channel for outgoing raids over Twitch's Hermes socket. */
export class RaidWatcher implements RaidWatch {
  private readonly tracker = new RaidTracker();
  private readonly subscription: HermesSubscription;

  constructor(channelId: string, onRaid: (target: RaidTarget) => void, log: Logger) {
    this.subscription = new HermesSubscription(
      `raid.${channelId}`,
      (payload) => {
        const target = this.tracker.accept(payload);
        if (target) {
          onRaid(target);
        }
      },
      log,
    );
  }

  get isConnected(): boolean {
    return this.subscription.isSubscribed;
  }

  recentlyPreparedTarget(): RaidTarget | undefined {
    return this.tracker.recentlyPreparedTarget();
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
