import type * as vscode from 'vscode';
import type {
  HostToPlayerMessage,
  PlaybackDiagnostics,
  PlayerToHostMessage,
} from '../../shared/protocol';
import type { Logger } from '../logger';
import { fetchStreamResource } from '../net/streamFetch';
import type { ChannelSession } from '../session/channelSession';
import type { PlayerPreferenceStore } from '../session/playerPreferences';
import type { RecentChannels } from '../session/recentChannels';
import { localResourceRoots, renderWebviewPage } from './webviewPage';

export interface PlayerViewHooks {
  openChannel(input: string): void;
  showChat(): void;
  openInBrowser(): void;
  onReady(): void;
}

export class PlayerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'twitchPlayer.player';

  private view: vscode.WebviewView | undefined;
  private lastDiagnostics: PlaybackDiagnostics | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly session: ChannelSession,
    private readonly recent: RecentChannels,
    private readonly preferences: PlayerPreferenceStore,
    private readonly hooks: PlayerViewHooks,
    private readonly log: Logger,
  ) {
    this.disposables.push(session.onDidChangeStatus(() => this.postStatus()));
  }

  get diagnostics(): PlaybackDiagnostics | undefined {
    return this.lastDiagnostics;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: localResourceRoots(this.extensionUri),
    };
    view.webview.html = renderWebviewPage({
      webview: view.webview,
      extensionUri: this.extensionUri,
      title: 'Lurk',
      scriptPath: 'dist/player.js',
      stylesheetPath: 'media/player.css',
      connectSources: ['https:'],
      allowWasm: true,
    });
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: PlayerToHostMessage) => this.handle(message)),
      view.onDidDispose(() => {
        this.view = undefined;
      }),
    );
  }

  postPreferences(): void {
    this.post({ type: 'preferences', preferences: this.preferences.current() });
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private handle(message: PlayerToHostMessage): void {
    switch (message.type) {
      case 'ready':
        this.postPreferences();
        this.postStatus();
        this.hooks.onReady();
        break;
      case 'openChannel':
        this.hooks.openChannel(message.input);
        break;
      case 'stop':
        this.session.stop();
        break;
      case 'retry':
        void this.session.retry();
        break;
      case 'removeRecent':
        void this.recent.forget(message.login).then(() => this.postStatus());
        break;
      case 'fetch':
        void fetchStreamResource(message.url, message.responseType).then((result) =>
          this.post({ type: 'fetchResult', requestId: message.requestId, result }),
        );
        break;
      case 'playbackFailed':
        void this.session.handlePlaybackFailure(message.reason);
        break;
      case 'savePreferences':
        void this.preferences.update(message.preferences);
        break;
      case 'showChat':
        this.hooks.showChat();
        break;
      case 'openInBrowser':
        this.hooks.openInBrowser();
        break;
      case 'diagnostics':
        this.lastDiagnostics = message.diagnostics;
        if (message.diagnostics.lastError) {
          this.log.warn(`Player: ${message.diagnostics.lastError}`);
        }
        break;
    }
  }

  private postStatus(): void {
    if (!this.view) {
      return;
    }
    this.view.description = this.session.channel?.displayName ?? '';
    this.post({ type: 'status', status: this.session.status, recent: this.recent.list() });
  }

  private post(message: HostToPlayerMessage): void {
    void this.view?.webview.postMessage(message);
  }
}
