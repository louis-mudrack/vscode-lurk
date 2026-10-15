import type { ChatEmote } from '../../shared/protocol';
import { fetchJson, HttpError } from '../net/fetchWithTimeout';

const SEVEN_TV_API = 'https://7tv.io/v3';
/** ActiveEmote flag: this channel uses the emote as zero-width overlay. */
const ACTIVE_FLAG_ZERO_WIDTH = 1 << 0;
/** Emote data flag: the emote was published as zero-width. */
const DATA_FLAG_ZERO_WIDTH = 1 << 8;

interface SevenTvFile {
  name: string;
  format: string;
}

export interface SevenTvActiveEmote {
  name: string;
  flags?: number;
  data?: {
    flags?: number;
    host?: { url: string; files?: SevenTvFile[] };
  } | null;
}

interface SevenTvEmoteSet {
  emotes?: SevenTvActiveEmote[] | null;
}

interface SevenTvUserConnection {
  emote_set?: SevenTvEmoteSet | null;
}

function pickFile(files: SevenTvFile[], scale: '1x' | '2x'): string | undefined {
  const sameScale = files.filter((file) => file.name.startsWith(scale));
  return (
    sameScale.find((file) => file.format === 'WEBP')?.name ??
    sameScale.find((file) => file.format === 'AVIF')?.name ??
    sameScale[0]?.name
  );
}

export function toChatEmote(emote: SevenTvActiveEmote): ChatEmote | undefined {
  const host = emote.data?.host;
  if (!host?.url || !emote.name) {
    return undefined;
  }
  const baseUrl = host.url.startsWith('//') ? `https:${host.url}` : host.url;
  const files = host.files ?? [];
  const small = pickFile(files, '1x') ?? '1x.webp';
  const large = pickFile(files, '2x') ?? '2x.webp';
  const zeroWidth =
    ((emote.flags ?? 0) & ACTIVE_FLAG_ZERO_WIDTH) !== 0 ||
    ((emote.data?.flags ?? 0) & DATA_FLAG_ZERO_WIDTH) !== 0;
  return {
    name: emote.name,
    url1x: `${baseUrl}/${small}`,
    url2x: `${baseUrl}/${large}`,
    zeroWidth,
  };
}

function mapEmoteSet(set: SevenTvEmoteSet | null | undefined): ChatEmote[] {
  return (set?.emotes ?? []).flatMap((emote) => toChatEmote(emote) ?? []);
}

let globalEmotesCache: Promise<ChatEmote[]> | undefined;

export function fetchSevenTvGlobalEmotes(): Promise<ChatEmote[]> {
  globalEmotesCache ??= fetchJson<SevenTvEmoteSet>(`${SEVEN_TV_API}/emote-sets/global`)
    .then(mapEmoteSet)
    .catch((error: unknown) => {
      globalEmotesCache = undefined;
      throw error;
    });
  return globalEmotesCache;
}

/** Channel emotes; an empty list when the streamer has no 7TV account. */
export async function fetchSevenTvChannelEmotes(twitchUserId: string): Promise<ChatEmote[]> {
  try {
    const user = await fetchJson<SevenTvUserConnection>(
      `${SEVEN_TV_API}/users/twitch/${encodeURIComponent(twitchUserId)}`,
    );
    return mapEmoteSet(user.emote_set);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return [];
    }
    throw error;
  }
}
