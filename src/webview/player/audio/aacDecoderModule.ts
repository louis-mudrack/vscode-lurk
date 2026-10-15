import { pageAsset } from '../../common/pageAssets';

let modulePromise: Promise<WebAssembly.Module> | undefined;

async function compileFromPage(): Promise<WebAssembly.Module> {
  const url = pageAsset('aacDecoder');
  if (!url) {
    throw new Error('The page does not reference the AAC decoder');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Loading the AAC decoder failed: ${response.status}`);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

/**
 * The AAC decoder's WebAssembly ships as its own file; the build points the
 * decoder library here instead of at its inlined copy (scripts/aacDecoderWasm.mjs).
 */
export function loadAacDecoderModule(): Promise<WebAssembly.Module> {
  modulePromise ??= compileFromPage();
  return modulePromise;
}
