let assets: Record<string, string> | undefined;

/** The webview URL of an extension file the host listed for this page (see `renderWebviewPage`). */
export function pageAsset(name: string): string | undefined {
  assets ??= JSON.parse(document.getElementById('assets')?.textContent || '{}') as Record<
    string,
    string
  >;
  return assets[name];
}
