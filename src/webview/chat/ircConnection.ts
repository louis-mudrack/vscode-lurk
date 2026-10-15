import { parseIrcLine, type IrcMessage } from './ircMessage';

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** Twitch pings roughly every five minutes; silence beyond this means a dead socket. */
const SILENCE_TIMEOUT_MS = 6 * 60_000;
const ANONYMOUS_NICK_RANGE = 900_000;

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface IrcListener {
  onMessage(message: IrcMessage): void;
  onStateChange(state: ConnectionState): void;
}

/** Read-only, anonymous ("justinfan") connection to one Twitch chat room. */
export class TwitchIrcConnection {
  private socket: WebSocket | undefined;
  private channel: string | undefined;
  private attempt = 0;
  private reconnectTimer: number | undefined;
  private silenceTimer: number | undefined;

  constructor(private readonly listener: IrcListener) {}

  join(channel: string | undefined): void {
    if (channel === this.channel) {
      return;
    }
    const previous = this.channel;
    this.channel = channel;
    if (!channel) {
      this.close();
      this.listener.onStateChange('idle');
      return;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      if (previous) {
        this.socket.send(`PART #${previous}`);
      }
      this.socket.send(`JOIN #${channel}`);
      return;
    }
    if (!this.socket) {
      this.connect();
    }
  }

  private connect(): void {
    window.clearTimeout(this.reconnectTimer);
    this.listener.onStateChange(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = new WebSocket(IRC_URL);
    this.socket = socket;
    socket.addEventListener('open', () => {
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      socket.send('PASS SCHMOOPIIE');
      socket.send(`NICK justinfan${Math.floor(Math.random() * ANONYMOUS_NICK_RANGE) + 1000}`);
      if (this.channel) {
        socket.send(`JOIN #${this.channel}`);
      }
      this.armSilenceTimer();
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      if (socket === this.socket) {
        this.handleData(socket, event.data);
      }
    });
    socket.addEventListener('close', () => {
      if (socket === this.socket) {
        this.socket = undefined;
        this.scheduleReconnect();
      }
    });
  }

  private handleData(socket: WebSocket, data: string): void {
    this.armSilenceTimer();
    for (const line of data.split('\r\n')) {
      const message = line ? parseIrcLine(line) : undefined;
      if (!message) {
        continue;
      }
      switch (message.command) {
        case 'PING':
          socket.send(`PONG :${message.params[0] ?? 'tmi.twitch.tv'}`);
          break;
        case 'RECONNECT':
          this.restart();
          break;
        case '001':
          this.attempt = 0;
          this.listener.onStateChange('connected');
          break;
        default:
          this.listener.onMessage(message);
      }
    }
  }

  private armSilenceTimer(): void {
    window.clearTimeout(this.silenceTimer);
    this.silenceTimer = window.setTimeout(() => this.restart(), SILENCE_TIMEOUT_MS);
  }

  private restart(): void {
    this.close();
    if (this.channel) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    window.clearTimeout(this.silenceTimer);
    if (!this.channel) {
      return;
    }
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    this.attempt++;
    this.listener.onStateChange('reconnecting');
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private close(): void {
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.silenceTimer);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
}
