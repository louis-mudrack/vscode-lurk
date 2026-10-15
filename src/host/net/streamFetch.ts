import type { HostFetchResult } from '../../shared/protocol';
import { fetchWithTimeout } from './fetchWithTimeout';
import { isAllowedStreamUrl } from './streamUrlPolicy';

const STREAM_FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetches a stream resource on behalf of the player webview. Twitch rejects
 * playlist requests whose Origin is a VS Code webview, while requests from the
 * extension host carry no Origin at all.
 */
export async function fetchStreamResource(
  url: string,
  responseType: 'text' | 'arraybuffer',
): Promise<HostFetchResult> {
  if (!isAllowedStreamUrl(url)) {
    return { ok: false, status: 0, message: 'URL is not a Twitch stream resource' };
  }
  try {
    const response = await fetchWithTimeout(url, {}, STREAM_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      return { ok: false, status: response.status, message: response.statusText };
    }
    const finalUrl = response.url || url;
    if (responseType === 'text') {
      return { ok: true, url: finalUrl, status: response.status, text: await response.text() };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { ok: true, url: finalUrl, status: response.status, bytes };
  } catch (error) {
    return { ok: false, status: 0, message: String(error) };
  }
}
