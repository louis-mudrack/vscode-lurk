// Runs inside the VS Code extension host (loaded via --extensionTestsPath).
const assert = require('node:assert');
const { writeFileSync } = require('node:fs');
const vscode = require('vscode');

const SAMPLE_INTERVAL_MS = 2_000;
const SAMPLE_COUNT = Number(process.env.E2E_SAMPLES ?? 20);
const MIN_PLAYED_SECONDS = 10;
const REOPEN_SAMPLE_COUNT = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.run = async function run() {
  const channel = process.env.E2E_CHANNEL;
  assert.ok(channel, 'E2E_CHANNEL must name a live Twitch channel or link a video');
  const isVideo = channel.includes('/videos/');

  await vscode.commands.executeCommand('workbench.view.explorer');
  await vscode.commands.executeCommand('twitchPlayer.player.focus');
  await vscode.commands.executeCommand('twitchPlayer.chat.focus');
  await vscode.commands.executeCommand('twitchPlayer.openChannel', channel);

  const samples = [];
  const sample = async (phase) => {
    await sleep(SAMPLE_INTERVAL_MS);
    const diagnostics = await vscode.commands.executeCommand('twitchPlayer.diagnostics');
    samples.push({ at: Date.now(), phase, ...(diagnostics ?? {}) });
  };
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    await sample('visible');
  }
  if (process.env.E2E_BACKGROUND) {
    // The stream should keep going while the sidebar shows another view.
    await vscode.commands.executeCommand('workbench.view.search');
    for (let i = 0; i < 10; i++) {
      await sample('hidden');
    }
    await vscode.commands.executeCommand('workbench.view.explorer');
    for (let i = 0; i < 5; i++) {
      await sample('visible-again');
    }
  }
  // Reopening builds a new MediaSource and AAC decoder, like a raid or channel switch does.
  await vscode.commands.executeCommand('twitchPlayer.openChannel', channel);
  for (let i = 0; i < REOPEN_SAMPLE_COUNT; i++) {
    await sample('reopened');
  }
  if (process.env.E2E_REPORT) {
    writeFileSync(process.env.E2E_REPORT, JSON.stringify(samples, null, 2));
  }

  const playing = samples.filter(
    (sample) => sample.phase !== 'reopened' && typeof sample.videoTime === 'number',
  );
  assert.ok(playing.length > 2, 'the player never reported diagnostics');
  const first = playing[0];
  const last = playing[playing.length - 1];
  assert.ok(
    last.videoTime - first.videoTime >= MIN_PLAYED_SECONDS,
    `video did not advance (${first.videoTime} -> ${last.videoTime})`,
  );
  assert.strictEqual(last.audioDecodeFailures, 0, 'some AAC segments could not be decoded');
  if (!isVideo) {
    assert.strictEqual(last.raidWatcherConnected, true, 'the raid watcher never subscribed');
  }
  assert.ok(
    last.audioDecodedBytes === null || last.audioDecodedBytes > first.audioDecodedBytes,
    'Chromium did not decode the transcoded audio track',
  );
  // The first samples after reopening can still describe the previous playback.
  const reopened = samples.filter((sample) => sample.phase === 'reopened').slice(-4);
  const [reopenedFirst] = reopened;
  const reopenedLast = reopened[reopened.length - 1];
  assert.ok(
    reopenedFirst &&
      reopenedLast &&
      reopenedLast.readyState >= 3 &&
      reopenedLast.videoTime > reopenedFirst.videoTime &&
      (reopenedLast.audioDecodedBytes === null ||
        reopenedLast.audioDecodedBytes > reopenedFirst.audioDecodedBytes),
    'playback did not recover after reopening',
  );
  // Webviews only unmute after a user gesture, so this needs someone (or xdotool) to click the player.
  if (process.env.E2E_EXPECT_AUDIO) {
    assert.strictEqual(last.audioMuted, false, 'audio stayed muted');
  }
};
