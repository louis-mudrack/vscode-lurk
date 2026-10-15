import { AACDecoder } from '@wasm-audio-decoders/aac';
import { encodeFlacFrames } from './flacEncoder';
import { flacInitSegment, flacMediaSegment } from './flacMp4';
import {
  containsInitSegment,
  parseAudioInitSegment,
  parseAudioMediaSegment,
  type AudioSample,
  type AudioTrackConfig,
} from './fmp4';
import { fitToLength } from './pcm';

export const FLAC_MIME_TYPE = 'audio/mp4; codecs="flac"';
const FALLBACK_CHANNEL_COUNT = 2;

interface OutputFormat {
  sampleRate: number;
  channelCount: number;
}

interface DecodedChunk {
  channels: Float32Array[];
  format: OutputFormat;
}

function copyBytes(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data.slice(0));
  }
  return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * Sits between hls.js and a real FLAC SourceBuffer. hls.js appends AAC
 * (which VS Code's Chromium cannot decode); every append is decoded with a
 * WebAssembly AAC decoder, re-encoded as FLAC (which it can decode) and
 * appended to the real buffer on the same timeline, so the `<video>` element
 * gets a native audio track with native A/V sync.
 */
export class FlacTranscodingSourceBuffer extends EventTarget {
  mode: AppendMode = 'segments';
  timestampOffset = 0;

  private isUpdating = false;
  private generation = 0;
  private pendingTargetUpdate: number | undefined;
  private targetFailed = false;
  private config: AudioTrackConfig | undefined;
  private decoder: AACDecoder | undefined;
  private decoderKey: string | undefined;
  private outputFormat: OutputFormat | undefined;
  private sequenceNumber = 0;
  private failedSegments = 0;

  constructor(
    private readonly target: SourceBuffer,
    private readonly reportError: (message: string) => void,
  ) {
    super();
    target.addEventListener('error', this.onTargetError);
    target.addEventListener('updateend', this.onTargetUpdateEnd);
  }

  get updating(): boolean {
    return this.isUpdating;
  }

  get buffered(): TimeRanges {
    return this.target.buffered;
  }

  get appendWindowStart(): number {
    return this.target.appendWindowStart;
  }

  set appendWindowStart(value: number) {
    this.target.appendWindowStart = value;
  }

  get appendWindowEnd(): number {
    return this.target.appendWindowEnd;
  }

  set appendWindowEnd(value: number) {
    this.target.appendWindowEnd = value;
  }

  /** Segments that could not be decoded and were replaced by silence. */
  get decodeFailures(): number {
    return this.failedSegments;
  }

  appendBuffer(data: BufferSource): void {
    const generation = this.beginUpdate();
    this.transcode(copyBytes(data)).then(
      (output) => {
        if (generation !== this.generation) {
          return;
        }
        if (!output) {
          this.finishUpdate(generation, false);
          return;
        }
        this.forwardToTarget(generation, () => {
          if (this.target.timestampOffset !== this.timestampOffset) {
            this.target.timestampOffset = this.timestampOffset;
          }
          this.target.appendBuffer(output);
        });
      },
      (error: unknown) => {
        this.reportError(`Audio transcoding failed: ${String(error)}`);
        this.finishUpdate(generation, true);
      },
    );
  }

  remove(start: number, end: number): void {
    const generation = this.beginUpdate();
    this.forwardToTarget(generation, () => this.target.remove(start, end));
  }

  abort(): void {
    if (!this.isUpdating) {
      return;
    }
    this.generation++;
    this.isUpdating = false;
    this.pendingTargetUpdate = undefined;
    try {
      this.target.abort();
    } catch {
      // The real buffer may already have been removed from its MediaSource.
    }
    this.dispatchEvent(new Event('abort'));
    this.dispatchEvent(new Event('updateend'));
  }

  changeType(): void {
    // The init segment following a codec change reconfigures the decoder.
  }

  detach(): void {
    this.generation++;
    this.isUpdating = false;
    this.pendingTargetUpdate = undefined;
    this.target.removeEventListener('error', this.onTargetError);
    this.target.removeEventListener('updateend', this.onTargetUpdateEnd);
    this.decoder?.free();
    this.decoder = undefined;
    this.decoderKey = undefined;
  }

  private beginUpdate(): number {
    if (this.isUpdating) {
      throw new DOMException('The SourceBuffer is still updating', 'InvalidStateError');
    }
    this.isUpdating = true;
    this.dispatchEvent(new Event('updatestart'));
    return this.generation;
  }

  private forwardToTarget(generation: number, operation: () => void): void {
    this.pendingTargetUpdate = generation;
    this.targetFailed = false;
    try {
      operation();
    } catch (error) {
      this.pendingTargetUpdate = undefined;
      this.reportError(`Audio buffer rejected data: ${String(error)}`);
      this.finishUpdate(generation, true);
    }
  }

  private readonly onTargetError = (): void => {
    this.targetFailed = true;
  };

  private readonly onTargetUpdateEnd = (): void => {
    const generation = this.pendingTargetUpdate;
    this.pendingTargetUpdate = undefined;
    if (generation !== undefined) {
      this.finishUpdate(generation, this.targetFailed);
    }
  };

  private finishUpdate(generation: number, failed: boolean): void {
    if (generation !== this.generation) {
      return;
    }
    this.isUpdating = false;
    this.dispatchEvent(new Event(failed ? 'error' : 'update'));
    this.dispatchEvent(new Event('updateend'));
  }

  private async transcode(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer> | undefined> {
    if (containsInitSegment(bytes)) {
      const config = parseAudioInitSegment(bytes);
      if (config) {
        await this.configure(config);
      }
    }
    const config = this.config;
    if (!config) {
      return undefined;
    }
    const samples = parseAudioMediaSegment(bytes, config);
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last) {
      return undefined;
    }
    const { channels, format } = await this.decode(samples, config);
    const startSeconds = first.decodeTime / config.timescale;
    const endSeconds = (last.decodeTime + last.duration) / config.timescale;
    const startSample = Math.round(startSeconds * format.sampleRate);
    const sampleCount = Math.round(endSeconds * format.sampleRate) - startSample;
    // The decoder may swallow priming frames; padding keeps the audio timeline gap-free.
    const pcm = fitToLength(channels, sampleCount);

    const parts: Uint8Array[] = [];
    if (
      this.outputFormat?.sampleRate !== format.sampleRate ||
      this.outputFormat.channelCount !== format.channelCount
    ) {
      parts.push(flacInitSegment(format.sampleRate, format.channelCount));
      this.outputFormat = format;
    }
    const frames = encodeFlacFrames(pcm, format.sampleRate, startSample);
    parts.push(
      flacMediaSegment(
        ++this.sequenceNumber,
        startSample,
        frames.map((frame) => ({ bytes: frame.bytes, duration: frame.sampleCount })),
      ),
    );
    return concat(parts);
  }

  /** Decodes AAC to PCM; undecodable data becomes silence so playback never stalls on a gap. */
  private async decode(samples: AudioSample[], config: AudioTrackConfig): Promise<DecodedChunk> {
    const fallbackFormat: OutputFormat = this.outputFormat ?? {
      sampleRate: config.sampleRate,
      channelCount: config.channelCount || FALLBACK_CHANNEL_COUNT,
    };
    try {
      const decoder = this.decoder;
      if (!decoder) {
        throw new Error('decoder not configured');
      }
      const decoded = await decoder.decodeFrames(samples.map((sample) => sample.data));
      if (decoded.samplesDecoded > 0 && decoded.sampleRate > 0) {
        return {
          channels: decoded.channelData,
          format: { sampleRate: decoded.sampleRate, channelCount: decoded.channelData.length },
        };
      }
    } catch (error) {
      this.reportError(`AAC decoding failed: ${String(error)}`);
    }
    this.failedSegments++;
    return {
      channels: Array.from({ length: fallbackFormat.channelCount }, () => new Float32Array(0)),
      format: fallbackFormat,
    };
  }

  private async configure(config: AudioTrackConfig): Promise<void> {
    this.config = config;
    const key = Array.from(config.audioSpecificConfig).join(',');
    if (this.decoder && key === this.decoderKey) {
      return;
    }
    this.decoder?.free();
    this.decoder = new AACDecoder({ audioSpecificConfig: config.audioSpecificConfig });
    this.decoderKey = key;
    await this.decoder.ready;
  }
}
