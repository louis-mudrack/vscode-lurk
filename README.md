# Arbeitszeitbetrug – Twitch Video Player

Watch a Twitch livestream in a small panel in VS Code's Explorer sidebar (right next to Outline
and Timeline), with the stream's chat in a second panel. When the streamer raids someone, the
player follows the raid to the next channel automatically.

## Features

- **Livestream in the sidebar** – enter a channel name (or paste a twitch.tv link) and the stream
  starts in the _Twitch_ panel. Quality picks itself for the panel size; you can pin one too.
- **Follows raids** – when the channel you watch raids another one, player and chat switch to the
  raided channel and show who raided whom. Turn it off with `twitchPlayer.followRaids` and you get a
  notification with a _Watch_ button instead.
- **Chat with 7TV emotes** – the _Twitch Chat_ panel shows the live chat with Twitch emotes, 7TV
  global and channel emotes (including zero-width overlays), badges, mentions and links. Chat is
  read-only.
- **Keeps playing in the background** – collapse the panel, switch the sidebar to Search or Git, or
  minimize VS Code: the sound keeps going.
- **Picture-in-picture** – double-click the video (or use the button) for a floating window.
- **Low latency** – the player sits a few seconds behind live, so the picture matches the chat.
- **Offline channels** – an offline channel starts playing by itself once it goes live.

## Usage

1. Open the Explorer and expand the **Twitch** panel (or run **Twitch: Open Channel…** from the
   Command Palette).
2. Type a channel name, e.g. `papaplatte`, and press <kbd>Enter</kbd>.
3. Click into the player once to turn the sound on. VS Code webviews follow Chromium's autoplay
   rule, so audio can only start after a click inside the panel; the player shows a hint when
   that is needed.
4. Expand **Twitch Chat** for the chat. Both panels can be dragged anywhere: above or below each
   other, into the bottom panel or into the secondary sidebar.

The panel title bar has buttons to open another channel, show the chat, open the stream on
twitch.tv and stop the stream. Recently watched channels are listed on the start screen.

## Settings

| Setting                          | Default | Description                                                          |
| -------------------------------- | ------- | -------------------------------------------------------------------- |
| `twitchPlayer.followRaids`       | `true`  | Switch to the raided channel automatically.                          |
| `twitchPlayer.quality`           | `auto`  | Preferred quality (`auto`, `1080p`, `720p`, `480p`, `360p`, `160p`). |
| `twitchPlayer.resumeLastChannel` | `false` | Reopen the last channel when VS Code starts.                         |
| `twitchPlayer.chat.maxMessages`  | `200`   | Number of chat messages kept in the chat panel.                      |

## How it works

VS Code's build of Chromium cannot play Twitch out of the box, so the extension works around a few
things:

- **Audio:** VS Code ships without an AAC decoder (Twitch's audio codec), so a stream would play
  silently. The player hands hls.js a stand-in for its audio `SourceBuffer` that decodes AAC with a
  WebAssembly decoder, re-encodes it as lossless FLAC (which VS Code _can_ decode) and appends that
  to a real `SourceBuffer`. The `<video>` element therefore has a native audio track, with native
  A/V sync, volume and background playback.
- **Playlists:** Twitch rejects playlist requests coming from a webview origin, so playlists are
  fetched by the extension host and passed to the webview. Video segments load directly.
- **Raids:** the extension host subscribes to the channel's raid topic on Twitch's "Hermes" push
  socket (the one twitch.tv itself uses), anonymously.
- **Chat:** anonymous, read-only connection to Twitch chat; emotes come from the 7TV API.

The extension uses the same public, unauthenticated endpoints as the twitch.tv website. They are
not an official API and may change without notice. Ads play like they do on twitch.tv (an
_Ad break_ badge shows while they run). This project is not affiliated with Twitch or 7TV.

## Development

```bash
npm install
npm run watch      # rebuild on change; press F5 in VS Code to start the Extension Development Host
npm run check      # typecheck, lint, format check and unit tests
npm run test:e2e   # plays a real live stream inside VS Code and checks playback (needs network)
npm run package    # build a .vsix
```

`npm run test:e2e -- <channel>` watches a specific channel; without one it picks the channel with
the most viewers. Sound only unmutes after a click, so the end-to-end test checks audio decoding
but not unmuting unless `E2E_EXPECT_AUDIO=1` is set and something clicks the player.

Code layout:

```
src/extension.ts       activation, commands, wiring
src/host/              extension host: Twitch GQL, playlist proxy, raid watcher, 7TV, views
src/shared/            message protocol and helpers used by host and webviews
src/webview/player/    player webview: hls.js, AAC→FLAC transcoding, UI
src/webview/chat/      chat webview: IRC, emote tokenizing, rendering
test/unit/             vitest unit tests
test/e2e/              end-to-end test running inside VS Code
```

## License

MIT for this project's code. The bundled player includes third-party code under other licenses,
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
