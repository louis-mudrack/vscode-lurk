import type * as vscode from 'vscode';
import type { ChannelInfo, RecentChannel } from '../../shared/protocol';

const STORAGE_KEY = 'twitchPlayer.recentChannels';
const MAX_RECENT_CHANNELS = 6;

export class RecentChannels {
  constructor(private readonly storage: vscode.Memento) {}

  list(): RecentChannel[] {
    return this.storage.get<RecentChannel[]>(STORAGE_KEY, []);
  }

  last(): RecentChannel | undefined {
    return this.list()[0];
  }

  async remember(channel: ChannelInfo): Promise<void> {
    const entry: RecentChannel = {
      login: channel.login,
      displayName: channel.displayName,
      profileImageUrl: channel.profileImageUrl,
    };
    const others = this.list().filter((recent) => recent.login !== channel.login);
    await this.storage.update(STORAGE_KEY, [entry, ...others].slice(0, MAX_RECENT_CHANNELS));
  }

  async forget(login: string): Promise<void> {
    await this.storage.update(
      STORAGE_KEY,
      this.list().filter((recent) => recent.login !== login),
    );
  }
}
