# Changelog

All notable changes to Lurk are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

First public release.

### Added

- Twitch livestream player in the Explorer sidebar with quality selection, volume and
  picture-in-picture; keeps playing when the panel is hidden or VS Code is minimized.
- Audio inside VS Code by transcoding Twitch's AAC audio to FLAC in the webview.
- Automatic raid following, with a notification instead when `twitchPlayer.followRaids` is off.
- Chat panel with Twitch and 7TV emotes, badges and moderation events.
- Optional Twitch sign-in (device code flow), listed in VS Code's Accounts menu.
- Writing in chat when signed in, with emote and `@name` completion like Chatterino.
- _Twitch Following_ panel with the channels you follow, split into live and offline.
- Past broadcasts: listed on the offline screen and in a Quick Pick, played with a seek bar,
  resumed where you stopped, and opened from `twitch.tv/videos/…` links.
- Offline channels start playing automatically when they go live.
- Channel suggestions while typing a channel name, in the panel and in the Command Palette.
- English and German user interface.

[Unreleased]: https://github.com/louis-mudrack/vscode-lurk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/louis-mudrack/vscode-lurk/releases/tag/v0.1.0
