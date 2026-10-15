import * as l10n from '@vscode/l10n';
import { el } from '../common/dom';
import type { Completion, CompletionIndex } from './completion';

const MAX_MESSAGE_LENGTH = 500;
const MAX_SUGGESTIONS = 8;
const MAX_TAB_COMPLETIONS = 30;
/** `:ka` lists emotes, `@k` lists chatters, like Chatterino and 7TV's extension. */
const MIN_EMOTE_QUERY = 2;
const MIN_CHATTER_QUERY = 1;
const MIN_LIST_HEIGHT_PX = 60;

interface WordRange {
  start: number;
  end: number;
  text: string;
}

interface TabCycle {
  completions: Completion[];
  index: number;
  start: number;
  end: number;
}

function wordBeforeCaret(input: HTMLInputElement): WordRange {
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const start = before.search(/\S*$/);
  return { start, end: caret, text: before.slice(start) };
}

export interface ChatComposerOptions {
  completions: CompletionIndex;
  /** Resolves with an error to show, or null once Twitch accepted the message. */
  send: (text: string) => Promise<string | null>;
  onError: (message: string) => void;
}

/** The message input, with emote and @mention completion. */
export class ChatComposer {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list = el('ul', { className: 'completions', attributes: { role: 'listbox' } });
  private suggestions: Completion[] = [];
  private active = 0;
  private suggestedFor: WordRange | undefined;
  private tabCycle: TabCycle | undefined;
  private lastSent = '';
  private sending = false;

  constructor(private readonly options: ChatComposerOptions) {
    this.input = el('input', {
      className: 'composer-input',
      attributes: {
        type: 'text',
        maxlength: String(MAX_MESSAGE_LENGTH),
        placeholder: l10n.t('Send a message'),
        'aria-label': l10n.t('Chat message'),
        autocomplete: 'off',
      },
    });
    this.list.hidden = true;
    this.element = el('div', { className: 'composer' }, [this.list, this.input]);
    this.input.addEventListener('input', () => {
      this.tabCycle = undefined;
      this.updateSuggestions();
    });
    this.input.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.input.addEventListener('blur', () => this.hideSuggestions());
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.list.hidden && this.handleSuggestionKey(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.cycleCompletion(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void this.submit();
    } else if (event.key === 'ArrowUp' && !this.input.value && this.lastSent) {
      event.preventDefault();
      this.input.value = this.lastSent;
    }
  }

  private handleSuggestionKey(key: string): boolean {
    switch (key) {
      case 'ArrowDown':
        this.highlight(this.active + 1);
        return true;
      case 'ArrowUp':
        this.highlight(this.active - 1);
        return true;
      case 'Enter':
      case 'Tab':
        this.accept(this.suggestions[this.active]);
        return true;
      case 'Escape':
        this.hideSuggestions();
        return true;
      default:
        return false;
    }
  }

  private updateSuggestions(): void {
    const word = wordBeforeCaret(this.input);
    const query = word.text.slice(1);
    const completions = this.options.completions;
    let suggestions: Completion[] = [];
    if (word.text.startsWith(':') && query.length >= MIN_EMOTE_QUERY) {
      suggestions = completions.emotesMatching(query, MAX_SUGGESTIONS);
    } else if (word.text.startsWith('@') && query.length >= MIN_CHATTER_QUERY) {
      suggestions = completions.chattersMatching(query, MAX_SUGGESTIONS);
    }
    this.suggestions = suggestions;
    this.suggestedFor = word;
    this.list.replaceChildren(
      ...suggestions.map((suggestion) => this.renderSuggestion(suggestion)),
    );
    this.list.hidden = suggestions.length === 0;
    // The panel can be short; the list opens upwards and must fit above the input.
    this.list.style.maxHeight = `${Math.max(MIN_LIST_HEIGHT_PX, this.element.offsetTop - 4)}px`;
    this.highlight(0);
  }

  private renderSuggestion(completion: Completion): HTMLLIElement {
    const item = el('li', { className: 'completion', attributes: { role: 'option' } }, [
      completion.emote
        ? el('img', {
            className: 'completion-emote',
            attributes: { src: completion.emote.url1x, alt: '', loading: 'lazy' },
          })
        : null,
      el('span', { className: 'completion-text', text: completion.text }),
    ]);
    // mousedown, not click: the input must keep focus.
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.accept(completion);
    });
    return item;
  }

  private highlight(index: number): void {
    const count = this.suggestions.length;
    this.active = count ? (index + count) % count : 0;
    Array.from(this.list.children).forEach((item, itemIndex) => {
      item.classList.toggle('active', itemIndex === this.active);
      item.setAttribute('aria-selected', String(itemIndex === this.active));
    });
    this.list.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  private hideSuggestions(): void {
    this.list.hidden = true;
    this.suggestions = [];
  }

  private accept(completion: Completion | undefined): void {
    const word = this.suggestedFor;
    if (completion && word) {
      this.replaceRange(word.start, word.end, completion.text);
    }
    this.hideSuggestions();
  }

  /** Tab completes the word before the caret; pressing it again cycles through the matches. */
  private cycleCompletion(step: number): void {
    if (!this.tabCycle) {
      const word = wordBeforeCaret(this.input);
      const prefix = word.text.replace(/^[@:]/, '');
      const completions = prefix
        ? this.options.completions.completionsFor(prefix, MAX_TAB_COMPLETIONS)
        : [];
      if (completions.length === 0) {
        return;
      }
      this.tabCycle = { completions, index: step > 0 ? -1 : 0, start: word.start, end: word.end };
    }
    const cycle = this.tabCycle;
    cycle.index = (cycle.index + step + cycle.completions.length) % cycle.completions.length;
    const completion = cycle.completions[cycle.index];
    if (completion) {
      cycle.end = this.replaceRange(cycle.start, cycle.end, completion.text);
    }
  }

  /** Replaces input text and returns where the inserted text (plus a space) ends. */
  private replaceRange(start: number, end: number, text: string): number {
    const value = this.input.value;
    const inserted = `${text} `;
    this.input.value = value.slice(0, start) + inserted + value.slice(end).replace(/^ /, '');
    const caret = start + inserted.length;
    this.input.setSelectionRange(caret, caret);
    return caret;
  }

  private async submit(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.sending) {
      return;
    }
    this.sending = true;
    this.input.readOnly = true;
    const error = await this.options.send(text);
    this.sending = false;
    this.input.readOnly = false;
    if (error) {
      this.options.onError(error);
      return;
    }
    this.lastSent = text;
    this.input.value = '';
    this.tabCycle = undefined;
    this.hideSuggestions();
  }
}
