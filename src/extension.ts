import * as vscode from 'vscode';
import { setUpTwitchAccount } from './host/auth/setUpTwitchAccount';
import { setUpFollowing } from './host/following/setUpFollowing';
import type { Logger } from './host/logger';
import { ChannelSession } from './host/session/channelSession';
import { PlayerPreferenceStore } from './host/session/playerPreferences';
import { RecentChannels } from './host/session/recentChannels';
import { VideoProgress } from './host/session/videoProgress';
import { lookupChannel } from './host/twitch/channels';
import { resolveLivePlaylistUrl, resolveVideoPlaylist } from './host/twitch/playback';
import type { RaidTarget } from './host/twitch/raidEvents';
import { RaidWatcher } from './host/twitch/raidWatcher';
import { lookupVideo } from './host/twitch/videos';
import { ChatViewProvider } from './host/views/chatViewProvider';
import { pickChannel } from './host/views/channelQuickPick';
import { PlayerViewProvider } from './host/views/playerViewProvider';
import { pickVideo, type VideoOwner } from './host/views/videoQuickPick';
import { parseChannelInput, parseWatchInput } from './shared/channelInput';
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

/** Commands get channels from the following list and logins from other callers. */
function isChannelReference(value: unknown): value is VideoOwner {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<VideoOwner>).login === 'string' &&
    typeof (value as Partial<VideoOwner>).displayName === 'string'
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Lurk', { log: true });
  const log = createLogger(output);
  const recent = new RecentChannels(context.globalState);
  const preferences = new PlayerPreferenceStore(context.globalState);
  const videoProgress = new VideoProgress(context.globalState);
  const { auth, signIn } = setUpTwitchAccount(context, log);
  setUpFollowing(context, auth, log);

  const session = new ChannelSession(
    {
      lookupChannel,
      resolvePlaylistUrl: resolveLivePlaylistUrl,
      lookupVideo,
      resolveVideoPlaylist,
      watchRaids: (channelId, onRaid) => new RaidWatcher(channelId, onRaid, log),
    },
    {
      shouldFollowRaids: () => settings().get<boolean>('followRaids', true),
      onRaidNotFollowed: (from, target) => void offerRaidFollow(session, from, target),
      rememberChannel: (channel) => recent.remember(channel),
      resumePosition: (videoId) => videoProgress.resumePosition(videoId),
    },
    log,
  );

  const revealPlayer = () => vscode.commands.executeCommand(`${PlayerViewProvider.viewId}.focus`);

  const openChannel = (input: string): void => {
    const target = parseWatchInput(input);
    if (!target) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('"{0}" is neither a Twitch channel name nor a video link.', input),
      );
      return;
    }
    void revealPlayer();
    if (target.type === 'video') {
      void session.openVideo(target.id, target.startAt);
    } else {
      void session.open(target.login);
    }
  };

  const openVideo = (id: string): void => {
    void revealPlayer();
    void session.openVideo(id);
  };

  /** Opens the given channel (from the following list) or whatever is playing. */
  const openInBrowser = (channel?: unknown): void => {
    const status = session.status;
    let url: string | undefined;
    if (isChannelReference(channel)) {
      url = `https://www.twitch.tv/${channel.login}`;
    } else if (status.kind === 'video') {
      const position = videoProgress.resumePosition(status.video.id);
      url = `https://www.twitch.tv/videos/${status.video.id}${position ? `?t=${position}s` : ''}`;
    } else if (session.channel) {
      url = `https://www.twitch.tv/${session.channel.login}`;
    }
    if (url) {
      void vscode.env.openExternal(vscode.Uri.parse(url));
    }
  };

  /** The channel to list videos of: the argument (login or tree item), the current one, or asked. */
  const videoOwner = async (owner?: unknown): Promise<VideoOwner | undefined> => {
    if (typeof owner === 'string') {
      return { login: owner, displayName: owner };
    }
    if (isChannelReference(owner)) {
      return owner;
    }
    if (session.channel) {
      return session.channel;
    }
    const login = parseChannelInput((await pickChannel(recent.list())) ?? '');
    return login ? { login, displayName: login } : undefined;
  };

  const showVideos = async (owner?: unknown): Promise<void> => {
    const resolved = await videoOwner(owner);
    const video = resolved ? await pickVideo(resolved) : undefined;
    if (video) {
      openVideo(video.id);
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
    videoProgress,
    {
      openChannel,
      openVideo,
      showVideos: () => void showVideos(),
      showChat,
      openInBrowser,
      onReady: resumeLastChannelOnce,
    },
    log,
  );
  const chat = new ChatViewProvider(context.extensionUri, session, auth, () => void signIn(), log);

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
    vscode.commands.registerCommand('twitchPlayer.watchChannel', (channel?: unknown) => {
      if (isChannelReference(channel)) {
        openChannel(channel.login);
      }
    }),
    vscode.commands.registerCommand('twitchPlayer.stop', () => session.stop()),
    vscode.commands.registerCommand('twitchPlayer.openInBrowser', openInBrowser),
    vscode.commands.registerCommand('twitchPlayer.showChat', showChat),
    vscode.commands.registerCommand('twitchPlayer.showVideos', showVideos),
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
