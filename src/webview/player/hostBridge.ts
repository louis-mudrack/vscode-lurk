import type { HostFetchResult, PlayerToHostMessage } from '../../shared/protocol';
import { vscodeApi } from '../common/vscodeApi';

/** Request/response wrapper around the extension host for stream resources. */
export class HostBridge {
  private nextRequestId = 1;
  private readonly pending = new Map<number, (result: HostFetchResult) => void>();

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

  resolveFetch(requestId: number, result: HostFetchResult): void {
    this.pending.get(requestId)?.(result);
    this.pending.delete(requestId);
  }
}
