import { describe, expect, it, vi } from 'vitest';
import {
  DeviceCodeExpiredError,
  SignInCancelledError,
  waitForAuthorization,
  type DeviceFlowTiming,
} from '../../src/host/auth/deviceFlow';
import type { DevicePollResult, TokenSet } from '../../src/host/auth/oauthClient';

const code = {
  deviceCode: 'device',
  userCode: 'ABCD-EFGH',
  verificationUri: 'https://www.twitch.tv/activate',
  expiresInSeconds: 60,
  intervalSeconds: 5,
};
const tokens: TokenSet = { accessToken: 'a', refreshToken: 'r', expiresAt: 1, scopes: [] };

function fakeTiming(): DeviceFlowTiming & { waits: number[] } {
  let now = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => now,
    sleep: (ms) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
  };
}

function polls(...results: DevicePollResult[]) {
  const poll = vi.fn<(deviceCode: string) => Promise<DevicePollResult>>();
  for (const result of results) {
    poll.mockResolvedValueOnce(result);
  }
  return poll;
}

describe('waitForAuthorization', () => {
  it('polls at the given interval until the user confirmed', async () => {
    const timing = fakeTiming();
    const poll = polls({ kind: 'pending' }, { kind: 'authorized', tokens });
    await expect(
      waitForAuthorization(code, poll, { isCancellationRequested: false }, timing),
    ).resolves.toBe(tokens);
    expect(poll).toHaveBeenCalledWith('device');
    expect(timing.waits).toEqual([5000, 5000]);
  });

  it('backs off when Twitch asks to slow down', async () => {
    const timing = fakeTiming();
    const poll = polls({ kind: 'slowDown' }, { kind: 'authorized', tokens });
    await waitForAuthorization(code, poll, { isCancellationRequested: false }, timing);
    expect(timing.waits).toEqual([5000, 10000]);
  });

  it('stops when the user cancels', async () => {
    const poll = polls({ kind: 'pending' });
    await expect(
      waitForAuthorization(code, poll, { isCancellationRequested: true }, fakeTiming()),
    ).rejects.toBeInstanceOf(SignInCancelledError);
    expect(poll).not.toHaveBeenCalled();
  });

  it('gives up once the code expired', async () => {
    const poll = vi.fn(() => Promise.resolve<DevicePollResult>({ kind: 'pending' }));
    await expect(
      waitForAuthorization(code, poll, { isCancellationRequested: false }, fakeTiming()),
    ).rejects.toBeInstanceOf(DeviceCodeExpiredError);
    expect(poll).toHaveBeenCalledTimes(12);
  });
});
