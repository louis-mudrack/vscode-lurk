import * as vscode from 'vscode';
import type { TwitchAuth } from '../auth/twitchAuth';
import type { Logger } from '../logger';
import { FollowingTreeProvider } from '../views/followingTreeProvider';
import { FollowingList } from './followingList';

/** The "Twitch Following" view with its refresh command. */
export function setUpFollowing(
  context: vscode.ExtensionContext,
  auth: TwitchAuth,
  log: Logger,
): void {
  const list = new FollowingList(auth, log);
  context.subscriptions.push(
    list,
    new FollowingTreeProvider(list),
    vscode.commands.registerCommand('twitchPlayer.refreshFollowing', () => list.refresh(true)),
  );
}
