import * as vscode from 'vscode';
import { NotSignedInError, type TwitchAuth } from '../auth/twitchAuth';
import { HttpError } from '../net/fetchWithTimeout';
import { sendChatMessage } from '../twitch/chatMessages';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

function sendErrorMessage(error: unknown): string {
  if (error instanceof NotSignedInError) {
    return vscode.l10n.t('Sign in with Twitch to chat.');
  }
  if (
    error instanceof HttpError &&
    (error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN)
  ) {
    return vscode.l10n.t('Twitch did not allow sending. Sign out and sign in again.');
  }
  if (error instanceof HttpError && error.status === HTTP_TOO_MANY_REQUESTS) {
    return vscode.l10n.t('You are sending messages too fast.');
  }
  return vscode.l10n.t('The message could not be sent. Check your connection.');
}

/** Sends as the signed-in user and resolves with a line for the chat if that did not work. */
export async function sendAsUser(
  auth: TwitchAuth,
  broadcasterId: string,
  text: string,
): Promise<string | null> {
  try {
    const outcome = await auth.withCredentials((credentials, account) =>
      sendChatMessage(credentials, broadcasterId, account.id, text),
    );
    if (outcome.sent) {
      return null;
    }
    return outcome.reason
      ? vscode.l10n.t('Not sent: {0}', outcome.reason)
      : vscode.l10n.t('Twitch did not deliver the message.');
  } catch (error) {
    return sendErrorMessage(error);
  }
}
