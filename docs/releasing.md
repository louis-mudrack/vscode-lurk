# Releasing

Maintainer notes for publishing a new version of Lurk.

## Steps

1. Update `CHANGELOG.md` and bump `version` in `package.json`.
2. Tag the commit: `git tag v0.2.0 && git push --tags`.
3. The release workflow checks the build and attaches the `.vsix` to a GitHub release.
4. Publish that `.vsix` to the Visual Studio Marketplace, by hand or automatically (below).

The `publisher` field in `package.json` must be the ID of a publisher you own on the
[Marketplace management page](https://marketplace.visualstudio.com/manage).

## Publishing by hand

On the [management page](https://marketplace.visualstudio.com/manage), open the publisher. The
first time, choose **New extension → Visual Studio Code** and upload the `.vsix`; for later
versions, open the extension's **…** menu and choose **Update**. No token is needed.

## Publishing automatically with Microsoft Entra ID

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

## Twitch application for signing in

Signing in uses Twitch's device code flow with Lurk's own Twitch application. It is a public client,
so it has no secret and its client ID can live in the source code. One-time setup:

1. Open the [Twitch developer console](https://dev.twitch.tv/console/apps) (it requires two-factor
   authentication on your Twitch account) and choose **Register Your Application**.
2. Name it e.g. `Lurk for VS Code` – Twitch rejects names containing "Twitch". Enter
   `http://localhost` as OAuth redirect URL (the device code flow does not use it, but the field is
   required), pick the category **Application Integration** and the client type **Public**.
3. Open the application with **Manage** and copy its **Client ID** into `LURK_CLIENT_ID` in
   `src/host/auth/twitchApp.ts`.

Until then, signing in only works after entering a client ID in the `twitchPlayer.twitchClientId`
setting.
