import * as vscode from 'vscode';
import { parseWatchInput } from '../../shared/channelInput';
import type { ChannelSuggestion, RecentChannel } from '../../shared/protocol';
import { searchChannels } from '../twitch/channelSearch';

const SEARCH_DELAY_MS = 250;

interface ChannelItem extends vscode.QuickPickItem {
  /** What gets opened: a channel login or a video link. */
  input: string;
}

function liveDescription(suggestion: ChannelSuggestion): string {
  const parts = [vscode.l10n.t('Live')];
  if (suggestion.game) {
    parts.push(suggestion.game);
  }
  if (suggestion.viewers !== null) {
    const viewers = new Intl.NumberFormat(vscode.env.language, { notation: 'compact' }).format(
      suggestion.viewers,
    );
    parts.push(vscode.l10n.t('{0} viewers', viewers));
  }
  return parts.join(' · ');
}

function suggestionItem(suggestion: ChannelSuggestion): ChannelItem {
  return {
    label: suggestion.displayName,
    description: suggestion.isLive ? liveDescription(suggestion) : vscode.l10n.t('Offline'),
    iconPath: new vscode.ThemeIcon(suggestion.isLive ? 'broadcast' : 'account'),
    alwaysShow: true,
    input: suggestion.login,
  };
}

function typedItem(login: string): ChannelItem {
  return {
    label: vscode.l10n.t('Watch "{0}"', login),
    iconPath: new vscode.ThemeIcon('play'),
    alwaysShow: true,
    input: login,
  };
}

function videoLinkItem(link: string): ChannelItem {
  return {
    label: vscode.l10n.t('Play this video'),
    description: link,
    iconPath: new vscode.ThemeIcon('device-camera-video'),
    alwaysShow: true,
    input: link,
  };
}

function recentItem(channel: RecentChannel): ChannelItem {
  return {
    label: channel.displayName,
    description: vscode.l10n.t('Recently watched'),
    iconPath: new vscode.ThemeIcon('history'),
    input: channel.login,
  };
}

/**
 * Asks for a channel (or a video link) and suggests matching channels while
 * typing, like twitch.tv's search box. Resolves with input for `parseWatchInput`.
 */
export function pickChannel(recent: RecentChannel[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    const pick = vscode.window.createQuickPick<ChannelItem>();
    const recentItems = recent.map(recentItem);
    let searchTimer: NodeJS.Timeout | undefined;
    let searchSequence = 0;

    pick.title = vscode.l10n.t('Watch a Twitch channel');
    pick.placeholder = vscode.l10n.t('Channel name or twitch.tv link');
    pick.items = recentItems;

    const showSuggestions = (login: string, suggestions: ChannelSuggestion[]) => {
      const exact = suggestions.find((suggestion) => suggestion.login === login);
      pick.items = [
        exact ? suggestionItem(exact) : typedItem(login),
        ...suggestions.filter((suggestion) => suggestion !== exact).map(suggestionItem),
      ];
    };

    pick.onDidChangeValue((value) => {
      clearTimeout(searchTimer);
      const sequence = ++searchSequence;
      const parsed = parseWatchInput(value);
      pick.busy = false;
      if (parsed?.type === 'video') {
        pick.items = [videoLinkItem(value.trim())];
        return;
      }
      const login = parsed?.login;
      if (!value.trim() || !login) {
        pick.items = value.trim() ? [] : recentItems;
        return;
      }
      pick.items = [typedItem(login)];
      pick.busy = true;
      searchTimer = setTimeout(() => {
        void searchChannels(login)
          .catch(() => [])
          .then((suggestions) => {
            if (sequence === searchSequence) {
              pick.busy = false;
              showSuggestions(login, suggestions);
            }
          });
      }, SEARCH_DELAY_MS);
    });

    pick.onDidAccept(() => {
      const typed = parseWatchInput(pick.value) ? pick.value.trim() : undefined;
      const input = pick.selectedItems[0]?.input ?? typed;
      if (input) {
        resolve(input);
        pick.hide();
      }
    });

    pick.onDidHide(() => {
      clearTimeout(searchTimer);
      resolve(undefined);
      pick.dispose();
    });

    pick.show();
  });
}
