import type { DeviceCode, DevicePollResult, TokenSet } from './oauthClient';

/** RFC 8628: after `slow_down`, wait this much longer between polls. */
const SLOW_DOWN_STEP_SECONDS = 5;

export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
}

export class SignInCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'SignInCancelledError';
  }
}

export class DeviceCodeExpiredError extends Error {
  constructor() {
    super('The sign-in code expired');
    this.name = 'DeviceCodeExpiredError';
  }
}

export interface DeviceFlowTiming {
  sleep(ms: number): Promise<void>;
  now(): number;
}

const realTiming: DeviceFlowTiming = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

/** Polls until the user confirmed the code on twitch.tv, cancelled, or the code expired. */
export async function waitForAuthorization(
  code: DeviceCode,
  poll: (deviceCode: string) => Promise<DevicePollResult>,
  cancellation: CancellationSignal,
  timing: DeviceFlowTiming = realTiming,
): Promise<TokenSet> {
  const deadline = timing.now() + code.expiresInSeconds * 1000;
  let intervalSeconds = code.intervalSeconds;
  while (timing.now() < deadline) {
    await timing.sleep(intervalSeconds * 1000);
    if (cancellation.isCancellationRequested) {
      throw new SignInCancelledError();
    }
    const result = await poll(code.deviceCode);
    if (result.kind === 'authorized') {
      return result.tokens;
    }
    if (result.kind === 'slowDown') {
      intervalSeconds += SLOW_DOWN_STEP_SECONDS;
    }
  }
  throw new DeviceCodeExpiredError();
}
