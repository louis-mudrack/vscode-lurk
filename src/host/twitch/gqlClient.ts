import { fetchJson } from '../net/fetchWithTimeout';

/** The public client id of twitch.tv itself; anonymous read-only GQL calls are accepted with it. */
export const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL_ENDPOINT = 'https://gql.twitch.tv/gql';

interface GqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export async function gqlQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetchJson<GqlResponse<T>>(GQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Client-ID': TWITCH_WEB_CLIENT_ID, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ query, variables }),
  });
  if (response.errors?.length) {
    throw new Error(`Twitch GQL error: ${response.errors.map((e) => e.message).join('; ')}`);
  }
  if (!response.data) {
    throw new Error('Twitch GQL returned no data');
  }
  return response.data;
}
