import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @wasm-audio-decoders/aac inlines its WebAssembly as a compressed string that
 * is unpacked at runtime. Marketplace malware scanners reject JavaScript that
 * carries packed binary payloads, so the build ships the module as a plain
 * .wasm file and points the library at it instead.
 */

const LIBRARY = 'node_modules/@wasm-audio-decoders';
const EMSCRIPTEN_GLUE = /@wasm-audio-decoders[\\/]aac[\\/]src[\\/]EmscriptenWasm\.js$/;
const DECODER_COMMON = /@wasm-audio-decoders[\\/]common[\\/]src[\\/]WASMAudioDecoderCommon\.js$/;
const PACKED_PAYLOAD = /String\.raw`dynEncode[^`]*`/g;
const PACKED_PAYLOAD_MARKER = /dynEncode[0-9a-f]{6}/;
/**
 * Must stay truthy: the library guards `Object.defineProperty(EmscriptenWASM, "wasm", …)`
 * with `if (!EmscriptenWASM.wasm)`, and an empty string makes the second decoder
 * instance redefine the property and throw.
 */
const PAYLOAD_PLACEHOLDER = '"dist/aac-decoder.wasm"';
// eslint-disable-next-line no-control-regex -- finding raw control bytes is the point
const RAW_CONTROL_CHARACTER = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
const MODULE_LOOKUP = 'WASMAudioDecoderCommon.getModule(EmscriptenWASM)';
const MODULE_LOADER = resolve('src/webview/player/audio/aacDecoderModule.ts');

const AAC_DECODER_WASM = 'dist/aac-decoder.wasm';

export async function writeAacDecoderWasm() {
  const importFile = (path) => import(pathToFileURL(resolve(LIBRARY, path)).href);
  const { default: Common } = await importFile('common/src/WASMAudioDecoderCommon.js');
  const { default: EmscriptenWasm } = await importFile('aac/src/EmscriptenWasm.js');
  new Common();
  new EmscriptenWasm(Common);
  const bytes = await Common.inflateDynEncodeString(EmscriptenWasm.wasm);
  await WebAssembly.compile(bytes);
  mkdirSync(dirname(AAC_DECODER_WASM), { recursive: true });
  writeFileSync(AAC_DECODER_WASM, bytes);
}

function stripPayloads(source, file) {
  const stripped = source.replace(PACKED_PAYLOAD, PAYLOAD_PLACEHOLDER);
  if (stripped === source) {
    throw new Error(`No packed WebAssembly found in ${file}; did the decoder library change?`);
  }
  return stripped;
}

export const unpackedAacDecoderPlugin = {
  name: 'unpacked-aac-decoder',
  setup(build) {
    build.onLoad({ filter: EMSCRIPTEN_GLUE }, ({ path }) => {
      const source = stripPayloads(readFileSync(path, 'utf8'), path);
      if (!source.includes(MODULE_LOOKUP)) {
        throw new Error(`Cannot redirect the WebAssembly lookup in ${path}`);
      }
      return {
        contents:
          `import { loadAacDecoderModule } from ${JSON.stringify(MODULE_LOADER)};\n` +
          source.replace(MODULE_LOOKUP, 'loadAacDecoderModule()'),
        loader: 'js',
      };
    });
    build.onLoad({ filter: DECODER_COMMON }, ({ path }) => ({
      contents: stripPayloads(readFileSync(path, 'utf8'), path),
      loader: 'js',
    }));
  },
};

/**
 * esbuild prints escapes such as "\x01" (codec-parser's Vorbis header magic)
 * as raw control bytes. They can only occur inside string, template or regex
 * literals, where the escape sequence means the same, so write them back escaped.
 */
export function escapeControlCharacters(file) {
  const source = readFileSync(file, 'utf8');
  const escaped = source.replace(
    RAW_CONTROL_CHARACTER,
    (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
  if (escaped !== source) {
    writeFileSync(file, escaped);
  }
}

/** Fails the build if a bundle contains binary data or a packed payload again. */
export function assertPlainText(file) {
  const content = readFileSync(file);
  const controlByte = content.findIndex(
    (byte) => byte < 0x20 && ![0x09, 0x0a, 0x0d].includes(byte),
  );
  if (controlByte !== -1 || PACKED_PAYLOAD_MARKER.test(content.toString('latin1'))) {
    throw new Error(`${file} contains binary or packed data (offset ${controlByte})`);
  }
}
