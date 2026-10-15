import type * as vscode from 'vscode';
import type { TwitchAccount } from '../../shared/protocol';
import type { TokenSet } from './oauthClient';

const SECRET_KEY = 'twitchPlayer.twitchSession';

export interface StoredSession {
  /** Tokens only work with the client that issued them. */
  clientId: string;
  tokens: TokenSet;
  account: TwitchAccount;
}

function isStoredSession(value: unknown): value is StoredSession {
  const session = value as Partial<StoredSession> | null;
  return (
    typeof session?.clientId === 'string' &&
    typeof session.tokens?.accessToken === 'string' &&
    typeof session.tokens.refreshToken === 'string' &&
    typeof session.account?.id === 'string'
  );
}

export interface SessionStore {
  load(): Promise<StoredSession | undefined>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/** Keeps the Twitch session in VS Code's secret storage (the OS keychain). */
export class TokenStore implements SessionStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async load(): Promise<StoredSession | undefined> {
    const raw = await this.secrets.get(SECRET_KEY);
    if (!raw) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isStoredSession(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  async save(session: StoredSession): Promise<void> {
    await this.secrets.store(SECRET_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
  }
}
