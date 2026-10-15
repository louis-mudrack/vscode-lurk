import * as vscode from 'vscode';
import { formatUptime } from '../../shared/timeFormat';
import { groupByLiveStatus, type FollowingGroups } from '../following/followingGroups';
import type { FollowingList, FollowingState } from '../following/followingList';
import type { FollowedChannel } from '../twitch/following';

type GroupKey = keyof FollowingGroups;

interface GroupNode {
  group: GroupKey;
  channels: FollowedChannel[];
}

/** Channel nodes are the channels themselves, so context-menu commands receive them. */
export type FollowingNode = GroupNode | FollowedChannel;

function isGroup(node: FollowingNode): node is GroupNode {
  return 'group' in node;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(vscode.env.language, { notation: 'compact' }).format(value);
}

function groupItem({ group, channels }: GroupNode): vscode.TreeItem {
  const live = group === 'live';
  const item = new vscode.TreeItem(
    live ? vscode.l10n.t('Live') : vscode.l10n.t('Offline'),
    live ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
  );
  item.id = `group:${group}`;
  item.description = String(channels.length);
  item.iconPath = live
    ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'))
    : new vscode.ThemeIcon('circle-outline');
  return item;
}

function liveTooltip(channel: FollowedChannel): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown('**');
  tooltip.appendText(channel.displayName);
  tooltip.appendMarkdown('**\n\n');
  const stream = channel.stream;
  if (stream) {
    tooltip.appendText(`${stream.title}\n\n`);
    const details = [
      stream.game,
      vscode.l10n.t('{0} viewers', stream.viewers.toLocaleString(vscode.env.language)),
      vscode.l10n.t('live for {0}', formatUptime(stream.startedAt)),
    ];
    tooltip.appendText(details.filter(Boolean).join(' · '));
  }
  return tooltip;
}

function channelItem(channel: FollowedChannel): vscode.TreeItem {
  const item = new vscode.TreeItem(channel.displayName, vscode.TreeItemCollapsibleState.None);
  item.id = `channel:${channel.id}`;
  item.iconPath = vscode.Uri.parse(channel.profileImageUrl);
  item.contextValue = channel.stream ? 'channel.live' : 'channel.offline';
  item.command = {
    command: 'twitchPlayer.watchChannel',
    title: vscode.l10n.t('Watch'),
    arguments: [channel],
  };
  const stream = channel.stream;
  if (stream) {
    item.description = [stream.game, compactNumber(stream.viewers)].filter(Boolean).join(' · ');
    item.tooltip = liveTooltip(channel);
  }
  return item;
}

function statusMessage(state: FollowingState): string | undefined {
  switch (state.kind) {
    case 'loading':
      return vscode.l10n.t('Loading the channels you follow…');
    case 'failed':
      return vscode.l10n.t('Could not reach Twitch. Check your connection and try again.');
    case 'ready':
      return state.channels.length
        ? undefined
        : vscode.l10n.t('You do not follow any channels yet.');
    case 'signedOut':
      return undefined;
  }
}

/** "Live" and "Offline" groups of the channels the signed-in user follows. */
export class FollowingTreeProvider
  implements vscode.TreeDataProvider<FollowingNode>, vscode.Disposable
{
  static readonly viewId = 'twitchPlayer.following';

  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  readonly view: vscode.TreeView<FollowingNode>;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly list: FollowingList) {
    this.view = vscode.window.createTreeView(FollowingTreeProvider.viewId, {
      treeDataProvider: this,
    });
    this.disposables.push(
      this.view,
      this.changeEmitter,
      this.view.onDidChangeVisibility(({ visible }) => list.setVisible(visible)),
      list.onDidChange((state) => this.show(state)),
    );
    list.setVisible(this.view.visible);
    this.show(list.state);
  }

  getTreeItem(node: FollowingNode): vscode.TreeItem {
    return isGroup(node) ? groupItem(node) : channelItem(node);
  }

  getChildren(node?: FollowingNode): FollowingNode[] {
    if (node) {
      return isGroup(node) ? node.channels : [];
    }
    const state = this.list.state;
    if (state.kind !== 'ready' || state.channels.length === 0) {
      return [];
    }
    const groups = groupByLiveStatus(state.channels, vscode.env.language);
    return (['live', 'offline'] as const).map((group) => ({ group, channels: groups[group] }));
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private show(state: FollowingState): void {
    this.view.message = statusMessage(state) ?? '';
    const liveCount =
      state.kind === 'ready' ? state.channels.filter((channel) => channel.stream).length : 0;
    this.view.description = liveCount ? vscode.l10n.t('{0} live', liveCount) : '';
    this.changeEmitter.fire();
  }
}
