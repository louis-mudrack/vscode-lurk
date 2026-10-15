# Third-party notices

The packaged extension bundles the following open-source components. Their licenses are
compatible with Lurk's license, the GNU General Public License v3.0 or later.

| Component                                                                   | License           | Used for                                |
| --------------------------------------------------------------------------- | ----------------- | --------------------------------------- |
| [hls.js](https://github.com/video-dev/hls.js)                               | Apache-2.0        | HLS playback in the player webview      |
| [@wasm-audio-decoders/aac](https://github.com/eshaz/wasm-audio-decoders)    | MIT               | WebAssembly AAC decoder wrapper         |
| [FAAD2](https://github.com/knik0/faad2) (compiled into the decoder above)   | GPL-2.0-or-later  | Decoding Twitch's AAC audio             |
| [@wasm-audio-decoders/common](https://github.com/eshaz/wasm-audio-decoders) | MIT               | Shared WebAssembly decoder runtime      |
| [codec-parser](https://github.com/eshaz/codec-parser)                       | LGPL-3.0-or-later | Bundled by the AAC decoder              |
| [@vscode/l10n](https://github.com/microsoft/vscode-l10n)                    | MIT               | Translations inside the webviews        |
| [ws](https://github.com/websockets/ws)                                      | MIT               | WebSocket client for raid notifications |

The complete source code of the bundled components is available from the linked repositories and,
for the exact versions used, through `package-lock.json`.
