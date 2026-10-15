import type { TwitchAccount } from '../../shared/protocol';
import { Emitter } from '../emitter';
import type { Logger } from '../logger';
import { HttpError } from '../net/fetchWithTimeout';
import type { HelixCredentials } from '../twitch/helix';
import { fetchOwnAccount } from '../twitch/helixUsers';
import { waitForAuthorization, type CancellationSignal } from './deviceFlow';
import {
  OAuthError,
  pollDeviceToken,
  refreshTokens,
  requestDeviceCode,
  revokeToken,
  validateToken,
  type DeviceCode,
  type TokenSet,
} from './oauthClient';
import type { SessionStore, StoredSession } from './tokenStore';

const REFRESH_MARGIN_MS = 5 * 60_000;
const VALIDATE_INTERVAL_MS = 60 * 60_000;
const HTTP_UNAUTHORIZED = 401;

export class NotSignedInError extends Error {
  constructor() {
    super('Not signed in to Twitch');
    this.name = 'NotSignedInError';
  }
}

export class MissingClientIdError extends Error {
  constructor() {
    super('No Twitch client ID is configured');
    this.name = 'MissingClientIdError';
  }
}

/** Shows the code to the user and resolves once `waitForTokens` does. */
export type DeviceCodePrompt = (
  code: DeviceCode,
  waitForTokens: (cancellation: CancellationSignal) => Promise<TokenSet>,
) => Promise<TokenSet>;

function credentialsOf(session: StoredSession): HelixCredentials {
  return { clientId: session.clientId, accessToken: session.tokens.accessToken };
}

/** Twitch's answer when a refresh token is unknown, used up or revoked. */
function isRejectedRefresh(error: unknown): boolean {
  return error instanceof OAuthError && error.status >= 400 && error.status < 500;
}

/**
 * The Twitch sign-in: runs the device-code flow, keeps the tokens fresh and
 * hands them to Helix requests. Tokens never leave the extension host.
 */
export class TwitchAuth {
  private session: StoredSession | undefined;
  private refreshing: Promise<StoredSession | undefined> | undefined;
  private readonly accountEmitter = new Emitter<TwitchAccount | undefined>();
  private readonly expiredEmitter = new Emitter<void>();
  private readonly validateTimer: NodeJS.Timeout;
  readonly onDidChangeAccount = this.accountEmitter.event;
  /** The session ended without the user signing out (revoked on twitch.tv, expired). */
  readonly onDidExpire = this.expiredEmitter.event;

  constructor(
    private readonly store: SessionStore,
    private readonly clientId: () => string,
    readonly scopes: string[],
    private readonly log: Logger,
  ) {
    this.validateTimer = setInterval(() => void this.validate(), VALIDATE_INTERVAL_MS);
  }

  get account(): TwitchAccount | undefined {
    return this.session?.account;
  }

  get grantedScopes(): string[] {
    return this.session?.tokens.scopes ?? [];
  }

  async initialize(): Promise<void> {
    const stored = await this.store.load();
    if (!stored) {
      return;
    }
    if (stored.clientId !== this.clientId()) {
      await this.store.clear();
      return;
    }
    this.session = stored;
    this.accountEmitter.fire(stored.account);
    await this.validate();
  }

  async signIn(prompt: DeviceCodePrompt): Promise<TwitchAccount> {
    const clientId = this.clientId();
    if (!clientId) {
      throw new MissingClientIdError();
    }
    const code = await requestDeviceCode(clientId, this.scopes);
    const tokens = await prompt(code, (cancellation) =>
      waitForAuthorization(
        code,
        (deviceCode) => pollDeviceToken(clientId, this.scopes, deviceCode),
        cancellation,
      ),
    );
    const account = await fetchOwnAccount({ clientId, accessToken: tokens.accessToken });
    await this.setSession({ clientId, tokens, account });
    this.log.info(`Signed in to Twitch as ${account.login}`);
    return account;
  }

  async signOut(): Promise<void> {
    const session = this.session;
    await this.setSession(undefined);
    if (session) {
      await revokeToken(session.clientId, session.tokens.accessToken).catch((error: unknown) =>
        this.log.warn(`Revoking the Twitch token failed: ${String(error)}`),
      );
    }
  }

  /** Runs a Helix request with a fresh token and retries once if Twitch rejects the token. */
  async withCredentials<T>(
    request: (credentials: HelixCredentials, account: TwitchAccount) => Promise<T>,
  ): Promise<T> {
    let session = await this.freshSession();
    if (!session) {
      throw new NotSignedInError();
    }
    try {
      return await request(credentialsOf(session), session.account);
    } catch (error) {
      if (!(error instanceof HttpError && error.status === HTTP_UNAUTHORIZED)) {
        throw error;
      }
      session = await this.refresh(session);
      if (!session) {
        throw new NotSignedInError();
      }
      return request(credentialsOf(session), session.account);
    }
  }

  dispose(): void {
    clearInterval(this.validateTimer);
    this.accountEmitter.dispose();
    this.expiredEmitter.dispose();
  }

  private async freshSession(): Promise<StoredSession | undefined> {
    const session = this.session;
    if (session && session.tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
      return this.refresh(session);
    }
    return session;
  }

  /** Refresh tokens work only once, so concurrent callers share one refresh. */
  private refresh(session: StoredSession): Promise<StoredSession | undefined> {
    this.refreshing ??= this.refreshOnce(session).finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refreshOnce(session: StoredSession): Promise<StoredSession | undefined> {
    try {
      const tokens = await refreshTokens(session.clientId, session.tokens.refreshToken);
      const refreshed: StoredSession = { ...session, tokens };
      if (this.session === session) {
        await this.setSession(refreshed);
      }
      return refreshed;
    } catch (error) {
      if (!isRejectedRefresh(error)) {
        throw error;
      }
      this.log.warn(`The Twitch session ended: ${String(error)}`);
      if (this.session === session) {
        await this.setSession(undefined);
        this.expiredEmitter.fire();
      }
      return undefined;
    }
  }

  private async validate(): Promise<void> {
    const session = this.session;
    if (!session) {
      return;
    }
    try {
      if (!(await validateToken(session.tokens.accessToken))) {
        await this.refresh(session);
      }
    } catch (error) {
      this.log.warn(`Validating the Twitch session failed: ${String(error)}`);
    }
  }

  private async setSession(session: StoredSession | undefined): Promise<void> {
    const previousAccountId = this.session?.account.id;
    this.session = session;
    await (session ? this.store.save(session) : this.store.clear());
    if (session?.account.id !== previousAccountId) {
      this.accountEmitter.fire(session?.account);
    }
  }
}
