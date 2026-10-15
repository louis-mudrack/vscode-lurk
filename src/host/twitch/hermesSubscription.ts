import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { Logger } from '../logger';
import { TWITCH_WEB_CLIENT_ID } from './gqlClient';

const HERMES_URL = `wss://hermes.twitch.tv/v1?clientId=${TWITCH_WEB_CLIENT_ID}`;
const HERMES_HOST = 'hermes.twitch.tv';
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const DEFAULT_KEEPALIVE_MS = 15_000;
const KEEPALIVE_GRACE_MS = 10_000;

interface HermesMessage {
  type?: string;
  welcome?: { keepaliveSec?: number };
  reconnect?: { url?: string };
  subscribeResponse?: { result?: string; error?: string };
  notification?: unknown;
}

function rawDataToText(data: WebSocket.RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
}

function isHermesUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'wss:' && parsed.hostname === HERMES_HOST;
  } catch {
    return false;
  }
}

/**
 * Keeps one subscription to a PubSub topic on Twitch's undocumented "Hermes" socket,
 * the push channel the twitch.tv web client uses (legacy PubSub was shut down).
 * Anonymous subscriptions work for public topics such as `raid.<channelId>`.
 */
export class HermesSubscription {
  private socket: WebSocket | undefined;
  private disposed = false;
  private attempt = 0;
  private keepaliveMs = DEFAULT_KEEPALIVE_MS;
  private keepaliveTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private confirmed = false;

  constructor(
    private readonly topic: string,
    private readonly onNotification: (payload: unknown) => void,
    private readonly log: Logger,
  ) {
    this.connect(HERMES_URL);
  }

  /** True once Twitch acknowledged the subscription on the current connection. */
  get isSubscribed(): boolean {
    return this.confirmed;
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.keepaliveTimer);
    clearTimeout(this.reconnectTimer);
    this.closeSocket();
  }

  private connect(url: string): void {
    this.confirmed = false;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.on('open', () => {
      this.attempt = 0;
      this.subscribe(socket);
      this.armKeepaliveWatchdog();
    });
    socket.on('message', (data: WebSocket.RawData) => {
      if (socket === this.socket) {
        this.handleMessage(rawDataToText(data));
      }
    });
    socket.on('close', () => {
      if (socket === this.socket) {
        this.scheduleReconnect();
      }
    });
    socket.on('error', (error: Error) => {
      this.log.warn(`Raid watcher connection error (${this.topic}): ${error.message}`);
    });
  }

  private subscribe(socket: WebSocket): void {
    socket.send(
      JSON.stringify({
        type: 'subscribe',
        id: randomUUID(),
        subscribe: { id: randomUUID(), type: 'pubsub', pubsub: { topic: this.topic } },
        timestamp: new Date().toISOString(),
      }),
    );
  }

  private handleMessage(text: string): void {
    this.armKeepaliveWatchdog();
    let message: HermesMessage;
    try {
      message = JSON.parse(text) as HermesMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case 'welcome':
        if (message.welcome?.keepaliveSec) {
          this.keepaliveMs = message.welcome.keepaliveSec * 1000;
          this.armKeepaliveWatchdog();
        }
        break;
      case 'subscribeResponse':
        this.confirmed = message.subscribeResponse?.result === 'ok';
        if (this.confirmed) {
          this.log.info(`Watching ${this.topic}`);
        } else {
          this.log.warn(`Raid watcher subscription to ${this.topic} failed: ${text}`);
        }
        break;
      case 'notification':
        this.onNotification(message.notification);
        break;
      case 'reconnect':
        this.reconnectTo(message.reconnect?.url);
        break;
    }
  }

  private reconnectTo(url: string | undefined): void {
    this.closeSocket();
    this.connect(url && isHermesUrl(url) ? url : HERMES_URL);
  }

  private armKeepaliveWatchdog(): void {
    clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.log.warn(`Raid watcher for ${this.topic} went silent, reconnecting`);
      this.reconnectTo(undefined);
    }, this.keepaliveMs + KEEPALIVE_GRACE_MS);
  }

  private scheduleReconnect(): void {
    clearTimeout(this.keepaliveTimer);
    this.socket = undefined;
    if (this.disposed) {
      return;
    }
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.connect(HERMES_URL), delay);
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) {
      return;
    }
    socket.removeAllListeners('close');
    socket.removeAllListeners('message');
    socket.on('error', () => undefined);
    socket.terminate();
  }
}
