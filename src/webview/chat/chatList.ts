import { el } from '../common/dom';

const FLUSH_INTERVAL_MS = 100;
const FOLLOW_THRESHOLD_PX = 40;
/** While the user reads older messages we keep extra history before pruning. */
const PAUSED_HISTORY_FACTOR = 2;

/**
 * Scrolling message list. Appends in batches (busy chats send dozens of lines
 * per second) and only sticks to the bottom while the user hasn't scrolled up.
 */
export class ChatList {
  readonly element: HTMLElement;
  private readonly scroller = el('div', {
    className: 'chat-scroller',
    attributes: { role: 'log' },
  });
  private readonly resumeButton = el('button', {
    className: 'resume-button',
    text: 'More messages below',
    attributes: { type: 'button' },
  });
  private pending: HTMLElement[] = [];
  private flushTimer: number | undefined;
  private following = true;

  constructor(private maxMessages: number) {
    this.resumeButton.hidden = true;
    this.resumeButton.addEventListener('click', () => this.scrollToBottom());
    this.scroller.addEventListener('scroll', () => this.updateFollowing(), { passive: true });
    this.element = el('div', { className: 'chat-list' }, [this.scroller, this.resumeButton]);
  }

  setMaxMessages(maxMessages: number): void {
    this.maxMessages = maxMessages;
  }

  add(line: HTMLElement): void {
    this.pending.push(line);
    if (this.pending.length > this.maxMessages) {
      this.pending.splice(0, this.pending.length - this.maxMessages);
    }
    this.flushTimer ??= window.setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  clear(): void {
    this.pending = [];
    this.scroller.replaceChildren();
    this.following = true;
    this.resumeButton.hidden = true;
  }

  removeWhere(predicate: (line: HTMLElement) => boolean): void {
    this.pending = this.pending.filter((line) => !predicate(line));
    for (const line of Array.from(this.scroller.children)) {
      if (line instanceof HTMLElement && predicate(line)) {
        line.remove();
      }
    }
  }

  private flush(): void {
    this.flushTimer = undefined;
    if (this.pending.length === 0) {
      return;
    }
    this.scroller.append(...this.pending);
    this.pending = [];
    this.prune();
    if (this.following) {
      this.scroller.scrollTop = this.scroller.scrollHeight;
    }
  }

  private prune(): void {
    const limit = this.following ? this.maxMessages : this.maxMessages * PAUSED_HISTORY_FACTOR;
    const excess = this.scroller.childElementCount - limit;
    for (let i = 0; i < excess; i++) {
      this.scroller.firstElementChild?.remove();
    }
  }

  private scrollToBottom(): void {
    this.following = true;
    this.resumeButton.hidden = true;
    this.prune();
    this.scroller.scrollTop = this.scroller.scrollHeight;
  }

  private updateFollowing(): void {
    const { scrollTop, scrollHeight, clientHeight } = this.scroller;
    this.following = scrollHeight - scrollTop - clientHeight < FOLLOW_THRESHOLD_PX;
    this.resumeButton.hidden = this.following;
  }
}
