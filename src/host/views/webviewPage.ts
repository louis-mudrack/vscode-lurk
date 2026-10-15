import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

export interface WebviewPageOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  title: string;
  scriptPath: string;
  stylesheetPath: string;
  connectSources: string[];
  allowWasm: boolean;
}

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** The UI language as a safe `lang` attribute value. */
function uiLanguage(): string {
  return LANGUAGE_TAG.test(vscode.env.language) ? vscode.env.language : 'en';
}

/**
 * The extension's translations for the current UI language, embedded as an
 * inert JSON block for `@vscode/l10n` in the webview. `<` is escaped so the
 * content can never close the script element.
 */
function translationsJson(): string {
  return JSON.stringify(vscode.l10n.bundle ?? {}).replace(/</g, '\\u003c');
}

export function localResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [vscode.Uri.joinPath(extensionUri, 'dist'), vscode.Uri.joinPath(extensionUri, 'media')];
}

export function renderWebviewPage(options: WebviewPageOptions): string {
  const { webview, extensionUri } = options;
  const nonce = randomBytes(16).toString('base64');
  const asset = (path: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, path));
  const scriptSources = [`'nonce-${nonce}'`, ...(options.allowWasm ? ["'wasm-unsafe-eval'"] : [])];
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data: blob:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src ${scriptSources.join(' ')}`,
    `media-src ${webview.cspSource} blob:`,
    `connect-src ${options.connectSources.join(' ')}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="${uiLanguage()}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${asset(options.stylesheetPath).toString()}">
  <title>${options.title}</title>
</head>
<body>
  <div id="app"></div>
  <script type="application/json" id="l10n">${translationsJson()}</script>
  <script nonce="${nonce}" src="${asset(options.scriptPath).toString()}"></script>
</body>
</html>`;
}
