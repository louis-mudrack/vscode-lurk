import type {
  ChatBadge,
  ChatChannel,
  ChatToHostMessage,
  HostToChatMessage,
} from '../../shared/protocol';
import { el } from '../common/dom';
import { onHostMessage, vscodeApi } from '../common/vscodeApi';
import { ChatList } from './chatList';
import { renderChatLine, renderSystemLine, type ChatLine } from './chatRenderer';
import { TwitchIrcConnection, type ConnectionState } from './ircConnection';
import { nickFromPrefix, type IrcMessage } from './ircMessage';
import { MessageTokenizer, parseTwitchEmotesTag } from './messageTokens';
import { readableNameColor } from './nameColor';

const DEFAULT_MAX_MESSAGES = 200;
const ACTION_PREFIX = '\u0001ACTION ';
const ACTION_SUFFIX = '\u0001';
const CONNECTION_LABELS: Record<ConnectionState, string> = {
  idle: '',
  connecting: 'Connecting to chat…',
  connected: '',
  reconnecting: 'Reconnecting to chat…',
};

function isDarkTheme(): boolean {
  const classes = document.body.classList;
  return !classes.contains('vscode-light') && !classes.contains('vscode-high-contrast-light');
}

/** Read-only Twitch chat with Twitch and 7TV emotes. */
export class ChatApp {
  private readonly list = new ChatList(DEFAULT_MAX_MESSAGES);
  private readonly tokenizer = new MessageTokenizer(isDarkTheme() ? 'dark' : 'light');
  private readonly irc: TwitchIrcConnection;
  private readonly connectionBanner = el('div', { className: 'connection-banner' });
  private readonly emptyState = el('div', {
    className: 'empty-state',
    text: 'Open a channel in the Twitch panel to see its chat here.',
  });
  private readonly footer = el('div', { className: 'chat-footer' });
  private channel: ChatChannel | null = null;
  private badges = new Map<string, ChatBadge>();

  constructor(root: HTMLElement) {
    this.irc = new TwitchIrcConnection({
      onMessage: (message) => this.handleIrc(message),
      onStateChange: (state) => this.showConnectionState(state),
    });
    this.connectionBanner.hidden = true;
    root.append(this.connectionBanner, this.emptyState, this.list.element, this.footer);
    this.showChannel(null);

    new MutationObserver(() => this.tokenizer.setTheme(isDarkTheme() ? 'dark' : 'light')).observe(
      document.body,
      { attributes: true, attributeFilter: ['class'] },
    );
    onHostMessage<HostToChatMessage>((message) => this.handleHost(message));
    vscodeApi<ChatToHostMessage>().postMessage({ type: 'ready' });
  }

  private handleHost(message: HostToChatMessage): void {
    switch (message.type) {
      case 'channel':
        this.showChannel(message.channel);
        break;
      case 'settings':
        this.list.setMaxMessages(message.maxMessages);
        break;
      case 'notice':
        this.list.add(renderSystemLine(message.text));
        break;
    }
  }

  private showChannel(channel: ChatChannel | null): void {
    this.channel = channel;
    this.list.clear();
    this.emptyState.hidden = channel !== null;
    this.list.element.hidden = channel === null;
    this.footer.hidden = channel === null;
    if (!channel) {
      this.irc.join(undefined);
      return;
    }
    this.tokenizer.setThirdPartyEmotes(channel.emotes);
    this.badges = new Map(
      channel.badges.map((badge) => [`${badge.setId}/${badge.version}`, badge]),
    );
    this.footer.replaceChildren(
      el('span', { text: 'Read-only chat' }),
      el('a', {
        text: 'Chat on twitch.tv',
        attributes: { href: `https://www.twitch.tv/popout/${channel.login}/chat` },
      }),
    );
    this.list.add(renderSystemLine(`Welcome to ${channel.displayName}'s chat`));
    this.irc.join(channel.login);
  }

  private showConnectionState(state: ConnectionState): void {
    const label = CONNECTION_LABELS[state];
    this.connectionBanner.textContent = label;
    this.connectionBanner.hidden = !label;
  }

  private handleIrc(message: IrcMessage): void {
    const channel = this.channel;
    if (!channel || message.params[0] !== `#${channel.login}`) {
      return;
    }
    switch (message.command) {
      case 'PRIVMSG':
        this.list.add(renderChatLine(this.toChatLine(message)));
        break;
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
          this.list.add(renderSystemLine('Chat was cleared by a moderator.'));
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
