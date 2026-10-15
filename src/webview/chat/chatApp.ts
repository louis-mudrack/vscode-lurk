import * as l10n from '@vscode/l10n';
import type {
  ChatBadge,
  ChatChannel,
  ChatEmote,
  ChatToHostMessage,
  HostToChatMessage,
} from '../../shared/protocol';
import { el } from '../common/dom';
import { onHostMessage, vscodeApi } from '../common/vscodeApi';
import { ChatComposer } from './chatComposer';
import { ChatList } from './chatList';
import { CompletionIndex } from './completion';
import { renderChatLine, renderSystemLine, type ChatLine } from './chatRenderer';
import { TwitchIrcConnection, type ConnectionState } from './ircConnection';
import { nickFromPrefix, type IrcMessage } from './ircMessage';
import { MessageTokenizer, parseTwitchEmotesTag } from './messageTokens';
import { readableNameColor } from './nameColor';

const DEFAULT_MAX_MESSAGES = 200;
const ACTION_PREFIX = '\u0001ACTION ';
const ACTION_SUFFIX = '\u0001';
function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case 'connecting':
      return l10n.t('Connecting to chat…');
    case 'reconnecting':
      return l10n.t('Reconnecting to chat…');
    default:
      return '';
  }
}

function post(message: ChatToHostMessage): void {
  vscodeApi<ChatToHostMessage>().postMessage(message);
}

function mentionPattern(login: string): RegExp {
  return new RegExp(`(?:^|[^\\w])@?${login}(?:[^\\w]|$)`, 'i');
}

function emptyStateText(reason: 'idle' | 'video'): string {
  return reason === 'video'
    ? l10n.t('Lurk cannot replay the chat of past broadcasts.')
    : l10n.t('Open a channel in the Twitch panel to see its chat here.');
}

function isDarkTheme(): boolean {
  const classes = document.body.classList;
  return !classes.contains('vscode-light') && !classes.contains('vscode-high-contrast-light');
}

/** Twitch chat with Twitch and 7TV emotes; signed-in users can write too. */
export class ChatApp {
  private readonly list = new ChatList(DEFAULT_MAX_MESSAGES);
  private readonly tokenizer = new MessageTokenizer(isDarkTheme() ? 'dark' : 'light');
  private readonly irc: TwitchIrcConnection;
  private readonly connectionBanner = el('div', { className: 'connection-banner' });
  private readonly emptyState = el('div', { className: 'empty-state' });
  private readonly footer = el('div', { className: 'chat-footer' });
  private readonly completions = new CompletionIndex();
  private readonly composer = new ChatComposer({
    completions: this.completions,
    send: (text) => this.send(text),
    onError: (message) => this.list.add(renderSystemLine(message)),
  });
  private channel: ChatChannel | null = null;
  private badges = new Map<string, ChatBadge>();
  private login: string | null = null;
  private mentionsMe: RegExp | undefined;
  private userEmotes: ChatEmote[] = [];
  private nextRequestId = 1;
  private readonly pendingSends = new Map<number, (error: string | null) => void>();

  constructor(root: HTMLElement) {
    this.irc = new TwitchIrcConnection({
      onMessage: (message) => this.handleIrc(message),
      onStateChange: (state) => this.showConnectionState(state),
    });
    this.connectionBanner.hidden = true;
    root.append(
      this.connectionBanner,
      this.emptyState,
      this.list.element,
      this.composer.element,
      this.footer,
    );
    this.showNoChannel('idle');

    new MutationObserver(() => this.tokenizer.setTheme(isDarkTheme() ? 'dark' : 'light')).observe(
      document.body,
      { attributes: true, attributeFilter: ['class'] },
    );
    onHostMessage<HostToChatMessage>((message) => this.handleHost(message));
    post({ type: 'ready' });
  }

  private handleHost(message: HostToChatMessage): void {
    switch (message.type) {
      case 'channel':
        this.showChannel(message.channel);
        break;
      case 'noChannel':
        this.showNoChannel(message.reason);
        break;
      case 'settings':
        this.list.setMaxMessages(message.maxMessages);
        break;
      case 'notice':
        this.list.add(renderSystemLine(message.text));
        break;
      case 'account':
        this.login = message.login;
        this.mentionsMe = message.login ? mentionPattern(message.login) : undefined;
        this.showFooter();
        break;
      case 'userEmotes':
        this.userEmotes = message.emotes;
        this.updateCompletions();
        break;
      case 'sendResult':
        this.pendingSends.get(message.requestId)?.(message.error);
        this.pendingSends.delete(message.requestId);
        break;
    }
  }

