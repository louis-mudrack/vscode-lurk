import { el, icon } from '../../common/dom';
import { ICONS } from '../../common/icons';
import { AUTO_LEVEL } from '../qualityLevels';
import type { QualityState } from '../streamPlayer';
import { QualityMenu } from './qualityMenu';

export interface ControlBarActions {
  togglePause(): void;
  setVolume(volume: number, muted: boolean): void;
  selectLevel(index: number): void;
  togglePictureInPicture(): void;
}

const DEFAULT_UNMUTE_VOLUME = 0.5;

function iconButton(label: string, path: string, onClick: () => void): HTMLButtonElement {
  const button = el(
    'button',
    { className: 'icon-button', title: label, attributes: { type: 'button', 'aria-label': label } },
    [icon(path)],
  );
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function setIcon(button: HTMLButtonElement, path: string, label: string): void {
  button.replaceChildren(icon(path));
  button.title = label;
  button.setAttribute('aria-label', label);
}

/** Play/pause, volume, live badge, quality and picture-in-picture controls. */
export class ControlBar {
  readonly element: HTMLElement;
  private volume = 0.5;
  private muted = false;
  private readonly playButton: HTMLButtonElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly qualityButton: HTMLButtonElement;
  private readonly qualityMenu: QualityMenu;

  constructor(private readonly actions: ControlBarActions) {
    this.playButton = iconButton('Pause', ICONS.pause, () => actions.togglePause());
    this.muteButton = iconButton('Mute', ICONS.volume, () => this.toggleMute());
    this.volumeSlider = el('input', {
      className: 'volume-slider',
      attributes: { type: 'range', min: '0', max: '1', step: '0.01', 'aria-label': 'Volume' },
    });
    this.volumeSlider.addEventListener('input', () =>
      this.commitVolume(Number(this.volumeSlider.value), false),
    );
    this.qualityMenu = new QualityMenu((index) => actions.selectLevel(index));
    this.qualityButton = el(
      'button',
      { className: 'quality-button', title: 'Quality', attributes: { type: 'button' } },
      [icon(ICONS.quality), el('span', { className: 'quality-label', text: 'Auto' })],
    );
    this.qualityButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.qualityMenu.toggle();
    });
    const pictureInPicture = document.pictureInPictureEnabled
      ? iconButton('Picture in picture', ICONS.pictureInPicture, () =>
          actions.togglePictureInPicture(),
        )
      : null;

    this.element = el('div', { className: 'control-bar' }, [
      this.playButton,
      el('div', { className: 'volume-group' }, [this.muteButton, this.volumeSlider]),
      el('span', { className: 'live-badge', text: 'LIVE' }),
      el('span', { className: 'spacer' }),
      el('div', { className: 'quality-anchor' }, [this.qualityButton, this.qualityMenu.element]),
      pictureInPicture,
    ]);
  }

  setPaused(paused: boolean): void {
    setIcon(this.playButton, paused ? ICONS.play : ICONS.pause, paused ? 'Play' : 'Pause');
  }

  showVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.volumeSlider.value = String(muted ? 0 : volume);
    setIcon(
      this.muteButton,
      muted || volume === 0 ? ICONS.muted : ICONS.volume,
      muted ? 'Unmute' : 'Mute',
    );
  }

  showQuality(state: QualityState): void {
    const selected = state.options.find((option) => option.index === state.selectedIndex);
    const label =
      state.selectedIndex === AUTO_LEVEL || !selected
        ? `Auto${state.playingLabel ? ` · ${state.playingLabel}` : ''}`
        : selected.label;
    this.qualityButton.querySelector('.quality-label')?.replaceChildren(label);
    this.qualityMenu.update(state);
  }

  private toggleMute(): void {
    const silent = this.muted || this.volume === 0;
    this.commitVolume(silent && this.volume === 0 ? DEFAULT_UNMUTE_VOLUME : this.volume, !silent);
  }

  private commitVolume(volume: number, muted: boolean): void {
    this.showVolume(volume, muted);
    this.actions.setVolume(volume, muted);
  }
}
