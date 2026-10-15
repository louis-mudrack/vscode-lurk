import type {
  ChannelSuggestion,
  HostFetchResult,
  PlayerToHostMessage,
  VideoInfo,
} from '../../shared/protocol';
import { vscodeApi } from '../common/vscodeApi';

class PendingRequests<T> {
  private readonly resolvers = new Map<number, (value: T) => void>();

  wait(requestId: number): Promise<T> {
    return new Promise((resolve) => this.resolvers.set(requestId, resolve));
  }

  resolve(requestId: number, value: T): void {
    this.resolvers.get(requestId)?.(value);
    this.resolvers.delete(requestId);
  }
}

/** Request/response wrapper around the extension host. */
export class HostBridge {
  private nextRequestId = 1;
  private readonly fetches = new PendingRequests<HostFetchResult>();
  private readonly searches = new PendingRequests<ChannelSuggestion[]>();
  private readonly videoLists = new PendingRequests<VideoInfo[]>();

  post(message: PlayerToHostMessage): void {
    vscodeApi<PlayerToHostMessage>().postMessage(message);
  }

  fetch(url: string, responseType: 'text' | 'arraybuffer'): Promise<HostFetchResult> {
    const requestId = this.nextRequestId++;
    const result = this.fetches.wait(requestId);
    this.post({ type: 'fetch', requestId, url, responseType });
    return result;
  }

  searchChannels(query: string): Promise<ChannelSuggestion[]> {
    const requestId = this.nextRequestId++;
    const result = this.searches.wait(requestId);
    this.post({ type: 'searchChannels', requestId, query });
    return result;
  }

  listVideos(login: string): Promise<VideoInfo[]> {
    const requestId = this.nextRequestId++;
    const result = this.videoLists.wait(requestId);
    this.post({ type: 'listVideos', requestId, login });
    return result;
  }

  resolveFetch(requestId: number, result: HostFetchResult): void {
    this.fetches.resolve(requestId, result);
  }

  resolveSearch(requestId: number, suggestions: ChannelSuggestion[]): void {
    this.searches.resolve(requestId, suggestions);
  }

  resolveVideos(requestId: number, videos: VideoInfo[]): void {
    this.videoLists.resolve(requestId, videos);
  }
}
