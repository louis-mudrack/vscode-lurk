import * as vscode from 'vscode';
import type { Logger } from './host/logger';
import { ChannelSession } from './host/session/channelSession';
import { PlayerPreferenceStore } from './host/session/playerPreferences';
import { RecentChannels } from './host/session/recentChannels';
import { lookupChannel } from './host/twitch/channels';
import { resolveLivePlaylistUrl } from './host/twitch/playback';
import type { RaidTarget } from './host/twitch/raidEvents';
import { RaidWatcher } from './host/twitch/raidWatcher';
import { ChatViewProvider } from './host/views/chatViewProvider';
import { pickChannel } from './host/views/channelQuickPick';
import { PlayerViewProvider } from './host/views/playerViewProvider';
import { parseChannelInput } from './shared/channelInput';
import type { ChannelInfo } from './shared/protocol';

const HAS_CHANNEL_CONTEXT = 'twitchPlayer.hasChannel';

function createLogger(channel: vscode.LogOutputChannel): Logger {
  return {
    info: (message) => channel.info(message),
    warn: (message) => channel.warn(message),
    error: (message) => channel.error(message),
  };
}

function settings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('twitchPlayer');
}

async function offerRaidFollow(
  session: ChannelSession,
  from: ChannelInfo,
  target: RaidTarget,
): Promise<void> {
  const watch = vscode.l10n.t('Watch {0}', target.displayName);
  const choice = await vscode.window.showInformationMessage(
    vscode.l10n.t('{0} is raiding {1}.', from.displayName, target.displayName),
    watch,
  );
  if (choice === watch) {
    await session.open(target.login, from.displayName);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Lurk', { log: true });
  const log = createLogger(output);
  const recent = new RecentChannels(context.globalState);
  const preferences = new PlayerPreferenceStore(context.globalState);

  const session = new ChannelSession(
    {
      lookupChannel,
      resolvePlaylistUrl: resolveLivePlaylistUrl,
      watchRaids: (channelId, onRaid) => new RaidWatcher(channelId, onRaid, log),
    },
    {
      shouldFollowRaids: () => settings().get<boolean>('followRaids', true),
      onRaidNotFollowed: (from, target) => void offerRaidFollow(session, from, target),
      rememberChannel: (channel) => recent.remember(channel),
    },
    log,
  );

  const revealPlayer = () => vscode.commands.executeCommand(`${PlayerViewProvider.viewId}.focus`);

  const openChannel = (input: string): void => {
    const login = parseChannelInput(input);
    if (!login) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('"{0}" is not a valid Twitch channel name.', input),
      );
      return;
    }
    void revealPlayer();
    void session.open(login);
  };

  const openInBrowser = (): void => {
    const channel = session.channel;
    if (channel) {
      void vscode.env.openExternal(vscode.Uri.parse(`https://www.twitch.tv/${channel.login}`));
    }
  };

  const showChat = (): void => {
    void vscode.commands.executeCommand(`${ChatViewProvider.viewId}.focus`);
  };

  let resumeChecked = false;
  const resumeLastChannelOnce = (): void => {
    if (resumeChecked) {
      return;
    }
    resumeChecked = true;
    const last = recent.last();
    if (last && session.status.kind === 'idle' && settings().get<boolean>('resumeLastChannel')) {
      void session.open(last.login);
    }
  };

  const player = new PlayerViewProvider(
    context.extensionUri,
    session,
    recent,
    preferences,
    { openChannel, showChat, openInBrowser, onReady: resumeLastChannelOnce },
    log,
  );
  const chat = new ChatViewProvider(context.extensionUri, session, log);

  const promptForChannel = async (initial?: string): Promise<void> => {
    if (initial) {
      openChannel(initial);
      return;
    }
    const input = await pickChannel(recent.list());
    if (input) {
      openChannel(input);
    }
  };

  context.subscriptions.push(
    output,
    session,
    player,
    chat,
    vscode.window.registerWebviewViewProvider(PlayerViewProvider.viewId, player, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('twitchPlayer.openChannel', (channel?: string) =>
      promptForChannel(typeof channel === 'string' ? channel : undefined),
    ),
    vscode.commands.registerCommand('twitchPlayer.stop', () => session.stop()),
    vscode.commands.registerCommand('twitchPlayer.openInBrowser', openInBrowser),
    vscode.commands.registerCommand('twitchPlayer.showChat', showChat),
    vscode.commands.registerCommand('twitchPlayer.diagnostics', () => ({
      ...player.diagnostics,
      raidWatcherConnected: session.isWatchingRaids,
    })),
    session.onDidChangeStatus((status) => {
      void vscode.commands.executeCommand(
        'setContext',
        HAS_CHANNEL_CONTEXT,
        status.kind !== 'idle',
      );
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('twitchPlayer.quality')) {
        preferences.clearQualityOverride();
        player.postPreferences();
      }
    }),
  );
}

export function deactivate(): void {}
