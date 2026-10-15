import { FLAC_MIME_TYPE, FlacTranscodingSourceBuffer } from './flacTranscodingSourceBuffer';

const AAC_MIME = /^audio\/mp4\b.*\bmp4a\.40\.\d+/i;

type ErrorReporter = (message: string) => void;

let reportError: ErrorReporter = () => undefined;
let installed = false;
const transcoders = new Set<FlacTranscodingSourceBuffer>();

function isAacMimeType(mimeType: string): boolean {
  return AAC_MIME.test(mimeType);
}

export function setTranscodingErrorReporter(reporter: ErrorReporter): void {
  reportError = reporter;
}

/** Segments replaced by silence across all live transcoders, for diagnostics. */
export function transcodingFailures(): number {
  let failures = 0;
  transcoders.forEach((transcoder) => (failures += transcoder.decodeFailures));
  return failures;
}

/**
 * Replaces the global MediaSource with a subclass that hands hls.js a
 * transcoding stand-in whenever it asks for an AAC SourceBuffer. hls.js looks
 * MediaSource up at call time, so this must run before media is attached.
 */
export function installAudioInterception(): void {
  const NativeMediaSource = globalThis.MediaSource;
  if (installed || typeof NativeMediaSource !== 'function') {
    return;
  }
  installed = true;
  const realByTranscoder = new WeakMap<object, SourceBuffer>();
  const transcoderByReal = new WeakMap<SourceBuffer, FlacTranscodingSourceBuffer>();

  class TranscodingMediaSource extends NativeMediaSource {
    static override isTypeSupported(type: string): boolean {
      return isAacMimeType(type)
        ? NativeMediaSource.isTypeSupported(FLAC_MIME_TYPE)
        : NativeMediaSource.isTypeSupported(type);
    }

    override addSourceBuffer(type: string): SourceBuffer {
      if (!isAacMimeType(type)) {
        return super.addSourceBuffer(type);
      }
      const real = super.addSourceBuffer(FLAC_MIME_TYPE);
      const transcoder = new FlacTranscodingSourceBuffer(real, (message) => reportError(message));
      realByTranscoder.set(transcoder, real);
      transcoderByReal.set(real, transcoder);
      transcoders.add(transcoder);
      // The stand-in implements the SourceBuffer members hls.js uses, not the whole interface.
      return transcoder as unknown as SourceBuffer;
    }

    /** hls.js removes either the stand-in or, when detaching, the real buffer it wraps. */
    override removeSourceBuffer(sourceBuffer: SourceBuffer): void {
      const real = realByTranscoder.get(sourceBuffer) ?? sourceBuffer;
      const transcoder = transcoderByReal.get(real);
      if (transcoder) {
        transcoder.detach();
        transcoders.delete(transcoder);
        transcoderByReal.delete(real);
      }
      super.removeSourceBuffer(real);
    }
  }

  globalThis.MediaSource = TranscodingMediaSource;
}
