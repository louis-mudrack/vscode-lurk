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

## Releasing

1. Update `CHANGELOG.md` and bump `version` in `package.json`.
2. Tag the commit: `git tag v0.2.0 && git push --tags`.
3. The release workflow checks the build and attaches the `.vsix` to a GitHub release.
4. Publish that `.vsix` to the Visual Studio Marketplace, by hand or automatically (below).

The `publisher` field in `package.json` must be the ID of a publisher you own on the
[Marketplace management page](https://marketplace.visualstudio.com/manage).

### Publishing by hand

On the [management page](https://marketplace.visualstudio.com/manage), open the publisher. The
first time, choose **New extension → Visual Studio Code** and upload the `.vsix`; for later
versions, open the extension's **…** menu and choose **Update**. No token is needed.

### Publishing automatically with Microsoft Entra ID

Personal access tokens are no longer an option: since March 15, 2026 Azure DevOps no longer creates
the global ("All accessible organizations") tokens the Marketplace requires, and existing ones stop
working on December 1, 2026. Instead, the `marketplace` job of the release workflow signs in with
GitHub's OIDC token and a managed identity. One-time setup:

1. In the [Azure portal](https://portal.azure.com) (a free account is enough) create a
   **user-assigned managed identity**, e.g. `lurk-publisher`. An app registration does not work:
   it signs in but the Marketplace rejects the upload.
2. On the identity, open **Settings → Federated credentials → Add credential**, choose
   **GitHub Actions deploying Azure resources**, enter the repository owner and name, set the
   entity type to **Environment** and the environment name to `marketplace`.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and
   add `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` with the values from the identity's
   **Settings → Properties** page. The `marketplace` job only runs once `AZURE_CLIENT_ID` exists.
4. Find the ID the Marketplace knows the identity by. Signed in to the Azure CLI as the identity
   (for example in a temporary workflow step after `azure/login`), run

   ```bash
   az rest -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me \
     --resource 499b84ac-1321-427f-aa17-267ca6975798
   ```

   and copy the `id` from the response. The client ID and object ID are _not_ accepted.

5. On the Marketplace management page, open the publisher's **Members**, add that `id` and give it
   the **Contributor** role.

The Marketplace is also working on token-free "trusted publishing" for GitHub Actions
(`vsce publish --oidc`). Once that is available, the Azure steps above can be replaced by a trust
policy on the publisher.

By contributing you agree that your contributions are licensed under the GPL-3.0-or-later.
