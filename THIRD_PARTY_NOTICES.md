# Third-party notices

The packaged extension bundles the following packages.

| Package                                                                     | License           | Used for                                |
| --------------------------------------------------------------------------- | ----------------- | --------------------------------------- |
| [hls.js](https://github.com/video-dev/hls.js)                               | Apache-2.0        | HLS playback in the player webview      |
| [@wasm-audio-decoders/aac](https://github.com/eshaz/wasm-audio-decoders)    | MIT               | WebAssembly AAC decoder wrapper         |
| [FAAD2](https://github.com/knik0/faad2) (compiled into the decoder above)   | GPL-2.0-or-later  | The AAC decoder itself                  |
| [@wasm-audio-decoders/common](https://github.com/eshaz/wasm-audio-decoders) | MIT               | Shared WebAssembly decoder runtime      |
| [codec-parser](https://github.com/eshaz/codec-parser)                       | LGPL-3.0-or-later | Bundled by the AAC decoder              |
| [ws](https://github.com/websockets/ws)                                      | MIT               | WebSocket client for raid notifications |

FAAD2 is licensed under the GPL. If you redistribute a build of this extension (for example on the
Visual Studio Marketplace), make sure the distribution complies with the GPL, or replace the AAC
decoder with one under a compatible license.
