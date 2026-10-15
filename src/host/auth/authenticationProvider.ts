import * as vscode from 'vscode';
import type { TwitchAccount } from '../../shared/protocol';
import type { TwitchAuth } from './twitchAuth';

export const AUTH_PROVIDER_ID = 'lurk-twitch';

function toSession(
  account: TwitchAccount,
  accessToken: string,
  scopes: string[],
): vscode.AuthenticationSession {
  return {
    id: account.id,
    accessToken,
    account: { id: account.id, label: account.displayName },
    scopes,
  };
}

/** Lists the Twitch sign-in in VS Code's Accounts menu, where it can also be signed out. */
export class TwitchAuthenticationProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
  private readonly changeEmitter =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  readonly onDidChangeSessions = this.changeEmitter.event;
  private shownSession: vscode.AuthenticationSession | undefined;
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly auth: TwitchAuth,
    private readonly signIn: () => Promise<TwitchAccount | undefined>,
  ) {
    this.subscription = auth.onDidChangeAccount((account) => this.announce(account));
  }

  async getSessions(
    scopes: readonly string[] | undefined,
  ): Promise<vscode.AuthenticationSession[]> {
    const account = this.auth.account;
    const granted = this.auth.grantedScopes;
    if (!account || !(scopes ?? []).every((scope) => granted.includes(scope))) {
      return [];
    }
    const accessToken = await this.auth.withCredentials((credentials) =>
      Promise.resolve(credentials.accessToken),
    );
    return [toSession(account, accessToken, granted)];
  }

  async createSession(): Promise<vscode.AuthenticationSession> {
    const account = await this.signIn();
    const [session] = account ? await this.getSessions(undefined) : [];
    if (!session) {
      throw new Error(vscode.l10n.t('Signing in to Twitch was cancelled.'));
    }
    return session;
  }

  async removeSession(): Promise<void> {
    await this.auth.signOut();
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }

  private announce(account: TwitchAccount | undefined): void {
    const removed = this.shownSession ? [this.shownSession] : [];
    this.shownSession = account ? toSession(account, '', this.auth.grantedScopes) : undefined;
    const added = this.shownSession ? [this.shownSession] : [];
    this.changeEmitter.fire({ added, removed, changed: [] });
  }
}
