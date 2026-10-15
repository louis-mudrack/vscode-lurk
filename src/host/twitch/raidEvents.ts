export interface RaidTarget {
  id: string;
  login: string;
  displayName: string;
}

export type RaidEvent =
  | { kind: 'prepared'; raidId: string; target: RaidTarget }
  | { kind: 'executed'; raidId: string; target: RaidTarget }
  | { kind: 'cancelled'; raidId: string };

const PREPARED_TYPES = new Set(['raid_update', 'raid_update_v2']);
const EXECUTED_TYPES = new Set(['raid_go', 'raid_go_v2']);
const CANCELLED_TYPES = new Set(['raid_cancel', 'raid_cancel_v2']);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function parseIfString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Hermes forwards legacy PubSub payloads, sometimes still wrapped in the old
 * `{ data: { message: "<json>" } }` envelope and sometimes as a JSON string, so
 * unwrap until we reach the object that carries the raid `type`.
 */
function unwrapPayload(value: unknown, depth = 0): JsonObject | undefined {
  const parsed = parseIfString(value);
  if (!isObject(parsed) || depth > 4) {
    return undefined;
  }
  if (typeof parsed['type'] === 'string' && isObject(parsed['raid'])) {
    return parsed;
  }
  for (const key of ['pubsub', 'message', 'data', 'notification']) {
    if (key in parsed) {
      const inner = unwrapPayload(parsed[key], depth + 1);
      if (inner) {
        return inner;
      }
    }
  }
  return undefined;
}

function readTarget(raid: JsonObject): RaidTarget | undefined {
  const login = raid['target_login'];
  if (typeof login !== 'string' || login.length === 0) {
    return undefined;
  }
  const displayName = raid['target_display_name'];
  const id = raid['target_id'];
  return {
    id: typeof id === 'string' ? id : '',
    login: login.toLowerCase(),
    displayName: typeof displayName === 'string' && displayName ? displayName : login,
  };
}

export function parseRaidEvent(payload: unknown): RaidEvent | undefined {
  const message = unwrapPayload(payload);
  if (!message) {
    return undefined;
  }
  const type = message['type'] as string;
  const raid = message['raid'] as JsonObject;
  const raidId = typeof raid['id'] === 'string' ? raid['id'] : '';

  if (CANCELLED_TYPES.has(type)) {
    return { kind: 'cancelled', raidId };
  }
  const target = readTarget(raid);
  if (!target) {
    return undefined;
  }
  if (EXECUTED_TYPES.has(type)) {
    return { kind: 'executed', raidId, target };
  }
  if (PREPARED_TYPES.has(type)) {
    return { kind: 'prepared', raidId, target };
  }
  return undefined;
}
