import { fetchWithTimeout } from '../net/fetchWithTimeout';

const OAUTH_BASE = 'https://id.twitch.tv/oauth2';
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const HTTP_UNAUTHORIZED = 401;

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scopes: string[];
}

export interface TokenInfo {
  userId: string;
  login: string;
  scopes: string[];
}

export type DevicePollResult =
  { kind: 'authorized'; tokens: TokenSet } | { kind: 'pending' | 'slowDown' };

/** Twitch's OAuth server rejected a request; `message` is Twitch's own reason. */
export class OAuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string[];
}

interface ErrorResponse {
  status?: number;
  message?: string;
}

async function post<T>(path: string, form: Record<string, string>): Promise<T> {
  const response = await fetchWithTimeout(`${OAUTH_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as T & ErrorResponse;
  if (!response.ok) {
    throw new OAuthError(response.status, body.message ?? response.statusText);
  }
  return body;
}

function toTokenSet(response: TokenResponse, now = Date.now()): TokenSet {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: now + response.expires_in * 1000,
    scopes: response.scope ?? [],
  };
}

export async function requestDeviceCode(clientId: string, scopes: string[]): Promise<DeviceCode> {
  const body = await post<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }>('device', { client_id: clientId, scopes: scopes.join(' ') });
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresInSeconds: body.expires_in,
    intervalSeconds: body.interval,
  };
}

/** One poll of the device-code grant; Twitch answers 400 until the user has confirmed. */
export async function pollDeviceToken(
  clientId: string,
  scopes: string[],
  deviceCode: string,
): Promise<DevicePollResult> {
  try {
    const body = await post<TokenResponse>('token', {
      client_id: clientId,
      scopes: scopes.join(' '),
      device_code: deviceCode,
      grant_type: DEVICE_CODE_GRANT,
    });
    return { kind: 'authorized', tokens: toTokenSet(body) };
  } catch (error) {
    if (error instanceof OAuthError && error.message === 'authorization_pending') {
      return { kind: 'pending' };
    }
    if (error instanceof OAuthError && error.message === 'slow_down') {
      return { kind: 'slowDown' };
    }
    throw error;
  }
}

/** Public clients refresh without a secret; each refresh token works only once. */
export async function refreshTokens(clientId: string, refreshToken: string): Promise<TokenSet> {
  const body = await post<TokenResponse>('token', {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return toTokenSet(body);
}

/** Twitch asks apps to validate tokens hourly; `null` means the token is no longer valid. */
export async function validateToken(accessToken: string): Promise<TokenInfo | null> {
  const response = await fetchWithTimeout(`${OAUTH_BASE}/validate`, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (response.status === HTTP_UNAUTHORIZED) {
    return null;
  }
  if (!response.ok) {
    throw new OAuthError(response.status, response.statusText);
  }
  const body = (await response.json()) as { user_id: string; login: string; scopes?: string[] };
  return { userId: body.user_id, login: body.login, scopes: body.scopes ?? [] };
}

export async function revokeToken(clientId: string, accessToken: string): Promise<void> {
  await post('revoke', { client_id: clientId, token: accessToken });
}
