import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as OAuthClient from '../../src/host/auth/oauthClient';
import { OAuthError, refreshTokens, validateToken } from '../../src/host/auth/oauthClient';
import type { SessionStore, StoredSession } from '../../src/host/auth/tokenStore';
import { NotSignedInError, TwitchAuth } from '../../src/host/auth/twitchAuth';
import { HttpError } from '../../src/host/net/fetchWithTimeout';

vi.mock('../../src/host/auth/oauthClient', async (importOriginal) => ({
  ...(await importOriginal<typeof OAuthClient>()),
  refreshTokens: vi.fn(),
  validateToken: vi.fn(),
  revokeToken: vi.fn(() => Promise.resolve()),
}));

const account = { id: '1', login: 'lena', displayName: 'Lena', profileImageUrl: '' };
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };

function storedSession(expiresInMs: number, accessToken = 'old'): StoredSession {
  return {
    clientId: 'client',
    account,
    tokens: {
      accessToken,
      refreshToken: `${accessToken}-refresh`,
      expiresAt: Date.now() + expiresInMs,
      scopes: ['user:read:follows'],
    },
  };
}

function memoryStore(initial?: StoredSession): SessionStore & { current?: StoredSession } {
  const store: SessionStore & { current?: StoredSession } = {
    load: () => Promise.resolve(store.current),
    save: (session) => {
      store.current = session;
      return Promise.resolve();
    },
    clear: () => {
      delete store.current;
      return Promise.resolve();
    },
  };
  if (initial) {
    store.current = initial;
  }
  return store;
}

const freshTokens = (accessToken: string) => ({
  accessToken,
  refreshToken: `${accessToken}-refresh`,
  expiresAt: Date.now() + 3_600_000,
  scopes: ['user:read:follows'],
});

describe('TwitchAuth', () => {
  const auths: TwitchAuth[] = [];
  const create = (store: SessionStore, clientId = 'client') => {
    const auth = new TwitchAuth(store, () => clientId, ['user:read:follows'], silentLog);
    auths.push(auth);
    return auth;
  };

  beforeEach(() => {
    vi.mocked(validateToken).mockResolvedValue({ userId: '1', login: 'lena', scopes: [] });
  });
  afterEach(() => {
    auths.splice(0).forEach((auth) => auth.dispose());
    vi.mocked(refreshTokens).mockReset();
  });

  it('restores a stored session', async () => {
    const auth = create(memoryStore(storedSession(3_600_000)));
    await auth.initialize();
    expect(auth.account).toEqual(account);
  });

  it('forgets sessions issued to a different client', async () => {
    const store = memoryStore(storedSession(3_600_000));
    const auth = create(store, 'another-client');
    await auth.initialize();
    expect(auth.account).toBeUndefined();
    expect(store.current).toBeUndefined();
  });

  it('refreshes a token about to expire once, even for concurrent requests', async () => {
    const store = memoryStore(storedSession(60_000));
    const auth = create(store);
    await auth.initialize();
    vi.mocked(refreshTokens).mockResolvedValue(freshTokens('new'));
    const seen = await Promise.all([
      auth.withCredentials((credentials) => Promise.resolve(credentials.accessToken)),
      auth.withCredentials((credentials) => Promise.resolve(credentials.accessToken)),
    ]);
    expect(seen).toEqual(['new', 'new']);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(refreshTokens).toHaveBeenCalledWith('client', 'old-refresh');
    expect(store.current?.tokens.accessToken).toBe('new');
  });

  it('retries a request once with a refreshed token after a 401', async () => {
    const auth = create(memoryStore(storedSession(3_600_000)));
    await auth.initialize();
    vi.mocked(refreshTokens).mockResolvedValue(freshTokens('new'));
    const request = vi.fn((credentials: { accessToken: string }) =>
      credentials.accessToken === 'old'
        ? Promise.reject(new HttpError(401, 'unauthorized'))
        : Promise.resolve('ok'),
    );
    await expect(auth.withCredentials(request)).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('ends the session when Twitch rejects the refresh token', async () => {
    const store = memoryStore(storedSession(60_000));
    const auth = create(store);
    await auth.initialize();
    const expired = vi.fn();
    auth.onDidExpire(expired);
    vi.mocked(refreshTokens).mockRejectedValue(new OAuthError(400, 'Invalid refresh token'));
    await expect(
      auth.withCredentials((credentials) => Promise.resolve(credentials.accessToken)),
    ).rejects.toBeInstanceOf(NotSignedInError);
    expect(auth.account).toBeUndefined();
    expect(store.current).toBeUndefined();
    expect(expired).toHaveBeenCalledOnce();
  });

  it('keeps the session when refreshing fails for network reasons', async () => {
    const auth = create(memoryStore(storedSession(60_000)));
    await auth.initialize();
    vi.mocked(refreshTokens).mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      auth.withCredentials((credentials) => Promise.resolve(credentials.accessToken)),
    ).rejects.toBeInstanceOf(TypeError);
    expect(auth.account).toEqual(account);
  });

  it('refreshes right away when the hourly validation finds a revoked token', async () => {
    vi.mocked(validateToken).mockResolvedValue(null);
    vi.mocked(refreshTokens).mockResolvedValue(freshTokens('new'));
    const store = memoryStore(storedSession(3_600_000));
    const auth = create(store);
    await auth.initialize();
    expect(store.current?.tokens.accessToken).toBe('new');
  });
});
