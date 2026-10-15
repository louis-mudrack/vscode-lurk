import { randomInt } from 'node:crypto';
import { gqlQuery } from './gqlClient';

interface PlaybackAccessTokenResult {
  streamPlaybackAccessToken: { value: string; signature: string } | null;
}

const ACCESS_TOKEN_QUERY = `query PlaybackAccessToken($login: String!) {
  streamPlaybackAccessToken(
    channelName: $login
    params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }
  ) { value signature }
}`;

const USHER_BASE = 'https://usher.ttvnw.net/api/channel/hls';

export class StreamUnavailableError extends Error {}

/** Resolves the HLS master playlist URL of a live channel. */
export async function resolveLivePlaylistUrl(login: string): Promise<string> {
  const { streamPlaybackAccessToken: token } = await gqlQuery<PlaybackAccessTokenResult>(
    ACCESS_TOKEN_QUERY,
    { login },
  );
  if (!token) {
    throw new StreamUnavailableError(`No playback token for ${login}`);
  }
  const params = new URLSearchParams({
    sig: token.signature,
    token: token.value,
    allow_source: 'true',
    allow_audio_only: 'true',
    fast_bread: 'true',
    playlist_include_framerate: 'true',
    player_backend: 'mediaplayer',
    supported_codecs: 'h264',
    p: String(randomInt(1_000_000)),
  });
  return `${USHER_BASE}/${encodeURIComponent(login)}.m3u8?${params.toString()}`;
}
