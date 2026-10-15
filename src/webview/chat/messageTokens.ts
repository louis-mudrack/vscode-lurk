import type { ChatEmote } from '../../shared/protocol';

export interface EmoteImage {
  name: string;
  url1x: string;
  url2x: string;
}

export type MessageToken =
  | { kind: 'text'; text: string }
  | { kind: 'emote'; emote: EmoteImage; overlays: EmoteImage[] }
  | { kind: 'link'; url: string }
  | { kind: 'mention'; text: string };

export interface TwitchEmoteRange {
  id: string;
  start: number;
  end: number;
}

const URL_PATTERN = /^(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;
const MENTION_PATTERN = /^@\w+/;

/** Parses the IRC `emotes` tag, e.g. `25:0-4,12-16/1902:6-10`. Positions are code points. */
export function parseTwitchEmotesTag(tag: string | undefined): TwitchEmoteRange[] {
  if (!tag) {
    return [];
  }
  const ranges: TwitchEmoteRange[] = [];
  for (const entry of tag.split('/')) {
    const [id, positions] = entry.split(':');
    if (!id || !positions) {
      continue;
    }
    for (const position of positions.split(',')) {
      const [start, end] = position.split('-').map(Number);
      if (Number.isInteger(start) && Number.isInteger(end)) {
        ranges.push({ id, start: start as number, end: end as number });
      }
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export function twitchEmoteImage(id: string, name: string, theme: 'dark' | 'light'): EmoteImage {
  const base = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/${theme}`;
  return { name, url1x: `${base}/1.0`, url2x: `${base}/2.0` };
}

export class MessageTokenizer {
  private emotes = new Map<string, ChatEmote>();

  constructor(private theme: 'dark' | 'light' = 'dark') {}

  /** Later entries win, so pass global emotes before channel emotes. */
  setThirdPartyEmotes(emotes: ChatEmote[]): void {
    this.emotes = new Map(emotes.map((emote) => [emote.name, emote]));
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.theme = theme;
  }

  tokenize(text: string, twitchEmotes: TwitchEmoteRange[]): MessageToken[] {
    const codePoints = Array.from(text);
    const tokens: MessageToken[] = [];
    let cursor = 0;
    for (const range of twitchEmotes) {
      if (range.start < cursor || range.end >= codePoints.length) {
        continue;
      }
      this.tokenizeText(codePoints.slice(cursor, range.start).join(''), tokens);
      const name = codePoints.slice(range.start, range.end + 1).join('');
      tokens.push({
        kind: 'emote',
        emote: twitchEmoteImage(range.id, name, this.theme),
        overlays: [],
      });
      cursor = range.end + 1;
    }
    this.tokenizeText(codePoints.slice(cursor).join(''), tokens);
    return tokens;
  }

  private tokenizeText(text: string, tokens: MessageToken[]): void {
    for (const part of text.split(/(\s+)/)) {
      if (!part) {
        continue;
      }
      const emote = this.emotes.get(part);
      if (emote) {
        this.pushEmote(emote, tokens);
      } else if (URL_PATTERN.test(part)) {
        tokens.push({ kind: 'link', url: /^https?:\/\//i.test(part) ? part : `https://${part}` });
      } else if (MENTION_PATTERN.test(part)) {
        tokens.push({ kind: 'mention', text: part });
      } else {
        this.pushText(part, tokens);
      }
    }
  }

  private pushEmote(emote: ChatEmote, tokens: MessageToken[]): void {
    const image: EmoteImage = { name: emote.name, url1x: emote.url1x, url2x: emote.url2x };
    const previous = tokens[tokens.length - 1];
    const beforeSpace = tokens[tokens.length - 2];
    const base =
      previous?.kind === 'emote'
        ? previous
        : previous?.kind === 'text' && !previous.text.trim() && beforeSpace?.kind === 'emote'
          ? beforeSpace
          : undefined;
    if (emote.zeroWidth && base) {
      if (previous !== base) {
        tokens.pop();
      }
      base.overlays.push(image);
      return;
    }
    tokens.push({ kind: 'emote', emote: image, overlays: [] });
  }

  private pushText(text: string, tokens: MessageToken[]): void {
    const previous = tokens[tokens.length - 1];
    if (previous?.kind === 'text') {
      previous.text += text;
    } else {
      tokens.push({ kind: 'text', text });
    }
  }
}
