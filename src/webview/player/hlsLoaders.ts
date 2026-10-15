import {
  LoadStats,
  type HlsConfig,
  type Loader,
  type LoaderCallbacks,
  type LoaderConfiguration,
  type LoaderContext,
  type LoaderStats,
} from 'hls.js';
import type { HostFetchResult } from '../../shared/protocol';
import type { HostBridge } from './hostBridge';

export type LoaderClass<T extends LoaderContext> = new (config: HlsConfig) => Loader<T>;

const HTTP_FORBIDDEN = 403;
/** XHR reports CORS rejections and dropped connections as status 0. */
const HTTP_BLOCKED = 0;

type TextTransform = (text: string) => string;

function payloadOf(
  result: Extract<HostFetchResult, { ok: true }>,
  transformText: TextTransform,
): string | ArrayBuffer {
  if ('text' in result) {
    return transformText(result.text);
  }
  const { bytes } = result;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Loads through the extension host, which Twitch accepts (no webview Origin header). */
export function createHostLoader<T extends LoaderContext>(
  host: HostBridge,
  transformText: TextTransform = (text) => text,
): LoaderClass<T> {
  return class HostLoader implements Loader<T> {
    context: T | null = null;
    stats: LoaderStats = new LoadStats();
    private callbacks: LoaderCallbacks<T> | null = null;
    private timeout: number | undefined;
    private settled = false;

    load(context: T, config: LoaderConfiguration, callbacks: LoaderCallbacks<T>): void {
      this.context = context;
      this.callbacks = callbacks;
      this.settled = false;
      const stats = this.stats;
      stats.loading.start = performance.now();
      this.timeout = window.setTimeout(() => {
        if (this.settle()) {
          callbacks.onTimeout(stats, context, null);
        }
      }, config.loadPolicy.maxLoadTimeMs);

      const responseType = context.responseType === 'arraybuffer' ? 'arraybuffer' : 'text';
      void host.fetch(context.url, responseType).then((result) => {
        if (!this.settle()) {
          return;
        }
        stats.loading.first = stats.loading.end = performance.now();
        if (!result.ok) {
          callbacks.onError({ code: result.status, text: result.message }, context, null, stats);
          return;
        }
        const data = payloadOf(result, transformText);
        stats.loaded = stats.total = typeof data === 'string' ? data.length : data.byteLength;
        callbacks.onSuccess({ url: result.url, data, code: result.status }, stats, context, null);
      });
    }

    abort(): void {
      if (this.context && this.settle()) {
        this.stats.aborted = true;
        this.callbacks?.onAbort?.(this.stats, this.context, null);
      }
    }

    destroy(): void {
      this.abort();
      this.callbacks = null;
      this.context = null;
    }

    private settle(): boolean {
      if (this.settled) {
        return false;
      }
      this.settled = true;
      window.clearTimeout(this.timeout);
      return true;
    }
  };
}

/**
 * Loads segments straight from the CDN (they allow any origin today) and
 * permanently switches to the host route if Twitch starts rejecting the webview.
 */
export function createFragmentLoader<T extends LoaderContext>(
  DirectLoader: LoaderClass<T>,
  HostLoader: LoaderClass<T>,
): LoaderClass<T> {
  let useHost = false;
  return class FragmentLoader implements Loader<T> {
    private delegate: Loader<T>;

    constructor(private readonly hlsConfig: HlsConfig) {
      this.delegate = useHost ? new HostLoader(hlsConfig) : new DirectLoader(hlsConfig);
    }

    get context(): T | null {
      return this.delegate.context;
    }

    get stats(): LoaderStats {
      return this.delegate.stats;
    }

    load(context: T, config: LoaderConfiguration, callbacks: LoaderCallbacks<T>): void {
      if (useHost) {
        this.delegate.load(context, config, callbacks);
        return;
      }
      this.delegate.load(context, config, {
        ...callbacks,
        onError: (error, failedContext, networkDetails, stats) => {
          if (error.code !== HTTP_FORBIDDEN && error.code !== HTTP_BLOCKED) {
            callbacks.onError(error, failedContext, networkDetails, stats);
            return;
          }
          useHost = true;
          this.delegate.destroy();
          this.delegate = new HostLoader(this.hlsConfig);
          this.delegate.load(context, config, callbacks);
        },
      });
    }

    abort(): void {
      this.delegate.abort();
    }

    destroy(): void {
      this.delegate.destroy();
    }
  };
}
