import * as vscode from 'vscode';
import type { TwitchAccount } from '../../shared/protocol';
import { DeviceCodeExpiredError, SignInCancelledError } from './deviceFlow';
import { MissingClientIdError, type DeviceCodePrompt, type TwitchAuth } from './twitchAuth';

const CLIENT_ID_SETTING = 'twitchPlayer.twitchClientId';

/** Opens twitch.tv's activation page with the code filled in and waits in a cancellable notification. */
const promptDeviceCode: DeviceCodePrompt = async (code, waitForTokens) =>
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Signing in to Twitch'),
      cancellable: true,
    },
    async (progress, cancellation) => {
      progress.report({
        message: vscode.l10n.t('Confirm the code {0} on twitch.tv.', code.userCode),
      });
      void vscode.env.openExternal(vscode.Uri.parse(code.verificationUri));
      return waitForTokens(cancellation);
    },
  );

async function explainMissingClientId(): Promise<void> {
  const openSettings = vscode.l10n.t('Open Settings');
  const choice = await vscode.window.showErrorMessage(
    vscode.l10n.t('Signing in needs a Twitch application. Enter its client ID in the settings.'),
    openSettings,
  );
  if (choice === openSettings) {
    await vscode.commands.executeCommand('workbench.action.openSettings', CLIENT_ID_SETTING);
  }
}

/** Runs the sign-in and reports problems; resolves with nothing if it did not work out. */
export async function signInWithTwitch(auth: TwitchAuth): Promise<TwitchAccount | undefined> {
  try {
    const account = await auth.signIn(promptDeviceCode);
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Signed in to Twitch as {0}.', account.displayName),
    );
    return account;
  } catch (error) {
    if (error instanceof SignInCancelledError) {
      return undefined;
    }
    if (error instanceof MissingClientIdError) {
      await explainMissingClientId();
    } else if (error instanceof DeviceCodeExpiredError) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('The sign-in code expired. Please try again.'),
      );
    } else {
      const reason = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(
        vscode.l10n.t('Signing in to Twitch failed: {0}', reason),
      );
    }
    return undefined;
  }
}
