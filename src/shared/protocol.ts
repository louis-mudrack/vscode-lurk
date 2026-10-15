/**
 * Message contracts between the extension host and the two webviews.
 * Both sides import these types so a protocol change fails the typecheck on both ends.
 */

export interface ChannelInfo {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

export interface StreamInfo {
  title: string;
  game: string | null;
  viewers: number;
  startedAt: string;
}

export interface PlaybackSource {
  /** Increments whenever the player must (re)load, even if the URL repeats. */
  id: number;
  url: string;
}

/** The webview turns these into localized messages. */
export type PlayerErrorReason = 'notFound' | 'unreachable' | 'playbackFailing';

export type PlayerStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; login: string }
  | {
      kind: 'live';
      channel: ChannelInfo;
      stream: StreamInfo;
      playback: PlaybackSource;
      raidedFrom?: string;
    }
  | { kind: 'offline'; channel: ChannelInfo; raidedFrom?: string }
  | { kind: 'error'; login: string; reason: PlayerErrorReason };

export const QUALITY_OPTIONS = ['auto', '1080p', '720p', '480p', '360p', '160p'] as const;
export type QualityPreference = (typeof QUALITY_OPTIONS)[number];

export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  quality: QualityPreference;
}

export interface RecentChannel {
  login: string;
  displayName: string;
  profileImageUrl: string;
}

export interface ChannelSuggestion {
  login: string;
  displayName: string;
  profileImageUrl: string;
  isLive: boolean;
  game: string | null;
  viewers: number | null;
}

export interface PlaybackDiagnostics {
  hlsLevel: string | null;
  videoTime: number;
  videoPaused: boolean;
  bufferedAhead: number;
  readyState: number;
  latency: number | null;
  droppedFrames: number;
  audioMuted: boolean;
  /** Bytes Chromium's own decoder consumed from the transcoded FLAC track. */
  audioDecodedBytes: number | null;
  audioDecodeFailures: number;
  lastError: string | null;
}

export type HostToPlayerMessage =
  | { type: 'status'; status: PlayerStatus; recent: RecentChannel[] }
  | { type: 'preferences'; preferences: PlayerPreferences }
  | { type: 'fetchResult'; requestId: number; result: HostFetchResult }
  | { type: 'channelSuggestions'; requestId: number; suggestions: ChannelSuggestion[] };

export type PlayerToHostMessage =
  | { type: 'ready' }
  | { type: 'openChannel'; input: string }
  | { type: 'stop' }
  | { type: 'retry' }
  | { type: 'removeRecent'; login: string }
  | { type: 'fetch'; requestId: number; url: string; responseType: 'text' | 'arraybuffer' }
  | { type: 'searchChannels'; requestId: number; query: string }
  | { type: 'playbackFailed'; reason: string }
  | { type: 'savePreferences'; preferences: Partial<PlayerPreferences> }
  | { type: 'showChat' }
  | { type: 'openInBrowser' }
  | { type: 'diagnostics'; diagnostics: PlaybackDiagnostics };

export type HostFetchResult =
  | { ok: true; url: string; status: number; text: string }
  | { ok: true; url: string; status: number; bytes: Uint8Array }
  | { ok: false; status: number; message: string };

export interface ChatEmote {
  name: string;
  url1x: string;
  url2x: string;
  zeroWidth: boolean;
}

export interface ChatBadge {
  setId: string;
  version: string;
  title: string;
  url1x: string;
  url2x: string;
}

export interface ChatChannel {
  id: string;
  login: string;
  displayName: string;
  emotes: ChatEmote[];
  badges: ChatBadge[];
}

export type HostToChatMessage =
  | { type: 'channel'; channel: ChatChannel | null }
  | { type: 'settings'; maxMessages: number }
  | { type: 'notice'; text: string };

export type ChatToHostMessage = { type: 'ready' };
