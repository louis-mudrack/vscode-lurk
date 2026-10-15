import type { ChannelInfo, StreamInfo } from '../../../shared/protocol';
import { el, icon } from '../../common/dom';
import { formatUptime, formatViewerCount } from '../../common/format';
import { ICONS } from '../../common/icons';
import { ControlBar, type ControlBarActions } from './controlBar';

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
  private readonly adBadge = el('div', { className: 'ad-badge', text: 'Ad break' });
  private readonly unblockButton: HTMLButtonElement;
  private readonly avatar = el('img', { className: 'avatar', attributes: { alt: '' } });
  private readonly name = el('span', { className: 'info-name' });
  private readonly game = el('span', { className: 'info-game' });
  private readonly viewers = el('span', { className: 'info-viewers' });
  private readonly title = el('div', { className: 'info-title' });
  private raidTimer: number | undefined;

  constructor(actions: PlayerStageActions) {
    this.video = el('video', { className: 'video', attributes: { playsinline: '' } });
    this.controls = new ControlBar(actions);
    this.unblockButton = el(
      'button',
      { className: 'unblock-audio', attributes: { type: 'button' } },
      [icon(ICONS.volume), el('span', { text: 'Click to enable sound' })],
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
        el('span', { className: 'info-viewers-group' }, [icon(ICONS.viewers), this.viewers]),
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
    this.avatar.src = channel.profileImageUrl;
    this.name.textContent = channel.displayName;
    this.game.textContent = stream.game ? `· ${stream.game}` : '';
    this.viewers.textContent = formatViewerCount(stream.viewers);
    this.viewers.parentElement?.setAttribute(
      'title',
      `${stream.viewers.toLocaleString('en')} viewers · live for ${formatUptime(stream.startedAt)}`,
    );
    this.title.textContent = stream.title;
    this.title.title = stream.title;
  }

  showRaid(from: string, to: string): void {
    this.raidBanner.replaceChildren(icon(ICONS.raid), el('span', { text: `${from} raided ${to}` }));
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
}
