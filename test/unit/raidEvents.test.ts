import { describe, expect, it } from 'vitest';
import { parseRaidEvent } from '../../src/host/twitch/raidEvents';
import { RaidTracker } from '../../src/host/twitch/raidWatcher';

const raid = {
  id: 'fdb2ec8c-5208-43b0-81c7-f91a59495c45',
  source_id: '32776386',
  target_id: '44209194',
  target_login: 'DatFailGamur',
  target_display_name: 'DatFailGamur',
  viewer_count: 275,
};

const target = { id: '44209194', login: 'datfailgamur', displayName: 'DatFailGamur' };

describe('parseRaidEvent', () => {
  it('reads an executed raid from a plain payload', () => {
    expect(parseRaidEvent({ type: 'raid_go_v2', raid })).toEqual({
      kind: 'executed',
      raidId: raid.id,
      target,
    });
  });

  it('unwraps a Hermes notification whose pubsub field is a JSON string', () => {
    const notification = { pubsub: JSON.stringify({ type: 'raid_update_v2', raid }) };
    expect(parseRaidEvent(notification)).toEqual({ kind: 'prepared', raidId: raid.id, target });
  });

  it('unwraps the legacy PubSub MESSAGE envelope', () => {
    const legacy = {
      type: 'MESSAGE',
      data: { topic: 'raid.32776386', message: JSON.stringify({ type: 'raid_go_v2', raid }) },
    };
    expect(parseRaidEvent(legacy)?.kind).toBe('executed');
  });

  it('recognizes cancellations', () => {
    expect(parseRaidEvent({ type: 'raid_cancel_v2', raid: { id: 'x' } })).toEqual({
      kind: 'cancelled',
      raidId: 'x',
    });
  });

  it('ignores unrelated or malformed payloads', () => {
    expect(parseRaidEvent({ type: 'something_else', raid })).toBeUndefined();
    expect(parseRaidEvent({ type: 'raid_go_v2', raid: { id: '1' } })).toBeUndefined();
    expect(parseRaidEvent('not json')).toBeUndefined();
    expect(parseRaidEvent(null)).toBeUndefined();
  });
});

describe('RaidTracker', () => {
  const go = { type: 'raid_go_v2', raid };

  it('reports each executed raid only once', () => {
    const tracker = new RaidTracker();
    expect(tracker.accept(go)).toEqual(target);
    expect(tracker.accept(go)).toBeUndefined();
  });

  it('remembers a prepared raid until it expires or is cancelled', () => {
    const tracker = new RaidTracker();
    tracker.accept({ type: 'raid_update_v2', raid }, 1_000);
    expect(tracker.recentlyPreparedTarget(2_000)).toEqual(target);
    expect(tracker.recentlyPreparedTarget(1_000 + 4 * 60_000)).toBeUndefined();

    tracker.accept({ type: 'raid_cancel_v2', raid }, 3_000);
    expect(tracker.recentlyPreparedTarget(3_000)).toBeUndefined();
  });

  it('forgets the prepared raid once it executes', () => {
    const tracker = new RaidTracker();
    tracker.accept({ type: 'raid_update_v2', raid }, 1_000);
    tracker.accept(go, 2_000);
    expect(tracker.recentlyPreparedTarget(2_000)).toBeUndefined();
  });
});
