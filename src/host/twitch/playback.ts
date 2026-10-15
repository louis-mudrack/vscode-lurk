import { randomInt } from 'node:crypto';
import { fetchWithTimeout, HttpError } from '../net/fetchWithTimeout';
import { gqlQuery } from './gqlClient';

interface AccessToken {
  value: string;
  signature: string;
}

const PLAYER_PARAMS =
  'params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }';

const LIVE_TOKEN_QUERY = `query PlaybackAccessToken($login: String!) {
  streamPlaybackAccessToken(channelName: $login, ${PLAYER_PARAMS}) { value signature }
}`;

const VIDEO_TOKEN_QUERY = `query VideoPlaybackAccessToken($id: ID!) {
  videoPlaybackAccessToken(id: $id, ${PLAYER_PARAMS}) { value signature }
}`;

const USHER = 'https://usher.ttvnw.net';
const HTTP_FORBIDDEN = 403;

export class StreamUnavailableError extends Error {}

export type VideoPlaylist = { kind: 'playable'; url: string } | { kind: 'subscribersOnly' };

function playlistParams(token: AccessToken): URLSearchParams {
  return new URLSearchParams({
    sig: token.signature,
    token: token.value,
    allow_source: 'true',
    allow_audio_only: 'true',
    playlist_include_framerate: 'true',
    player_backend: 'mediaplayer',
    supported_codecs: 'h264',
    p: String(randomInt(1_000_000)),
  });
}

/** Resolves the HLS master playlist URL of a live channel. */
export async function resolveLivePlaylistUrl(login: string): Promise<string> {
  const { streamPlaybackAccessToken: token } = await gqlQuery<{
    streamPlaybackAccessToken: AccessToken | null;
  }>(LIVE_TOKEN_QUERY, { login });
  if (!token) {
    throw new StreamUnavailableError(`No playback token for ${login}`);
  }
  const params = playlistParams(token);
  params.set('fast_bread', 'true');
  return `${USHER}/api/channel/hls/${encodeURIComponent(login)}.m3u8?${params.toString()}`;
}

/**
 * Resolves the HLS master playlist URL of a video. Twitch answers subscriber-only
 * videos with 403, so the playlist is requested once here to tell them apart.
 */
export async function resolveVideoPlaylist(id: string): Promise<VideoPlaylist> {
  const { videoPlaybackAccessToken: token } = await gqlQuery<{
    videoPlaybackAccessToken: AccessToken | null;
  }>(VIDEO_TOKEN_QUERY, { id });
  if (!token) {
    throw new StreamUnavailableError(`No playback token for video ${id}`);
  }
  const url = `${USHER}/vod/${encodeURIComponent(id)}.m3u8?${playlistParams(token).toString()}`;
  const response = await fetchWithTimeout(url);
  await response.body?.cancel();
  if (response.status === HTTP_FORBIDDEN) {
    return { kind: 'subscribersOnly' };
  }
  if (!response.ok) {
    throw new HttpError(response.status, `${response.status} for the playlist of video ${id}`);
  }
  return { kind: 'playable', url };
}
