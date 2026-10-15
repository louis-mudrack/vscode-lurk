/**
 * Hosts that serve Twitch HLS playlists and segments: live video on Twitch's
 * own CDNs, past broadcasts on CloudFront distributions with random names.
 */
const STREAM_HOST_SUFFIXES = ['.ttvnw.net', '.live-video.net', '.cloudfront.net'];

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
