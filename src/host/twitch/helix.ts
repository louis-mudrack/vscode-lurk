import { fetchWithTimeout, HttpError } from '../net/fetchWithTimeout';

const HELIX_BASE = 'https://api.twitch.tv/helix';
const MAX_PAGE_SIZE = 100;

export interface HelixCredentials {
  clientId: string;
  accessToken: string;
}

interface HelixPage<T> {
  data: T[];
  pagination?: { cursor?: string };
}

function headers(credentials: HelixCredentials): Record<string, string> {
  return {
    'Client-Id': credentials.clientId,
    Authorization: `Bearer ${credentials.accessToken}`,
  };
}

async function readJson<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    throw new HttpError(response.status, `${response.status} ${response.statusText} for ${path}`);
  }
  return (await response.json()) as T;
}

/** Twitch's official API, for everything that needs the signed-in user. */
export const HELIX_MAX_IDS_PER_REQUEST = MAX_PAGE_SIZE;

export async function helixGet<T>(
  path: string,
  params: URLSearchParams,
  credentials: HelixCredentials,
): Promise<T> {
  const response = await fetchWithTimeout(`${HELIX_BASE}/${path}?${params.toString()}`, {
    headers: headers(credentials),
  });
  return readJson<T>(response, path);
}

export async function helixPost<T>(
  path: string,
  body: unknown,
  credentials: HelixCredentials,
): Promise<T> {
  const response = await fetchWithTimeout(`${HELIX_BASE}/${path}`, {
    method: 'POST',
    headers: { ...headers(credentials), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<T>(response, path);
}

export interface PaginationOptions {
  maxPages: number;
  /** Some endpoints reject `first`; they page at their own size. */
  sendPageSize?: boolean;
}

/** Follows Helix's cursor pagination, at most `maxPages` requests. */
export async function helixGetAll<T>(
  path: string,
  params: URLSearchParams,
  credentials: HelixCredentials,
  { maxPages, sendPageSize = true }: PaginationOptions,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const pageParams = new URLSearchParams(params);
    if (sendPageSize) {
      pageParams.set('first', String(MAX_PAGE_SIZE));
    }
    if (cursor) {
      pageParams.set('after', cursor);
    }
    const response = await helixGet<HelixPage<T>>(path, pageParams, credentials);
    items.push(...response.data);
    cursor = response.pagination?.cursor;
    if (!cursor || response.data.length === 0) {
      break;
    }
  }
  return items;
}
