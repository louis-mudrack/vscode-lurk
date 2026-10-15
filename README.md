<p align="center">
  <img src="media/brand/banner.png" alt="Lurk – Twitch streams in your VS Code sidebar" width="800">
</p>

<p align="center">
  <a href="https://github.com/louis-mudrack/twitch-video-player-vsc-extension/actions/workflows/ci.yml"><img src="https://github.com/louis-mudrack/twitch-video-player-vsc-extension/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/louis-mudrack/twitch-video-player-vsc-extension/blob/HEAD/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg" alt="License: GPL-3.0-or-later"></a>
  <a href="https://github.com/louis-mudrack/twitch-video-player-vsc-extension/blob/HEAD/README.de.md"><img src="https://img.shields.io/badge/Deutsch-README-black.svg" alt="Deutsche Anleitung"></a>
</p>

**Lurk** puts a Twitch livestream into a small panel in VS Code's Explorer – right below Outline and
Timeline – with the chat in a second panel. When the streamer raids someone, Lurk follows along to
the next channel.

<p align="center">
  <img src="media/brand/preview.png" alt="Lurk in the VS Code sidebar: a live stream with controls above the chat" width="900">
  <br>
  <sub>Illustration with placeholder content.</sub>
</p>

## Features

- **Livestream in the sidebar** – type a channel name or paste a twitch.tv link and the stream
  starts. The quality fits itself to the panel size; you can also pick one.
- **Channel suggestions** – while you type, matching channels show up like in twitch.tv's search,
  with live status, game and viewer count.
- **Follows raids** – when the channel raids someone, player and chat switch to the raided channel
  and show who raided whom. Prefer to decide yourself? Turn off `twitchPlayer.followRaids` and you
  get a notification with a _Watch_ button instead.
- **Chat with 7TV emotes** – Twitch emotes, 7TV global and channel emotes (including zero-width
  overlays), badges, mentions and links, readable name colors in every theme. Read-only.
- **Keeps playing in the background** – collapse the panel, switch to Search or Source Control, or
  minimize VS Code: the sound keeps going.
- **Picture-in-picture** – double-click the video for a floating window.
- **Close to live** – a few seconds behind the broadcast, so the picture matches the chat.
- **Offline channels** – start by themselves as soon as the streamer goes live.
- **Multilingual** – English and German, following VS Code's display language.

## Install

- **Visual Studio Marketplace:** search for “Lurk” in the Extensions view once it is published
  there.
- **From a release:** download the `.vsix` from the
  [releases page](https://github.com/louis-mudrack/twitch-video-player-vsc-extension/releases) and
  run **Extensions: Install from VSIX…** in VS Code.

Requires VS Code 1.95 or newer.

## Usage

1. Open the Explorer and expand the **Twitch** panel, or run **Lurk: Open Twitch Channel…** from the
   Command Palette.
2. Enter a channel name, e.g. `papaplatte`, and press <kbd>Enter</kbd>.
3. **Click into the player once** to turn the sound on. VS Code only allows audio after a click
   inside the panel; the player shows a hint until then.
4. Expand **Twitch Chat** for the chat. Both panels can be dragged anywhere: above or below each
   other, into the bottom panel or into the secondary sidebar.

The panel's title bar has buttons to open another channel, show the chat, open the stream on
twitch.tv and stop. Recently watched channels are listed on the start screen.

## Settings

| Setting                          | Default | Description                                                           |
| -------------------------------- | ------- | --------------------------------------------------------------------- |
| `twitchPlayer.followRaids`       | `true`  | Switch to the raided channel automatically.                           |
| `twitchPlayer.quality`           | `auto`  | Preferred quality: `auto`, `1080p`, `720p`, `480p`, `360p` or `160p`. |
| `twitchPlayer.resumeLastChannel` | `false` | Reopen the last channel when VS Code starts.                          |
| `twitchPlayer.chat.maxMessages`  | `200`   | Number of chat messages kept in the chat panel.                       |

## Good to know

- **No account, no tracking.** Lurk does not log in to Twitch and collects no data. It only talks
  to Twitch (`gql.twitch.tv`, `usher.ttvnw.net` and the video CDN, `hermes.twitch.tv` for raids,
  `irc-ws.chat.twitch.tv` for chat, `static-cdn.jtvnw.net` for emotes and badges) and to 7TV
  (`7tv.io`, `cdn.7tv.app`).
- **Unofficial endpoints.** Lurk uses the same public, unauthenticated endpoints the twitch.tv
  website uses, like other third-party players do. They are not an official API, so Twitch can
  change them at any time and something may stop working until Lurk is updated.
- **Ads** play the way they do on twitch.tv; an _Ad break_ badge shows while they run.
- **Chat is read-only.** Use the _Chat on twitch.tv_ link to write messages.

## How it works

VS Code's built-in Chromium cannot play Twitch streams out of the box, so Lurk works around three
things:

- **Audio:** VS Code ships without an AAC decoder, Twitch's audio codec, so streams would play
  silently. Lurk hands hls.js a stand-in for its audio `SourceBuffer` that decodes AAC with a
  WebAssembly build of FAAD2, re-encodes it as lossless FLAC (which VS Code _can_ decode) and
  appends that to a real `SourceBuffer`. The `<video>` element therefore has a native audio track
  with native A/V sync, volume and background playback.
- **Playlists:** Twitch rejects playlist requests from a webview origin, so the extension host
  fetches the playlists and hands them to the webview. Video segments load directly.
- **Raids:** the extension host subscribes anonymously to the channel's raid topic on Twitch's
  "Hermes" push socket, the one twitch.tv uses itself.

## Contributing

Bug reports, ideas, translations and pull requests are welcome – see
[CONTRIBUTING.md](CONTRIBUTING.md). Adding a language takes two JSON files.

## License

Lurk is free software, licensed under the
[GNU General Public License v3.0 or later](LICENSE). The bundled AAC decoder is based on FAAD2,
which is GPL-licensed, so the extension as a whole is GPL as well. Third-party components are
listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Lurk is not affiliated with, endorsed or sponsored by Twitch Interactive, Inc. or 7TV. Twitch is a
trademark of Twitch Interactive, Inc.
