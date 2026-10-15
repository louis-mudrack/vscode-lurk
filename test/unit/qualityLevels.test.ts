import { describe, expect, it } from 'vitest';
import {
  AUTO_LEVEL,
  levelIndexForPreference,
  levelLabel,
  preferenceForHeight,
} from '../../src/webview/player/qualityLevels';

const levels = [
  { height: 480, bitrate: 1_400_000, frameRate: 30 },
  { height: 1080, bitrate: 8_000_000, frameRate: 60 },
  { height: 720, bitrate: 3_400_000, frameRate: 60 },
  { height: 720, bitrate: 2_300_000, frameRate: 30 },
  { height: 160, bitrate: 230_000, frameRate: 30 },
];

describe('quality levels', () => {
  it('labels levels like Twitch does', () => {
    expect(levelLabel({ height: 720, bitrate: 0, frameRate: 60 })).toBe('720p60');
    expect(levelLabel({ height: 480, bitrate: 0, frameRate: 30 })).toBe('480p');
  });

  it('picks the best level not taller than the preference', () => {
    expect(levelIndexForPreference(levels, 'auto')).toBe(AUTO_LEVEL);
    expect(levelIndexForPreference(levels, '1080p')).toBe(1);
    expect(levelIndexForPreference(levels, '720p')).toBe(2);
    expect(levelIndexForPreference(levels, '360p')).toBe(4);
  });

  it('falls back to the smallest level when every level is taller', () => {
    expect(levelIndexForPreference(levels.slice(0, 3), '160p')).toBe(0);
  });

  it('maps a chosen height back to a preference', () => {
    expect(preferenceForHeight(720)).toBe('720p');
    expect(preferenceForHeight(900)).toBe('1080p');
    expect(preferenceForHeight(1440)).toBe('1080p');
    expect(preferenceForHeight(160)).toBe('160p');
  });
});
