import * as vscode from 'vscode';
import type {
  ChannelInfo,
  ChatEmote,
  ChatToHostMessage,
  HostToChatMessage,
} from '../../shared/protocol';
import { fetchSevenTvChannelEmotes, fetchSevenTvGlobalEmotes } from '../emotes/sevenTv';
import type { Logger } from '../logger';
import type { ChannelSession } from '../session/channelSession';
import { fetchChatBadges } from '../twitch/badges';
import { localResourceRoots, renderWebviewPage } from './webviewPage';

const DEFAULT_MAX_MESSAGES = 200;

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'twitchPlayer.chat';

  private view: vscode.WebviewView | undefined;
  private shownChannelId: string | null = null;
  private loadSequence = 0;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly session: ChannelSession,
    private readonly log: Logger,
  ) {
    this.disposables.push(
      session.onDidChangeStatus(() => void this.syncChannel()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('twitchPlayer.chat')) {
          this.postSettings();
        }
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.shownChannelId = null;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: localResourceRoots(this.extensionUri),
    };
    view.webview.html = renderWebviewPage({
      webview: view.webview,
      extensionUri: this.extensionUri,
      title: 'Lurk Chat',
      scriptPath: 'dist/chat.js',
      stylesheetPath: 'media/chat.css',
      connectSources: ['wss://irc-ws.chat.twitch.tv'],
      allowWasm: false,
    });
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: ChatToHostMessage) => {
        if (message.type === 'ready') {
          this.postSettings();
          this.shownChannelId = null;
          void this.syncChannel();
        }
      }),
      view.onDidDispose(() => {
        this.view = undefined;
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  /** Follows the session: the chat keeps the old room while a new channel is still loading. */
  private async syncChannel(): Promise<void> {
    if (!this.view) {
      return;
    }
    const status = this.session.status;
    const channel = this.session.channel;
    if (!channel) {
      if (status.kind === 'idle' && this.shownChannelId !== null) {
        this.shownChannelId = null;
        this.loadSequence++;
        this.view.description = '';
        this.post({ type: 'channel', channel: null });
      }
      return;
    }
    if (channel.id === this.shownChannelId) {
      return;
    }
    this.shownChannelId = channel.id;
    this.view.description = channel.displayName;
    const sequence = ++this.loadSequence;
    const [emotes, badges] = await Promise.all([
      this.loadEmotes(channel),
      fetchChatBadges(channel.id).catch((error: unknown) => {
        this.log.warn(`Loading chat badges failed: ${String(error)}`);
        return [];
      }),
    ]);
    if (sequence !== this.loadSequence) {
      return;
    }
    this.post({
      type: 'channel',
      channel: {
        id: channel.id,
        login: channel.login,
        displayName: channel.displayName,
        emotes,
        badges,
      },
    });
  }

  /** Global emotes first so channel emotes with the same name win. */
  private async loadEmotes(channel: ChannelInfo): Promise<ChatEmote[]> {
    const [global, own] = await Promise.allSettled([
      fetchSevenTvGlobalEmotes(),
      fetchSevenTvChannelEmotes(channel.id),
    ]);
    for (const result of [global, own]) {
      if (result.status === 'rejected') {
        this.log.warn(`Loading 7TV emotes failed: ${String(result.reason)}`);
        this.post({ type: 'notice', text: vscode.l10n.t('Some 7TV emotes could not be loaded.') });
      }
    }
    return [
      ...(global.status === 'fulfilled' ? global.value : []),
      ...(own.status === 'fulfilled' ? own.value : []),
    ];
  }

  private postSettings(): void {
    const maxMessages = vscode.workspace
      .getConfiguration('twitchPlayer.chat')
      .get<number>('maxMessages', DEFAULT_MAX_MESSAGES);
    this.post({ type: 'settings', maxMessages });
  }

  private post(message: HostToChatMessage): void {
    void this.view?.webview.postMessage(message);
  }
}
