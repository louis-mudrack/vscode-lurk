import * as l10n from '@vscode/l10n';
import type { ChatBadge } from '../../shared/protocol';
import { el } from '../common/dom';
import type { EmoteImage, MessageToken } from './messageTokens';

export interface ChatLine {
  id: string;
  login: string;
  displayName: string;
  color: string;
  badges: ChatBadge[];
  tokens: MessageToken[];
  isAction: boolean;
  replyTo: string | undefined;
}

function emoteImage(emote: EmoteImage, className: string): HTMLImageElement {
  return el('img', {
    className,
    title: emote.name,
    attributes: {
      src: emote.url1x,
      srcset: `${emote.url1x} 1x, ${emote.url2x} 2x`,
      alt: emote.name,
      loading: 'lazy',
    },
  });
}

function renderToken(token: MessageToken): Node {
  switch (token.kind) {
    case 'text':
      return document.createTextNode(token.text);
    case 'mention':
      return el('span', { className: 'mention', text: token.text });
    case 'link':
      return el('a', { text: token.url, attributes: { href: token.url, rel: 'noreferrer' } });
    case 'emote':
      if (token.overlays.length === 0) {
        return emoteImage(token.emote, 'emote');
      }
      return el('span', { className: 'emote-stack' }, [
        emoteImage(token.emote, 'emote'),
        ...token.overlays.map((overlay) => emoteImage(overlay, 'emote zero-width')),
      ]);
  }
}

export function renderTokens(tokens: MessageToken[]): Node[] {
  return tokens.map(renderToken);
}

export function renderChatLine(line: ChatLine): HTMLElement {
  const name = el('span', { className: 'author', text: line.displayName });
  name.style.color = line.color;
  const badges = line.badges.map((badge) =>
    el('img', {
      className: 'badge',
      title: badge.title,
      attributes: {
        src: badge.url1x,
        srcset: `${badge.url1x} 1x, ${badge.url2x} 2x`,
        alt: badge.title,
      },
    }),
  );
  const body = el('span', { className: 'message-body' }, renderTokens(line.tokens));
  if (line.isAction) {
    body.style.color = line.color;
  }
  const row = el('div', { className: `chat-line${line.isAction ? ' action' : ''}` }, [
    line.replyTo
      ? el('div', {
          className: 'reply-hint',
          text: `↪ ${l10n.t('Replying to @{0}', line.replyTo)}`,
        })
      : null,
    ...badges,
    name,
    line.isAction ? ' ' : el('span', { className: 'colon', text: ': ' }),
    body,
  ]);
  row.dataset['id'] = line.id;
  row.dataset['login'] = line.login;
  return row;
}

export function renderSystemLine(text: string, message?: HTMLElement): HTMLElement {
  return el('div', { className: 'system-line' }, [
    el('div', { className: 'system-text', text }),
    message ?? null,
  ]);
}
