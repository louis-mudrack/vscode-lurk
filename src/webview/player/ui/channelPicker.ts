import * as l10n from '@vscode/l10n';
import { parseChannelInput } from '../../../shared/channelInput';
import type { RecentChannel } from '../../../shared/protocol';
import { el, icon } from '../../common/dom';
import { ICONS } from '../../common/icons';
import { SuggestionDropdown, type ChannelSearch } from './suggestionDropdown';

export interface ChannelPickerOptions {
  recent: RecentChannel[];
  search: ChannelSearch;
  onOpen(login: string): void;
  onRemove(login: string): void;
}

function avatar(url: string): HTMLImageElement {
  return el('img', { className: 'avatar', attributes: { src: url, alt: '', loading: 'lazy' } });
}

function recentItem(channel: RecentChannel, options: ChannelPickerOptions): HTMLLIElement {
  const open = el(
    'button',
    { className: 'recent-open', title: l10n.t('Watch {0}', channel.displayName) },
    [
      avatar(channel.profileImageUrl),
      el('span', { className: 'recent-name', text: channel.displayName }),
    ],
  );
  open.addEventListener('click', () => options.onOpen(channel.login));
  const remove = el(
    'button',
    {
      className: 'icon-button recent-remove',
      title: l10n.t('Remove from recent channels'),
      attributes: { 'aria-label': l10n.t('Remove {0} from recent channels', channel.displayName) },
    },
    [icon(ICONS.close)],
  );
  remove.addEventListener('click', () => options.onRemove(channel.login));
  return el('li', { className: 'recent-item' }, [open, remove]);
}

/** Channel name input plus the list of recently watched channels. */
export function createChannelPicker(options: ChannelPickerOptions): HTMLElement {
  const input = el('input', {
    className: 'channel-input',
    attributes: {
      type: 'text',
      placeholder: l10n.t('Channel name or twitch.tv link'),
      'aria-label': l10n.t('Twitch channel'),
      spellcheck: 'false',
      autocomplete: 'off',
    },
  });
  const error = el('div', { className: 'picker-error', attributes: { role: 'alert' } });
  const suggestions = new SuggestionDropdown(input, options.search, (login) =>
    options.onOpen(login),
  );
  const form = el('form', { className: 'channel-form' }, [
    el('div', { className: 'channel-field' }, [input, suggestions.element]),
    el('button', {
      className: 'primary-button',
      text: l10n.t('Watch'),
      attributes: { type: 'submit' },
    }),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const login = parseChannelInput(input.value);
    if (login) {
      suggestions.close();
      options.onOpen(login);
    } else {
      error.textContent = l10n.t(
        'Enter a channel name like "{0}" or a twitch.tv link.',
        'papaplatte',
      );
    }
  });
  input.addEventListener('input', () => {
    error.textContent = '';
  });

  const recent = options.recent.length
    ? [
        el('div', { className: 'section-label', text: l10n.t('Recent') }),
        el(
          'ul',
          { className: 'recent-list' },
          options.recent.map((channel) => recentItem(channel, options)),
        ),
      ]
    : [];
  return el('div', { className: 'channel-picker' }, [form, error, ...recent]);
}
