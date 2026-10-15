import Hls, { ErrorTypes, Events, type ErrorData, type Fragment } from 'hls.js';
import type { PlaybackDiagnostics, QualityPreference } from '../../shared/protocol';
import {
  installAudioInterception,
  setTranscodingErrorReporter,
  transcodingFailures,
} from './audio/audioInterception';
import { hlsConfigFor, type PlaybackMode } from './hlsConfig';
import type { HostBridge } from './hostBridge';
import { AUTO_LEVEL, levelIndexForPreference, levelLabel } from './qualityLevels';

const MAX_MEDIA_RECOVERIES = 3;
const AD_SEGMENT_TITLE = /amazon|stitched-ad/i;

export interface QualityOption {
  index: number;
  label: string;
  height: number;
}

export interface QualityState {
  options: QualityOption[];
  selectedIndex: number;
  playingLabel: string | null;
}

export interface StreamPlayerListener {
  onQualityChange(state: QualityState): void;
  onAdBreakChange(isAdBreak: boolean): void;
  onPlaybackFailed(reason: string): void;
}

function describeError(data: ErrorData): string {
  const buffer = data.sourceBufferName ? ` (${data.sourceBufferName})` : '';
  const cause = data.error?.message ? `: ${data.error.message}` : '';
  return `${data.type}: ${data.details}${buffer}${cause}`;
}

function isAdFragment(fragment: Fragment): boolean {
  return AD_SEGMENT_TITLE.test(fragment.title ?? '');
}

/** Chromium-only counter; proves the FLAC track is really being decoded. */
function decodedAudioBytes(video: HTMLVideoElement): number | null {
  const counter = (video as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
  return typeof counter === 'number' ? counter : null;
}

function hasUserActivation(): boolean {
  return navigator.userActivation?.hasBeenActive ?? true;
}

/** hls.js driven playback; AAC audio is transcoded to FLAC on the fly (see audio/). */
export class StreamPlayer {
  private hls: Hls | undefined;
  private mode: PlaybackMode = { kind: 'live' };
  private preference: QualityPreference = 'auto';
  private volume = 0.5;
  private muted = false;
  private mediaRecoveries = 0;
  private lastError: string | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly host: HostBridge,
    private readonly listener: StreamPlayerListener,
  ) {
    installAudioInterception();
    setTranscodingErrorReporter((message) => {
      this.lastError = message;
    });
    // Start muted: Chromium only allows audible playback after a click in this webview.
    video.muted = true;
    video.addEventListener('ended', () => {
      if (this.mode.kind === 'live') {
        this.fail('stream ended');
      }
    });
  }

  /** The user wants sound but has not clicked into the webview yet. */
  get isAudioBlocked(): boolean {
    return !this.muted && !hasUserActivation() && !this.video.paused;
  }

  get currentTime(): number {
    return this.video.currentTime;
  }

  /** Frames are advancing, so the position is meaningful (not 0 before the start seek). */
  get isPlaying(): boolean {
    const video = this.video;
    return !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  get duration(): number {
    return this.video.duration;
  }

  load(url: string, preference: QualityPreference, mode: PlaybackMode): void {
    this.destroyHls();
    this.mode = mode;
    this.preference = preference;
    this.mediaRecoveries = 0;
    this.lastError = null;
    const hls = new Hls(hlsConfigFor(mode, this.host));
    hls.on(Events.MANIFEST_PARSED, () => {
      this.applyPreference(false);
      this.video.play().catch(() => undefined);
    });
    hls.on(Events.LEVEL_SWITCHED, () => this.emitQuality());
    hls.on(Events.FRAG_CHANGED, (_event, { frag }) =>
      this.listener.onAdBreakChange(isAdFragment(frag)),
    );
    hls.on(Events.ERROR, (_event, data) => this.handleError(data));
    hls.loadSource(url);
    hls.attachMedia(this.video);
    this.hls = hls;
  }

  stop(): void {
    this.destroyHls();
    this.video.removeAttribute('src');
    this.video.load();
    this.listener.onAdBreakChange(false);
  }

  togglePause(): void {
    if (this.video.paused) {
      // Jump back to the live edge instead of resuming minutes behind.
      const liveEdge = this.hls?.liveSyncPosition;
      if (this.mode.kind === 'live' && liveEdge && Number.isFinite(liveEdge)) {
        this.video.currentTime = liveEdge;
      }
      this.video.play().catch(() => undefined);
    } else {
      this.video.pause();
    }
  }

  seek(seconds: number): void {
    if (this.mode.kind === 'video') {
      this.video.currentTime = seconds;
    }
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
  }

  /**
   * Unmuting without a prior user gesture would make Chromium pause the video,
   * so the element stays muted until the webview has seen a click or key press.
   */
  applyVolume(): void {
    this.video.volume = this.volume * this.volume;
    this.video.muted = this.muted || !hasUserActivation();
  }

  setPreference(preference: QualityPreference): void {
    this.preference = preference;
    this.applyPreference(true);
  }

  selectLevel(index: number): void {
    if (this.hls) {
      this.hls.nextLevel = index;
      this.emitQuality();
    }
  }

  diagnostics(): PlaybackDiagnostics {
    const video = this.video;
    const buffered = video.buffered;
    const bufferEnd = buffered.length ? buffered.end(buffered.length - 1) : video.currentTime;
    const level = this.hls?.levels[this.hls.currentLevel];
    return {
      hlsLevel: level ? levelLabel(level) : null,
      videoTime: video.currentTime,
      videoPaused: video.paused,
      bufferedAhead: Math.max(0, bufferEnd - video.currentTime),
      readyState: video.readyState,
      latency: this.mode.kind === 'live' ? (this.hls?.latency ?? null) : null,
      droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
      audioMuted: video.muted,
      audioDecodedBytes: decodedAudioBytes(video),
      audioDecodeFailures: transcodingFailures(),
      lastError: this.lastError,
    };
  }

  private applyPreference(smooth: boolean): void {
    const hls = this.hls;
    if (!hls || hls.levels.length === 0) {
      return;
    }
    const index = levelIndexForPreference(hls.levels, this.preference);
    if (smooth) {
      hls.nextLevel = index;
    } else {
      hls.currentLevel = index;
    }
    this.emitQuality();
  }

  private emitQuality(): void {
    const hls = this.hls;
    if (!hls) {
      return;
    }
    const options = hls.levels
      .map((level, index) => ({ index, label: levelLabel(level), height: level.height }))
      .sort((a, b) => b.height - a.height || b.index - a.index);
    const playing = hls.levels[hls.currentLevel];
    this.listener.onQualityChange({
      options,
      selectedIndex: hls.autoLevelEnabled ? AUTO_LEVEL : hls.nextLoadLevel,
      playingLabel: playing ? levelLabel(playing) : null,
    });
  }

  private handleError(data: ErrorData): void {
    this.lastError = describeError(data);
    if (!data.fatal) {
      return;
    }
    if (data.type === ErrorTypes.MEDIA_ERROR && this.mediaRecoveries < MAX_MEDIA_RECOVERIES) {
      this.mediaRecoveries++;
      this.hls?.recoverMediaError();
      return;
    }
    this.fail(describeError(data));
  }

  private fail(reason: string): void {
    this.destroyHls();
    this.listener.onPlaybackFailed(reason);
  }

  private destroyHls(): void {
    this.hls?.destroy();
    this.hls = undefined;
  }
}
