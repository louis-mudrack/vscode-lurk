import { parseChannelInput } from '../../../shared/channelInput';
import type { RecentChannel } from '../../../shared/protocol';
import { el, icon } from '../../common/dom';
import { ICONS } from '../../common/icons';

export interface ChannelPickerOptions {
  recent: RecentChannel[];
  onOpen(login: string): void;
  onRemove(login: string): void;
}

function avatar(url: string): HTMLImageElement {
  return el('img', { className: 'avatar', attributes: { src: url, alt: '', loading: 'lazy' } });
}

function recentItem(channel: RecentChannel, options: ChannelPickerOptions): HTMLLIElement {
  const open = el('button', { className: 'recent-open', title: `Watch ${channel.displayName}` }, [
    avatar(channel.profileImageUrl),
    el('span', { className: 'recent-name', text: channel.displayName }),
  ]);
  open.addEventListener('click', () => options.onOpen(channel.login));
  const remove = el(
    'button',
    {
      className: 'icon-button recent-remove',
      title: 'Remove from recent channels',
      attributes: { 'aria-label': `Remove ${channel.displayName} from recent channels` },
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
      placeholder: 'Channel name or twitch.tv link',
      'aria-label': 'Twitch channel',
      spellcheck: 'false',
      autocomplete: 'off',
    },
  });
  const error = el('div', { className: 'picker-error', attributes: { role: 'alert' } });
  const form = el('form', { className: 'channel-form' }, [
    input,
    el('button', { className: 'primary-button', text: 'Watch', attributes: { type: 'submit' } }),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const login = parseChannelInput(input.value);
    if (login) {
      options.onOpen(login);
    } else {
      error.textContent = 'Enter a channel name like "papaplatte" or a twitch.tv link.';
    }
  });
  input.addEventListener('input', () => {
    error.textContent = '';
  });

  const recent = options.recent.length
    ? [
        el('div', { className: 'section-label', text: 'Recent' }),
        el(
          'ul',
          { className: 'recent-list' },
          options.recent.map((channel) => recentItem(channel, options)),
        ),
      ]
    : [];
  return el('div', { className: 'channel-picker' }, [form, error, ...recent]);
}
