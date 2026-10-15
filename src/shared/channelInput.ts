const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;
const VIDEO_ID_PATTERN = /^\d{1,20}$/;
const TIMESTAMP_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;
const TWITCH_HOSTS = new Set(['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'go.twitch.tv']);

export type WatchInput =
  { type: 'channel'; login: string } | { type: 'video'; id: string; startAt?: number };

function normalizeLogin(candidate: string | undefined): string | undefined {
  const login = candidate?.toLowerCase();
  return login && LOGIN_PATTERN.test(login) ? login : undefined;
}

/** Reads twitch.tv's `t` parameter, e.g. `1h2m3s` or `95s`, as seconds. */
export function parseTimestamp(value: string | null): number | undefined {
  const match = value ? TIMESTAMP_PATTERN.exec(value) : null;
  if (!match || !value) {
    return undefined;
  }
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function fromUrl(input: string): WatchInput | undefined {
  let url: URL;
  try {
    url = new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    return undefined;
  }
  if (!TWITCH_HOSTS.has(url.hostname.toLowerCase())) {
    return undefined;
  }
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (first === 'videos') {
    if (!second || !VIDEO_ID_PATTERN.test(second)) {
      return undefined;
    }
    const startAt = parseTimestamp(url.searchParams.get('t'));
    return { type: 'video', id: second, ...(startAt ? { startAt } : {}) };
  }
  const login = normalizeLogin(first === 'popout' ? second : first);
  return login ? { type: 'channel', login } : undefined;
}

/** Accepts a login, `@login`, a twitch.tv channel URL or a twitch.tv/videos URL. */
export function parseWatchInput(input: string): WatchInput | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes('/') || trimmed.toLowerCase().includes('twitch.tv')) {
    return fromUrl(trimmed);
  }
  const login = normalizeLogin(trimmed.replace(/^@/, ''));
  return login ? { type: 'channel', login } : undefined;
}

/** The channel login from {@link parseWatchInput}, or undefined for videos and invalid input. */
export function parseChannelInput(input: string): string | undefined {
  const parsed = parseWatchInput(input);
  return parsed?.type === 'channel' ? parsed.login : undefined;
}
