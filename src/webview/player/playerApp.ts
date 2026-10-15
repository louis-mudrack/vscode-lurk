import * as l10n from '@vscode/l10n';
import type {
  HostToPlayerMessage,
  PlayerErrorReason,
  PlayerPreferences,
  PlayerStatus,
  QualityPreference,
  RecentChannel,
} from '../../shared/protocol';
import { el } from '../common/dom';
import { ICONS } from '../common/icons';
import { onHostMessage } from '../common/vscodeApi';
import { HostBridge } from './hostBridge';
import { AUTO_LEVEL, preferenceForHeight } from './qualityLevels';
import { StreamPlayer, type QualityState } from './streamPlayer';
import { createChannelPicker } from './ui/channelPicker';
import { PlayerStage } from './ui/playerStage';
import { createStatusScreen, textButton } from './ui/statusScreen';

const AUDIO_BLOCK_CHECK_MS = 1_000;
const DIAGNOSTICS_INTERVAL_MS = 5_000;

function errorMessage(reason: PlayerErrorReason, login: string): string {
  switch (reason) {
    case 'notFound':
      return l10n.t('There is no Twitch channel "{0}".', login);
    case 'unreachable':
      return l10n.t('Could not reach Twitch. Check your connection and try again.');
    case 'playbackFailing':
      return l10n.t('The stream keeps failing to play. Try again in a moment.');
  }
}

/** Renders whatever the extension host says is being watched. */
export class PlayerApp {
  private readonly host = new HostBridge();
  private readonly stage: PlayerStage;
  private readonly player: StreamPlayer;
  private readonly screen = el('div', { className: 'screen' });
  private status: PlayerStatus = { kind: 'idle' };
  private recent: RecentChannel[] = [];
  private preferences: PlayerPreferences = { volume: 0.5, muted: false, quality: 'auto' };
  private quality: QualityState = { options: [], selectedIndex: AUTO_LEVEL, playingLabel: null };
  private loadedPlaybackId: number | undefined;
  private announcedRaidChannelId: string | undefined;

  constructor(root: HTMLElement) {
    this.stage = new PlayerStage({
      togglePause: () => this.player.togglePause(),
      setVolume: (volume, muted) => this.changeVolume(volume, muted),
      selectLevel: (index) => this.selectLevel(index),
      togglePictureInPicture: () => void this.togglePictureInPicture(),
      unblockAudio: () => this.unlockAudio(),
    });
    this.player = new StreamPlayer(this.stage.video, this.host, {
      onQualityChange: (state) => {
        this.quality = state;
        this.stage.controls.showQuality(state);
      },
      onAdBreakChange: (adBreak) => this.stage.setAdBreak(adBreak),
      onPlaybackFailed: (reason) => {
        this.loadedPlaybackId = undefined;
        this.stage.setBuffering(true);
        this.host.post({ type: 'playbackFailed', reason });
      },
    });
    root.append(this.stage.element, this.screen);
    this.render();
    // Webviews follow Chromium's autoplay policy: audio may only start after a user gesture.
    for (const gesture of ['pointerup', 'keyup']) {
      document.addEventListener(gesture, () => this.unlockAudio(), { capture: true });
    }

    onHostMessage<HostToPlayerMessage>((message) => this.handle(message));
    window.setInterval(
      () => this.stage.setAudioBlocked(this.player.isAudioBlocked),
      AUDIO_BLOCK_CHECK_MS,
    );
    window.setInterval(() => this.reportDiagnostics(), DIAGNOSTICS_INTERVAL_MS);
    this.host.post({ type: 'ready' });
  }

  private handle(message: HostToPlayerMessage): void {
    switch (message.type) {
      case 'status':
        this.status = message.status;
        this.recent = message.recent;
        this.render();
        break;
      case 'preferences':
        this.applyPreferences(message.preferences);
        break;
      case 'fetchResult':
        this.host.resolveFetch(message.requestId, message.result);
        break;
    }
  }

