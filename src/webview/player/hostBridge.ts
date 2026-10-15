import type {
  ChannelSuggestion,
  HostFetchResult,
  PlayerToHostMessage,
} from '../../shared/protocol';
import { vscodeApi } from '../common/vscodeApi';

/** Request/response wrapper around the extension host for stream resources. */
export class HostBridge {
  private nextRequestId = 1;
  private readonly pending = new Map<number, (result: HostFetchResult) => void>();
  private readonly pendingSearches = new Map<number, (suggestions: ChannelSuggestion[]) => void>();

  post(message: PlayerToHostMessage): void {
    vscodeApi<PlayerToHostMessage>().postMessage(message);
  }

  fetch(url: string, responseType: 'text' | 'arraybuffer'): Promise<HostFetchResult> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      this.post({ type: 'fetch', requestId, url, responseType });
    });
  }

  searchChannels(query: string): Promise<ChannelSuggestion[]> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pendingSearches.set(requestId, resolve);
      this.post({ type: 'searchChannels', requestId, query });
    });
  }

  resolveSearch(requestId: number, suggestions: ChannelSuggestion[]): void {
    this.pendingSearches.get(requestId)?.(suggestions);
    this.pendingSearches.delete(requestId);
  }

  resolveFetch(requestId: number, result: HostFetchResult): void {
    this.pending.get(requestId)?.(result);
    this.pending.delete(requestId);
  }
}
