import Hls, {
  type FragmentLoaderContext,
  type HlsConfig,
  type PlaylistLoaderContext,
} from 'hls.js';
import { createFragmentLoader, createHostLoader, type LoaderClass } from './hlsLoaders';
import type { HostBridge } from './hostBridge';
import { restoreMutedSegments, stripStartOffset } from './playlistRewrite';

/** Seconds behind live; close to twitch.tv's normal-latency mode, so chat matches the picture. */
const LIVE_SYNC_SECONDS = 6;
/** Falling further behind (e.g. after a long stall) jumps back to the live sync point. */
const MAX_LATENCY_SECONDS = 30;
/**
 * The transcoded FLAC track needs ~190 KB/s and Chromium caps an audio
 * SourceBuffer at 12 MB, so forward plus back buffer must stay well below a
 * minute. hls.js raises the forward target for low bitrates up to
 * `maxMaxBufferLength`, so videos need that cap too; live streams are
 * bounded by the live window.
 */
const LIVE_BUFFER_SECONDS = 12;
const VIDEO_BUFFER_SECONDS = 20;
const BACK_BUFFER_SECONDS = 10;

export type PlaybackMode = { kind: 'live' } | { kind: 'video'; startAt: number };

const SHARED: Partial<HlsConfig> = {
  enableWorker: false,
  lowLatencyMode: false,
  preferManagedMediaSource: false,
  capLevelToPlayerSize: true,
  backBufferLength: BACK_BUFFER_SECONDS,
};

function liveConfig(host: HostBridge): Partial<HlsConfig> {
  return {
    ...SHARED,
    maxBufferLength: LIVE_BUFFER_SECONDS,
    liveSyncDuration: LIVE_SYNC_SECONDS,
    liveMaxLatencyDuration: MAX_LATENCY_SECONDS,
    pLoader: createHostLoader<PlaylistLoaderContext>(host, stripStartOffset),
    fLoader: createFragmentLoader<FragmentLoaderContext>(
      // hls.js types its default loader for the base context; it serves fragments too.
      Hls.DefaultConfig.loader as LoaderClass<FragmentLoaderContext>,
      createHostLoader<FragmentLoaderContext>(host),
    ),
  };
}

/** The video CDN only answers twitch.tv origins, so every request goes through the host. */
function videoConfig(host: HostBridge, startAt: number): Partial<HlsConfig> {
  return {
    ...SHARED,
    maxBufferLength: VIDEO_BUFFER_SECONDS,
    maxMaxBufferLength: VIDEO_BUFFER_SECONDS,
    startPosition: startAt,
    pLoader: createHostLoader<PlaylistLoaderContext>(host, restoreMutedSegments),
    fLoader: createHostLoader<FragmentLoaderContext>(host),
  };
}

export function hlsConfigFor(mode: PlaybackMode, host: HostBridge): Partial<HlsConfig> {
  return mode.kind === 'live' ? liveConfig(host) : videoConfig(host, mode.startAt);
}
