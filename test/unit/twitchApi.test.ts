import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuthError, pollDeviceToken } from '../../src/host/auth/oauthClient';
import { helixGetAll } from '../../src/host/twitch/helix';

const credentials = { clientId: 'client', accessToken: 'token' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('helixGetAll', () => {
  it('follows cursors with the app and user credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [1, 2], pagination: { cursor: 'next' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [3], pagination: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const items = await helixGetAll<number>(
      'channels/followed',
      new URLSearchParams({ user_id: '1' }),
      credentials,
      { maxPages: 5 },
    );
    expect(items).toEqual([1, 2, 3]);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe('https://api.twitch.tv/helix/channels/followed?user_id=1&first=100');
    expect(firstInit.headers).toEqual({ 'Client-Id': 'client', Authorization: 'Bearer token' });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('after=next');
  });

  it('stops after the page limit and can leave out the page size', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ data: [1], pagination: { cursor: 'more' } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await helixGetAll('chat/emotes/user', new URLSearchParams(), credentials, {
      maxPages: 2,
      sendPageSize: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('first=');
  });
});

describe('pollDeviceToken', () => {
  it.each([
    ['authorization_pending', 'pending'],
    ['slow_down', 'slowDown'],
  ])('reads %s as %s', async (message, kind) => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ status: 400, message }, 400)));
    await expect(pollDeviceToken('client', ['user:read:follows'], 'code')).resolves.toEqual({
      kind,
    });
  });

  it('returns the tokens once the user confirmed', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        jsonResponse({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          scope: ['user:read:follows'],
        }),
      ),
    );
    const result = await pollDeviceToken('client', ['user:read:follows'], 'code');
    expect(result.kind === 'authorized' && result.tokens.accessToken).toBe('a');
  });

  it('reports other rejections', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(jsonResponse({ status: 400, message: 'invalid device code' }, 400)),
    );
    await expect(pollDeviceToken('client', [], 'code')).rejects.toBeInstanceOf(OAuthError);
  });
});
