import * as vscode from 'vscode';
import type { TwitchAccount } from '../../shared/protocol';
import type { Logger } from '../logger';
import { AUTH_PROVIDER_ID, TwitchAuthenticationProvider } from './authenticationProvider';
import { signInWithTwitch } from './signInFlow';
import { TokenStore } from './tokenStore';
import { TwitchAuth } from './twitchAuth';
import { resolveClientId, TWITCH_SCOPES } from './twitchApp';

const SIGNED_IN_CONTEXT = 'twitchPlayer.signedIn';

export interface TwitchAccountSetup {
  auth: TwitchAuth;
  signIn: () => Promise<TwitchAccount | undefined>;
}

async function offerSignInAgain(signIn: () => Promise<unknown>): Promise<void> {
  const again = vscode.l10n.t('Sign in again');
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t('Your Twitch sign-in has ended.'),
    again,
  );
  if (choice === again) {
    await signIn();
  }
}

/** The optional Twitch sign-in: session, Accounts menu entry, commands and context key. */
export function setUpTwitchAccount(
  context: vscode.ExtensionContext,
  log: Logger,
): TwitchAccountSetup {
  const auth = new TwitchAuth(
    new TokenStore(context.secrets),
    () => resolveClientId(vscode.workspace.getConfiguration('twitchPlayer').get('twitchClientId')),
    TWITCH_SCOPES,
    log,
  );
  const signIn = () => signInWithTwitch(auth);
  const provider = new TwitchAuthenticationProvider(auth, signIn);
  const showSignedIn = (account: TwitchAccount | undefined) =>
    void vscode.commands.executeCommand('setContext', SIGNED_IN_CONTEXT, account !== undefined);

  context.subscriptions.push(
    auth,
    provider,
    vscode.authentication.registerAuthenticationProvider(AUTH_PROVIDER_ID, 'Twitch', provider),
    auth.onDidChangeAccount(showSignedIn),
    auth.onDidExpire(() => void offerSignInAgain(signIn)),
    vscode.commands.registerCommand('twitchPlayer.signIn', signIn),
    vscode.commands.registerCommand('twitchPlayer.signOut', () => auth.signOut()),
  );
  showSignedIn(undefined);
  auth.initialize().catch((error: unknown) => {
    log.warn(`Restoring the Twitch sign-in failed: ${String(error)}`);
  });
  return { auth, signIn };
}
