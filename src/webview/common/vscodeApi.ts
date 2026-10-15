interface VsCodeApi<TMessage> {
  postMessage(message: TMessage): void;
}

declare function acquireVsCodeApi<TMessage>(): VsCodeApi<TMessage>;

let api: VsCodeApi<unknown> | undefined;

/** `acquireVsCodeApi` may only be called once per webview. */
export function vscodeApi<TMessage>(): VsCodeApi<TMessage> {
  api ??= acquireVsCodeApi<unknown>();
  return api;
}

export function onHostMessage<TMessage>(handler: (message: TMessage) => void): void {
  window.addEventListener('message', (event: MessageEvent<TMessage>) => handler(event.data));
}