  private showNoChannel(reason: 'idle' | 'video'): void {
    this.channel = null;
    this.list.clear();
    this.emptyState.textContent = emptyStateText(reason);
    this.setChatVisible(false);
    this.irc.join(undefined);
  }

  private setChatVisible(visible: boolean): void {
    this.emptyState.hidden = visible;
    this.list.element.hidden = !visible;
    this.showFooter();
  }

  /** Signed in: the message input. Signed out: a hint that the chat is read-only. */
  private showFooter(): void {
    const channel = this.channel;
    this.composer.element.hidden = !channel || !this.login;
    this.footer.hidden = !channel || this.login !== null;
    if (!channel || this.login) {
      return;
    }
    const signIn = el('button', {
      className: 'link-button',
      text: l10n.t('Sign in to chat'),
      attributes: { type: 'button' },
    });
    signIn.addEventListener('click', () => post({ type: 'signIn' }));
    this.footer.replaceChildren(
      el('span', { text: l10n.t('Read-only chat') }),
      signIn,
      el('a', {
        text: l10n.t('Chat on twitch.tv'),
        attributes: { href: `https://www.twitch.tv/popout/${channel.login}/chat` },
      }),
    );
  }

  private send(text: string): Promise<string | null> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pendingSends.set(requestId, resolve);
      post({ type: 'send', requestId, text });
    });
  }

  private updateCompletions(): void {
    this.completions.setEmotes(this.userEmotes, this.channel?.emotes ?? []);
  }

  private showChannel(channel: ChatChannel): void {
    this.channel = channel;
    this.list.clear();
    this.setChatVisible(true);
    this.tokenizer.setThirdPartyEmotes(channel.emotes);
    this.completions.clearChatters();
    this.completions.noteChatter(channel.displayName);
    this.updateCompletions();
    this.badges = new Map(
      channel.badges.map((badge) => [`${badge.setId}/${badge.version}`, badge]),
    );
    this.list.add(renderSystemLine(l10n.t('Welcome to the chat of {0}', channel.displayName)));
    this.irc.join(channel.login);
  }

  private showConnectionState(state: ConnectionState): void {
    const label = connectionLabel(state);
    this.connectionBanner.textContent = label;
    this.connectionBanner.hidden = !label;
  }

  private handleIrc(message: IrcMessage): void {
    const channel = this.channel;
    if (!channel || message.params[0] !== `#${channel.login}`) {
      return;
    }
    switch (message.command) {
      case 'PRIVMSG': {
        const line = this.toChatLine(message);
        const row = renderChatLine(line);
        if (this.mentionsMe?.test(message.params[1] ?? '') && line.login !== this.login) {
          row.classList.add('mentions-me');
        }
        this.completions.noteChatter(line.displayName);
        this.list.add(row);
        break;
      }
      case 'USERNOTICE': {
        const text = message.tags['system-msg'] ?? '';
        const userMessage = message.params[1]
          ? renderChatLine(this.toChatLine(message))
          : undefined;
        if (text || userMessage) {
          this.list.add(renderSystemLine(text, userMessage));
        }
        break;
      }
      case 'CLEARCHAT': {
        const target = message.params[1];
        if (target) {
          this.list.removeWhere((line) => line.dataset['login'] === target);
        } else {
          this.list.clear();
          this.list.add(renderSystemLine(l10n.t('Chat was cleared by a moderator.')));
        }
        break;
      }
      case 'CLEARMSG': {
        const id = message.tags['target-msg-id'];
        this.list.removeWhere((line) => line.dataset['id'] === id);
        break;
      }
      case 'NOTICE':
        if (message.params[1]) {
          this.list.add(renderSystemLine(message.params[1]));
        }
        break;
    }
  }

  private toChatLine(message: IrcMessage): ChatLine {
    const { tags } = message;
    const login = tags['login'] ?? nickFromPrefix(message.prefix);
    let text = message.params[1] ?? '';
    const isAction = text.startsWith(ACTION_PREFIX) && text.endsWith(ACTION_SUFFIX);
    if (isAction) {
      text = text.slice(ACTION_PREFIX.length, -ACTION_SUFFIX.length);
    }
    return {
      id: tags['id'] ?? '',
      login,
      displayName: tags['display-name'] || login,
      color: readableNameColor(tags['color'] ?? '', login, isDarkTheme()),
      badges: this.resolveBadges(tags['badges']),
      tokens: this.tokenizer.tokenize(text, parseTwitchEmotesTag(tags['emotes'])),
      isAction,
      replyTo: tags['reply-parent-display-name'] || undefined,
    };
  }

  private resolveBadges(tag: string | undefined): ChatBadge[] {
    if (!tag) {
      return [];
    }
    return tag.split(',').flatMap((entry) => this.badges.get(entry) ?? []);
  }
}