  private applyPreferences(preferences: PlayerPreferences): void {
    const qualityChanged = preferences.quality !== this.preferences.quality;
    this.preferences = preferences;
    this.stage.controls.showVolume(preferences.volume, preferences.muted);
    this.player.setVolume(preferences.volume, preferences.muted);
    if (qualityChanged) {
      this.player.setPreference(preferences.quality);
    }
  }

  private render(): void {
    const status = this.status;
    const live = status.kind === 'live';
    this.stage.element.hidden = !live;
    this.screen.hidden = live;
    if (status.kind === 'live') {
      this.stage.showStream(status.channel, status.stream);
      if (status.playback.id !== this.loadedPlaybackId) {
        this.loadedPlaybackId = status.playback.id;
        this.stage.setBuffering(true);
        this.player.load(status.playback.url, this.preferences.quality);
      }
      if (status.raidedFrom && this.announcedRaidChannelId !== status.channel.id) {
        this.announcedRaidChannelId = status.channel.id;
        this.stage.showRaid(status.raidedFrom, status.channel.displayName);
      }
      this.screen.replaceChildren();
      return;
    }
    if (this.loadedPlaybackId !== undefined) {
      this.loadedPlaybackId = undefined;
      this.player.stop();
    }
    this.screen.replaceChildren(this.screenFor(status));
  }

  private screenFor(status: Exclude<PlayerStatus, { kind: 'live' }>): HTMLElement {
    switch (status.kind) {
      case 'idle':
        return createStatusScreen({
          iconPath: ICONS.screen,
          title: l10n.t('Watch a Twitch stream'),
          detail: l10n.t('When the channel raids someone, the player follows along.'),
          footer: this.channelPicker(),
        });
      case 'loading':
        return createStatusScreen({ busy: true, title: l10n.t('Opening {0}…', status.login) });
      case 'offline':
        return createStatusScreen({
          avatarUrl: status.channel.profileImageUrl,
          title: l10n.t('{0} is offline', status.channel.displayName),
          detail: l10n.t('The stream starts here automatically when they go live.'),
          footer: this.channelPicker(),
        });
      case 'error':
        return createStatusScreen({
          iconPath: ICONS.retry,
          title: errorMessage(status.reason, status.login),
          actions: [textButton(l10n.t('Try again'), () => this.host.post({ type: 'retry' }), true)],
          footer: this.channelPicker(),
        });
    }
  }

  private channelPicker(): HTMLElement {
    return createChannelPicker({
      recent: this.recent,
      onOpen: (login) => this.host.post({ type: 'openChannel', input: login }),
      onRemove: (login) => this.host.post({ type: 'removeRecent', login }),
    });
  }

  private changeVolume(volume: number, muted: boolean): void {
    this.preferences = { ...this.preferences, volume, muted };
    this.player.setVolume(volume, muted);
    this.host.post({ type: 'savePreferences', preferences: { volume, muted } });
  }

  private unlockAudio(): void {
    this.player.applyVolume();
    this.stage.setAudioBlocked(this.player.isAudioBlocked);
  }

  private selectLevel(index: number): void {
    this.player.selectLevel(index);
    const height = this.quality.options.find((option) => option.index === index)?.height;
    const quality: QualityPreference =
      index === AUTO_LEVEL || height === undefined ? 'auto' : preferenceForHeight(height);
    this.preferences = { ...this.preferences, quality };
    this.host.post({ type: 'savePreferences', preferences: { quality } });
  }

  private async togglePictureInPicture(): Promise<void> {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await this.stage.video.requestPictureInPicture();
      }
    } catch {
      // Picture-in-picture is unavailable until video frames exist or when the host forbids it.
    }
  }

  private reportDiagnostics(): void {
    if (this.status.kind === 'live') {
      this.host.post({ type: 'diagnostics', diagnostics: this.player.diagnostics() });
    }
  }
}
