// Opt-in end-to-end check against a real stream: `npm run test:e2e [-- <channel or video link>]`.
// Downloads VS Code unless VSCODE_EXECUTABLE points at an installed build.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

async function pickLiveChannel() {
  const response = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': CLIENT_ID },
    body: JSON.stringify({
      query: 'query { streams(first: 1) { edges { node { broadcaster { login } } } } }',
    }),
  });
  const body = await response.json();
  return body.data.streams.edges[0].node.broadcaster.login;
}

const root = resolve(import.meta.dirname, '../..');
const channel = process.argv[2] ?? (await pickLiveChannel());
const profile = mkdtempSync(join(tmpdir(), 'twitch-player-e2e-'));
console.log(`E2E: watching ${channel}`);

await runTests({
  ...(process.env.VSCODE_EXECUTABLE ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE } : {}),
  extensionDevelopmentPath: root,
  extensionTestsPath: join(root, 'test/e2e/suite.cjs'),
  launchArgs: [
    root,
    `--user-data-dir=${join(profile, 'data')}`,
    `--extensions-dir=${join(profile, 'extensions')}`,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    // Electron refuses to start as root (e.g. in containers) without this.
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
  ],
  extensionTestsEnv: {
    E2E_CHANNEL: channel,
    ...(process.env.E2E_REPORT ? { E2E_REPORT: process.env.E2E_REPORT } : {}),
    ...(process.env.E2E_EXPECT_AUDIO ? { E2E_EXPECT_AUDIO: process.env.E2E_EXPECT_AUDIO } : {}),
    ...(process.env.E2E_SAMPLES ? { E2E_SAMPLES: process.env.E2E_SAMPLES } : {}),
    ...(process.env.E2E_BACKGROUND ? { E2E_BACKGROUND: process.env.E2E_BACKGROUND } : {}),
  },
});
