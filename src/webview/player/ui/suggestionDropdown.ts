import * as l10n from '@vscode/l10n';
import type { ChannelSuggestion } from '../../../shared/protocol';
import { el } from '../../common/dom';
import { formatViewerCount } from '../../common/format';

const SEARCH_DELAY_MS = 200;
const SEARCHABLE_INPUT = /^@?[a-z0-9_]{1,25}$/i;
const LIST_ID = 'channel-suggestions';
const MIN_LIST_HEIGHT_PX = 90;
const LIST_MARGIN_PX = 8;

export type ChannelSearch = (query: string) => Promise<ChannelSuggestion[]>;

function suggestionMeta(suggestion: ChannelSuggestion): HTMLElement {
  if (!suggestion.isLive) {
    return el('span', { className: 'suggestion-meta', text: l10n.t('Offline') });
  }
  const details = [
    suggestion.game,
    suggestion.viewers !== null ? formatViewerCount(suggestion.viewers) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return el('span', { className: 'suggestion-meta live' }, [
    el('span', { className: 'live-dot', attributes: { 'aria-label': l10n.t('Live') } }),
    details || l10n.t('Live'),
  ]);
}

/**
 * Suggests channels under the channel input while typing, like the
 * twitch.tv search box. Arrow keys move through the list, Enter picks.
 */
export class SuggestionDropdown {
  readonly element = el('ul', {
    className: 'suggestions',
    attributes: { id: LIST_ID, role: 'listbox' },
  });
  private suggestions: ChannelSuggestion[] = [];
  private activeIndex = -1;
  private searchTimer: number | undefined;
  private searchSequence = 0;

  constructor(
    private readonly input: HTMLInputElement,
    private readonly search: ChannelSearch,
    private readonly onPick: (login: string) => void,
  ) {
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', LIST_ID);
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('input', () => this.scheduleSearch());
    input.addEventListener('keydown', (event) => this.handleKey(event));
    input.addEventListener('blur', () => this.close());
    // Keeps focus in the input so a click on a suggestion is not cancelled by the blur above.
    this.element.addEventListener('mousedown', (event) => event.preventDefault());
    this.render();
  }

  close(): void {
    window.clearTimeout(this.searchTimer);
    this.searchSequence++;
    this.show([]);
  }

  private scheduleSearch(): void {
    window.clearTimeout(this.searchTimer);
    const sequence = ++this.searchSequence;
    const query = this.input.value.trim();
    if (!SEARCHABLE_INPUT.test(query)) {
      this.show([]);
      return;
    }
    this.searchTimer = window.setTimeout(() => {
      void this.search(query.replace(/^@/, '')).then((suggestions) => {
        if (sequence === this.searchSequence) {
          this.show(suggestions);
        }
      });
    }, SEARCH_DELAY_MS);
  }

  private handleKey(event: KeyboardEvent): void {
    if (this.suggestions.length === 0) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActive((this.activeIndex + 1) % this.suggestions.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.setActive(this.activeIndex <= 0 ? this.suggestions.length - 1 : this.activeIndex - 1);
        break;
      case 'Enter': {
        const active = this.suggestions[this.activeIndex];
        if (active) {
          event.preventDefault();
          this.pick(active);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  private pick(suggestion: ChannelSuggestion): void {
    this.input.value = suggestion.login;
    this.close();
    this.onPick(suggestion.login);
  }

  private show(suggestions: ChannelSuggestion[]): void {
    this.suggestions = suggestions;
    this.activeIndex = -1;
    this.render();
  }

  private setActive(index: number): void {
    this.activeIndex = index;
    this.render();
  }

  private render(): void {
    const open = this.suggestions.length > 0;
    this.element.hidden = !open;
    this.input.setAttribute('aria-expanded', String(open));
    if (open) {
      const spaceBelow =
        window.innerHeight - this.input.getBoundingClientRect().bottom - LIST_MARGIN_PX;
      this.element.style.maxHeight = `${Math.max(MIN_LIST_HEIGHT_PX, spaceBelow)}px`;
    }
    const activeId = this.activeIndex >= 0 ? `${LIST_ID}-${this.activeIndex}` : null;
    if (activeId) {
      this.input.setAttribute('aria-activedescendant', activeId);
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
    this.element.replaceChildren(
      ...this.suggestions.map((suggestion, index) => {
        const active = index === this.activeIndex;
        const item = el(
          'li',
          {
            className: `suggestion${active ? ' active' : ''}`,
            attributes: {
              id: `${LIST_ID}-${index}`,
              role: 'option',
              'aria-selected': String(active),
            },
          },
          [
            el('img', {
              className: 'avatar',
              attributes: { src: suggestion.profileImageUrl, alt: '', loading: 'lazy' },
            }),
            el('span', { className: 'suggestion-name', text: suggestion.displayName }),
            suggestionMeta(suggestion),
          ],
        );
        item.addEventListener('click', () => this.pick(suggestion));
        return item;
      }),
    );
    if (activeId) {
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
    }
  }
}
