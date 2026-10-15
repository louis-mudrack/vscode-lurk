import type { EmoteImage } from './messageTokens';

const MAX_CHATTERS = 500;

export type CompletionKind = 'emote' | 'chatter';

export interface Completion {
  kind: CompletionKind;
  /** What replaces the typed word. */
  text: string;
  emote?: EmoteImage;
}

function rank(name: string, query: string, lowerQuery: string): number {
  if (name.startsWith(query)) {
    return 0;
  }
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith(lowerQuery)) {
    return 1;
  }
  return lowerName.includes(lowerQuery) ? 2 : -1;
}

/** Ranks names like Chatterino: exact-case prefix, then any-case prefix, then substring; shorter first. */
function matching<T>(items: Iterable<T>, nameOf: (item: T) => string, query: string): T[] {
  const lowerQuery = query.toLowerCase();
  const ranked: { item: T; rank: number; name: string }[] = [];
  for (const item of items) {
    const name = nameOf(item);
    const itemRank = rank(name, query, lowerQuery);
    if (itemRank >= 0) {
      ranked.push({ item, rank: itemRank, name });
    }
  }
  return ranked
    .sort(
      (a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name),
    )
    .map((entry) => entry.item);
}

/** Emote names (7TV and the user's Twitch emotes) and recent chatters to complete in the input. */
export class CompletionIndex {
  private emotes = new Map<string, EmoteImage>();
  private readonly chatters = new Map<string, string>();

  /** Later lists win on equal names, matching how messages render them. */
  setEmotes(...lists: EmoteImage[][]): void {
    this.emotes = new Map(lists.flat().map((emote) => [emote.name, emote]));
  }

  noteChatter(displayName: string): void {
    const key = displayName.toLowerCase();
    this.chatters.delete(key);
    this.chatters.set(key, displayName);
    if (this.chatters.size > MAX_CHATTERS) {
      const oldest = this.chatters.keys().next().value;
      if (oldest !== undefined) {
        this.chatters.delete(oldest);
      }
    }
  }

  clearChatters(): void {
    this.chatters.clear();
  }

  emotesMatching(query: string, limit: number): Completion[] {
    return matching(this.emotes.values(), (emote) => emote.name, query)
      .slice(0, limit)
      .map((emote) => ({ kind: 'emote', text: emote.name, emote }));
  }

  chattersMatching(query: string, limit: number): Completion[] {
    return matching(this.chatters.values(), (name) => name, query)
      .slice(0, limit)
      .map((name) => ({ kind: 'chatter', text: `@${name}` }));
  }

  /** What Tab cycles through for a bare word: emotes first, then chatters. */
  completionsFor(prefix: string, limit: number): Completion[] {
    const startsWith = (completion: Completion) =>
      completion.text.replace(/^@/, '').toLowerCase().startsWith(prefix.toLowerCase());
    return [
      ...this.emotesMatching(prefix, limit).filter(startsWith),
      ...this.chattersMatching(prefix, limit).filter(startsWith),
    ].slice(0, limit);
  }
}
