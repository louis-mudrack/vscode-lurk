import { el, icon } from '../../common/dom';
import { ICONS } from '../../common/icons';
import { AUTO_LEVEL } from '../qualityLevels';
import type { QualityState } from '../streamPlayer';

/** Popup listing "Auto" plus every rendition; closes on selection or outside click. */
export class QualityMenu {
  readonly element = el('div', { className: 'quality-menu', attributes: { role: 'menu' } });
  private state: QualityState = { options: [], selectedIndex: AUTO_LEVEL, playingLabel: null };

  constructor(private readonly onSelect: (index: number) => void) {
    this.element.hidden = true;
    document.addEventListener('pointerdown', (event) => {
      if (!this.element.hidden && !this.element.contains(event.target as Node)) {
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  update(state: QualityState): void {
    this.state = state;
    if (this.isOpen) {
      this.render();
    }
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.render();
    this.element.hidden = false;
  }

  close(): void {
    this.element.hidden = true;
  }

  private render(): void {
    const autoLabel = this.state.playingLabel ? `Auto (${this.state.playingLabel})` : 'Auto';
    const entries = [
      { index: AUTO_LEVEL, label: autoLabel },
      ...this.state.options.map(({ index, label }) => ({ index, label })),
    ];
    this.element.replaceChildren(
      ...entries.map(({ index, label }) => {
        const selected = index === this.state.selectedIndex;
        const item = el(
          'button',
          {
            className: `quality-option${selected ? ' selected' : ''}`,
            attributes: { role: 'menuitemradio', 'aria-checked': String(selected) },
          },
          [icon(ICONS.check, 'icon check'), el('span', { text: label })],
        );
        item.addEventListener('click', (event) => {
          event.stopPropagation();
          this.close();
          this.onSelect(index);
        });
        return item;
      }),
    );
  }
}
