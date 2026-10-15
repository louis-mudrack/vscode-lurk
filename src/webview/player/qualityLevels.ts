import { QUALITY_OPTIONS, type QualityPreference } from '../../shared/protocol';

export const AUTO_LEVEL = -1;

export interface LevelDescriptor {
  height: number;
  bitrate: number;
  frameRate: number;
}

const HIGH_FRAME_RATE = 30;
const CAPPED_HEIGHTS = QUALITY_OPTIONS.filter((option) => option !== 'auto')
  .map((option) => ({ option, height: Number.parseInt(option, 10) }))
  .sort((a, b) => a.height - b.height);

export function levelLabel(level: LevelDescriptor): string {
  const frameRate = Math.round(level.frameRate);
  return `${level.height}p${frameRate > HIGH_FRAME_RATE ? frameRate : ''}`;
}

/** Best level not taller than the preference; the smallest one if all are taller. */
export function levelIndexForPreference(
  levels: readonly LevelDescriptor[],
  preference: QualityPreference,
): number {
  if (preference === 'auto' || levels.length === 0) {
    return AUTO_LEVEL;
  }
  const maxHeight = Number.parseInt(preference, 10);
  let best = AUTO_LEVEL;
  let smallest = AUTO_LEVEL;
  levels.forEach((level, index) => {
    const current = levels[best];
    if (level.height <= maxHeight && (!current || isBetter(level, current))) {
      best = index;
    }
    const smallestLevel = levels[smallest];
    if (!smallestLevel || level.height < smallestLevel.height) {
      smallest = index;
    }
  });
  return best !== AUTO_LEVEL ? best : smallest;
}

function isBetter(candidate: LevelDescriptor, current: LevelDescriptor): boolean {
  return candidate.height !== current.height
    ? candidate.height > current.height
    : candidate.bitrate > current.bitrate;
}

/** The preference that selects a level of this height. */
export function preferenceForHeight(height: number): QualityPreference {
  return CAPPED_HEIGHTS.find((entry) => entry.height >= height)?.option ?? '1080p';
}
