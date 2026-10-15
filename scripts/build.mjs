import { rmSync } from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

const extensionHost = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // vscode is provided at runtime; ws treats its native add-ons as optional.
  external: ['vscode', 'bufferutil', 'utf-8-validate'],
};

const webviews = {
  ...shared,
  entryPoints: {
    player: 'src/webview/player/main.ts',
    chat: 'src/webview/chat/main.ts',
  },
  outdir: 'dist',
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
};

rmSync('dist', { recursive: true, force: true });

if (watch) {
  const contexts = await Promise.all([esbuild.context(extensionHost), esbuild.context(webviews)]);
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all([esbuild.build(extensionHost), esbuild.build(webviews)]);
}
