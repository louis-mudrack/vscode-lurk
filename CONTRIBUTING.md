# Contributing to Lurk

Thanks for helping! Bug reports, ideas, translations and pull requests are all welcome. Please
follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs

Open an [issue](https://github.com/louis-mudrack/twitch-video-player-vsc-extension/issues/new/choose)
with your VS Code version, operating system and the channel you watched. The **Lurk** output channel
(_View → Output_, then pick “Lurk” from the list) usually shows what went wrong – please include
its content.

## Development setup

You need Node.js 22 and VS Code.

```bash
npm install
npm run watch      # rebuilds on every change
```

Press <kbd>F5</kbd> in VS Code to start an Extension Development Host with your build.

| Command            | What it does                                                               |
| ------------------ | -------------------------------------------------------------------------- |
| `npm run check`    | Typecheck, lint, format check and unit tests – run before every PR.        |
| `npm run format`   | Format all files with Prettier.                                            |
| `npm run l10n`     | Re-extract the English UI strings into `l10n/bundle.l10n.json`.            |
| `npm run test:e2e` | Play a real live stream inside VS Code and check playback (needs network). |
| `npm run package`  | Build a `.vsix`.                                                           |

`npm run test:e2e -- <channel>` watches a specific channel; without one it picks the most watched
live channel. VS Code only unmutes after a click, so the test checks that audio is decoded but not
that it is unmuted unless `E2E_EXPECT_AUDIO=1` is set and something clicks the player.

## Project layout

```
src/extension.ts       activation, commands, wiring
src/host/              extension host: Twitch GQL, playlist proxy, raid watcher, 7TV, views
src/shared/            message protocol and helpers used by host and webviews
src/webview/player/    player webview: hls.js, AAC→FLAC transcoding, UI
src/webview/chat/      chat webview: IRC, emote tokenizing, rendering
l10n/, package.nls*.json  translations
media/                 icons, stylesheets, brand assets (sources in media/brand/src)
test/unit/             Vitest unit tests
test/e2e/              end-to-end test running inside VS Code
```

## Code style

- TypeScript in strict mode; Prettier owns formatting, ESLint must pass.
- Small, focused files with intention-revealing names.
- Comments explain _why_, not _what_.
- Every user-facing string goes through `vscode.l10n.t(...)` (extension host) or `l10n.t(...)` from
  `@vscode/l10n` (webviews). Run `npm run l10n` afterwards and add the new strings to every
  translation – the unit tests fail if a translation is missing.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), e.g.
  `fix(chat): keep zero-width emotes on their base emote`.

## Adding a language

1. Copy `l10n/bundle.l10n.de.json` to `l10n/bundle.l10n.<language>.json` and translate the values
   (keep `{0}`-style placeholders).
2. Copy `package.nls.de.json` to `package.nls.<language>.json` and translate it.
3. Run `npm test` – it checks that every string is translated and every placeholder is kept.

`<language>` is VS Code's language ID, e.g. `fr`, `es`, `pt-br` or `zh-cn`.

By contributing you agree that your contributions are licensed under the GPL-3.0-or-later.
