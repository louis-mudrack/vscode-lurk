const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;
const TWITCH_HOSTS = new Set(['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'go.twitch.tv']);

function loginFromUrl(input: string): string | undefined {
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (!TWITCH_HOSTS.has(url.hostname.toLowerCase())) {
      return undefined;
    }
    const [first, second] = url.pathname.split('/').filter(Boolean);
    return first === 'popout' ? second : first;
  } catch {
    return undefined;
  }
}

/** Accepts a login, `@login` or any twitch.tv channel URL and returns the normalized login. */
export function parseChannelInput(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  const looksLikeUrl = trimmed.includes('/') || trimmed.toLowerCase().includes('twitch.tv');
  const candidate = (
    looksLikeUrl ? loginFromUrl(trimmed) : trimmed.replace(/^@/, '')
  )?.toLowerCase();
  return candidate && LOGIN_PATTERN.test(candidate) ? candidate : undefined;
}
