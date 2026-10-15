import * as l10n from '@vscode/l10n';
import type { ChannelInfo, StreamInfo, VideoInfo } from '../../../shared/protocol';
import { formatRelativeTime, formatUptime } from '../../../shared/timeFormat';
import { el, icon } from '../../common/dom';
import { formatExactCount, formatViewerCount } from '../../common/format';
import { ICONS } from '../../common/icons';
import { uiLanguage } from '../../common/l10n';
import { ControlBar, type ControlBarActions, type ControlMode } from './controlBar';

const RAID_BANNER_MS = 8_000;

export interface PlayerStageActions extends ControlBarActions {
  unblockAudio(): void;
}

/** The video with its overlays, control bar and the stream info line underneath. */
export class PlayerStage {
  readonly element: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly controls: ControlBar;
  private readonly spinner = el('div', { className: 'spinner overlay-spinner' });
  private readonly raidBanner = el('div', {
    className: 'raid-banner',
    attributes: { role: 'status' },
  });
  private readonly adBadge = el('div', { className: 'ad-badge', text: l10n.t('Ad break') });
  private readonly unblockButton: HTMLButtonElement;
  private readonly avatar = el('img', { className: 'avatar', attributes: { alt: '' } });
  private readonly name = el('span', { className: 'info-name' });
  private readonly game = el('span', { className: 'info-game' });
  private readonly viewers = el('span', { className: 'info-viewers' });
  private readonly viewersGroup = el('span', { className: 'info-viewers-group' }, [
    icon(ICONS.viewers),
    this.viewers,
  ]);
  private readonly videoDate = el('span', { className: 'info-date' });
  private readonly title = el('div', { className: 'info-title' });
  private raidTimer: number | undefined;

  constructor(actions: PlayerStageActions) {
    this.video = el('video', { className: 'video', attributes: { playsinline: '' } });
    this.controls = new ControlBar(actions, this.video);
    this.unblockButton = el(
      'button',
      { className: 'unblock-audio', attributes: { type: 'button' } },
      [icon(ICONS.volume), el('span', { text: l10n.t('Click for sound') })],
    );
    this.unblockButton.addEventListener('click', () => actions.unblockAudio());

    const frame = el('div', { className: 'video-frame' }, [
      this.video,
      this.spinner,
      this.raidBanner,
      this.adBadge,
      this.unblockButton,
      this.controls.element,
    ]);
    frame.addEventListener('dblclick', () => actions.togglePictureInPicture());

    const info = el('div', { className: 'stream-info' }, [
      el('div', { className: 'info-row' }, [
        this.avatar,
        this.name,
        this.game,
        el('span', { className: 'spacer' }),
        this.viewersGroup,
        this.videoDate,
      ]),
      this.title,
    ]);
    this.element = el('div', { className: 'stage' }, [frame, info]);

    this.setBuffering(true);
    this.setAdBreak(false);
    this.setAudioBlocked(false);
    this.raidBanner.hidden = true;
    this.video.addEventListener('waiting', () => this.setBuffering(true));
    this.video.addEventListener('playing', () => this.setBuffering(false));
    this.video.addEventListener('play', () => this.controls.setPaused(false));
    this.video.addEventListener('pause', () => this.controls.setPaused(true));
  }

  showStream(channel: ChannelInfo, stream: StreamInfo): void {
    this.setMode('live');
    this.showHeader(channel, stream.game, stream.title);
    this.viewers.textContent = formatViewerCount(stream.viewers);
    this.viewersGroup.title = l10n.t(
      '{0} viewers · live for {1}',
      formatExactCount(stream.viewers),
      formatUptime(stream.startedAt),
    );
  }

  showVideo(channel: ChannelInfo, video: VideoInfo): void {
    this.setMode('video');
    this.showHeader(channel, video.game, video.title);
    this.videoDate.textContent = formatRelativeTime(video.createdAt, uiLanguage());
    this.videoDate.title = l10n.t(
      'Broadcast on {0} · {1} views',
      new Date(video.createdAt).toLocaleString(uiLanguage()),
      formatExactCount(video.viewCount),
    );
  }

  showRaid(from: string, to: string): void {
    this.raidBanner.replaceChildren(
      icon(ICONS.raid),
      el('span', { text: l10n.t('{0} raided {1}', from, to) }),
    );
    this.raidBanner.hidden = false;
    window.clearTimeout(this.raidTimer);
    this.raidTimer = window.setTimeout(() => {
      this.raidBanner.hidden = true;
    }, RAID_BANNER_MS);
  }

  setBuffering(buffering: boolean): void {
    this.spinner.hidden = !buffering;
  }

  setAdBreak(adBreak: boolean): void {
    this.adBadge.hidden = !adBreak;
  }

  setAudioBlocked(blocked: boolean): void {
    this.unblockButton.hidden = !blocked;
  }

  private setMode(mode: ControlMode): void {
    this.controls.setMode(mode);
    this.viewersGroup.hidden = mode !== 'live';
    this.videoDate.hidden = mode !== 'video';
  }

  private showHeader(channel: ChannelInfo, game: string | null, title: string): void {
    this.avatar.src = channel.profileImageUrl;
    this.name.textContent = channel.displayName;
    this.game.textContent = game ? `· ${game}` : '';
    this.title.textContent = title;
    this.title.title = title;
  }
}
