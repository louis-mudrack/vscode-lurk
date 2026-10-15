import * as l10n from '@vscode/l10n';
import { formatDuration } from '../../../shared/timeFormat';
import { el } from '../../common/dom';

const MEDIA_PROGRESS_EVENTS = ['timeupdate', 'durationchange', 'seeked', 'emptied'];

/** Position slider and elapsed/total time; only videos can seek, live streams hide both. */
export class SeekBar {
  readonly slider: HTMLInputElement;
  readonly time = el('span', { className: 'time-label' });
  private dragging = false;

  constructor(
    private readonly video: HTMLVideoElement,
    onSeek: (seconds: number) => void,
  ) {
    this.slider = el('input', {
      className: 'seek-slider',
      attributes: {
        type: 'range',
        min: '0',
        max: '0',
        step: '1',
        value: '0',
        'aria-label': l10n.t('Position'),
      },
    });
    this.slider.addEventListener('input', () => {
      this.dragging = true;
      this.showTime(Number(this.slider.value));
    });
    this.slider.addEventListener('change', () => {
      this.dragging = false;
      onSeek(Number(this.slider.value));
    });
    for (const event of MEDIA_PROGRESS_EVENTS) {
      video.addEventListener(event, () => this.sync());
    }
    this.sync();
  }

  setVisible(visible: boolean): void {
    this.slider.hidden = !visible;
    this.time.hidden = !visible;
  }

  private sync(): void {
    this.slider.max = String(this.duration());
    if (!this.dragging) {
      this.slider.value = String(this.video.currentTime);
      this.showTime(this.video.currentTime);
    }
  }

  private duration(): number {
    const { duration } = this.video;
    return Number.isFinite(duration) ? Math.floor(duration) : 0;
  }

  private showTime(position: number): void {
    this.time.textContent = `${formatDuration(position)} / ${formatDuration(this.duration())}`;
    this.slider.setAttribute('aria-valuetext', formatDuration(position));
  }
}
