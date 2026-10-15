import { helixPost, type HelixCredentials } from './helix';

interface SendMessageResponse {
  data: {
    is_sent: boolean;
    drop_reason?: { code: string; message: string } | null;
  }[];
}

export type SendOutcome = { sent: true } | { sent: false; reason: string };

/** Sends as the signed-in user; Twitch says why when it drops a message (slow mode, AutoMod, …). */
export async function sendChatMessage(
  credentials: HelixCredentials,
  broadcasterId: string,
  senderId: string,
  message: string,
): Promise<SendOutcome> {
  const { data } = await helixPost<SendMessageResponse>(
    'chat/messages',
    { broadcaster_id: broadcasterId, sender_id: senderId, message },
    credentials,
  );
  const [result] = data;
  return result?.is_sent
    ? { sent: true }
    : { sent: false, reason: result?.drop_reason?.message ?? '' };
}
