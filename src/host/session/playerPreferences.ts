import * as vscode from 'vscode';
import {
  QUALITY_OPTIONS,
  type PlayerPreferences,
  type QualityPreference,
} from '../../shared/protocol';

const VOLUME_KEY = 'twitchPlayer.volume';
const MUTED_KEY = 'twitchPlayer.muted';
const DEFAULT_VOLUME = 0.5;

function isQuality(value: unknown): value is QualityPreference {
  return QUALITY_OPTIONS.includes(value as QualityPreference);
}

/** Volume survives restarts; a quality picked in the player only overrides the setting until reload. */
export class PlayerPreferenceStore {
  private qualityOverride: QualityPreference | undefined;

  constructor(private readonly storage: vscode.Memento) {}

  current(): PlayerPreferences {
    const configured = vscode.workspace.getConfiguration('twitchPlayer').get<string>('quality');
    return {
      volume: this.storage.get<number>(VOLUME_KEY, DEFAULT_VOLUME),
      muted: this.storage.get<boolean>(MUTED_KEY, false),
      quality: this.qualityOverride ?? (isQuality(configured) ? configured : 'auto'),
    };
  }

  async update(changes: Partial<PlayerPreferences>): Promise<void> {
    if (changes.volume !== undefined) {
      await this.storage.update(VOLUME_KEY, Math.min(1, Math.max(0, changes.volume)));
    }
    if (changes.muted !== undefined) {
      await this.storage.update(MUTED_KEY, changes.muted);
    }
    if (changes.quality !== undefined && isQuality(changes.quality)) {
      this.qualityOverride = changes.quality;
    }
  }

  clearQualityOverride(): void {
    this.qualityOverride = undefined;
  }
}
