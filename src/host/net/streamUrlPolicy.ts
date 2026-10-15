/** CDN and playlist hosts that serve Twitch HLS playlists and segments. */
const STREAM_HOST_SUFFIXES = ['.ttvnw.net', '.live-video.net'];

/** The player webview may only make the extension host fetch Twitch stream resources. */
export function isAllowedStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      STREAM_HOST_SUFFIXES.some((suffix) => parsed.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}
