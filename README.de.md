<p align="center">
  <img src="media/brand/banner.png" alt="Lurk – Twitch-Streams in der VS-Code-Seitenleiste" width="800">
</p>

<p align="center"><a href="https://github.com/louis-mudrack/vscode-lurk/blob/HEAD/README.md">English</a> · <b>Deutsch</b></p>

**Lurk** (a. k. a. _Arbeitszeitbetrug_) zeigt einen Twitch-Livestream in einem kleinen Panel im
Explorer von VS Code – direkt unter Gliederung und Zeitachse – und den Chat in einem zweiten Panel.
Wenn der Streamer jemanden raidet, wechselt Lurk automatisch zum nächsten Kanal. Vergangene
Übertragungen laufen dort auch, und nach der Anmeldung siehst du, welche Kanäle, denen du folgst,
live sind, und kannst mitchatten.

<p align="center">
  <img src="media/brand/preview.png" alt="Lurk in der VS-Code-Seitenleiste: Livestream mit Steuerung über dem Chat" width="900">
  <br>
  <sub>Illustration mit Platzhalterinhalten.</sub>
</p>

## Funktionen

- **Livestream in der Seitenleiste** – Kanalnamen eingeben oder twitch.tv-Link einfügen, und der
  Stream startet. Die Qualität passt sich der Panelgröße an; du kannst sie auch selbst wählen.
- **Kanalvorschläge** – schon beim Tippen erscheinen passende Kanäle wie in der Suche auf twitch.tv,
  mit Live-Status, Spiel und Zuschauerzahl.
- **Folgt Raids** – raidet der Kanal jemanden, wechseln Player und Chat zum geraideten Kanal und
  zeigen an, wer wen geraidet hat. Lieber selbst entscheiden? Mit `twitchPlayer.followRaids: false`
  kommt stattdessen eine Benachrichtigung mit _Schauen_-Button.
- **Chat mit 7TV-Emotes** – Twitch-Emotes, globale und Kanal-Emotes von 7TV (inklusive
  Zero-Width-Overlays), Badges, Erwähnungen und Links, gut lesbare Namensfarben in jedem Theme.
- **Mitschreiben** – nach der Anmeldung: Emote-Vervollständigung wie in Chatterino (`:kek` tippen
  oder <kbd>Tab</kbd> drücken) mit deinen Twitch-Emotes und den 7TV-Emotes des Kanals,
  `@name`-Vervollständigung, <kbd>↑</kbd> für die letzte Nachricht, und Nachrichten, die dich
  erwähnen, werden hervorgehoben.
- **Kanäle, denen du folgst** – das Panel _Twitch – Gefolgt_ listet sie, Live-Kanäle zuerst mit
  Spiel und Zuschauerzahl. Ein Klick startet den Stream.
- **Vergangene Übertragungen** – Offline-Kanäle zeigen ihre letzten Übertragungen; sie laufen mit
  Suchleiste, und Lurk merkt sich, wo du aufgehört hast. Auch `twitch.tv/videos/…`-Links
  funktionieren, inklusive `?t=1h2m`.
- **Läuft im Hintergrund weiter** – Panel zuklappen, zu Suche oder Quellcodeverwaltung wechseln
  oder VS Code minimieren: Der Ton läuft weiter.
- **Bild im Bild** – Doppelklick aufs Video öffnet ein schwebendes Fenster.
- **Nah am Live-Geschehen** – nur wenige Sekunden Verzögerung, damit Bild und Chat zusammenpassen.
- **Offline-Kanäle** – starten von selbst, sobald der Kanal live geht.
- **Mehrsprachig** – Deutsch und Englisch, passend zur Anzeigesprache von VS Code.

## Installation

- **Visual Studio Marketplace:** in der Erweiterungsansicht nach „Lurk“ suchen, sobald die
  Erweiterung dort veröffentlicht ist.
- **Aus einem Release:** die `.vsix` von der
  [Release-Seite](https://github.com/louis-mudrack/vscode-lurk/releases)
  herunterladen und in VS Code **Erweiterungen: Aus VSIX installieren…** ausführen.

Benötigt VS Code 1.95 oder neuer.

## Benutzung

1. Explorer öffnen und das Panel **Twitch** aufklappen – oder in der Befehlspalette
   **Lurk: Twitch-Kanal öffnen…** ausführen.
2. Kanalnamen eingeben, z. B. `papaplatte`, und <kbd>Enter</kbd> drücken.
3. **Einmal in den Player klicken**, um den Ton einzuschalten. VS Code erlaubt Ton erst nach einem
   Klick in das Panel; bis dahin zeigt der Player einen Hinweis.
4. **Twitch-Chat** aufklappen. Beide Panels lassen sich frei verschieben: über- oder untereinander,
   in das untere Panel oder in die sekundäre Seitenleiste.

In der Titelleiste des Panels gibt es Buttons, um einen anderen Kanal zu öffnen, den Chat zu
zeigen, den Stream auf twitch.tv zu öffnen und ihn zu beenden; im <kbd>…</kbd>-Menü stehen die
vergangenen Übertragungen des Kanals. Zuletzt geschaute Kanäle stehen auf dem Startbildschirm.

### Anmelden (optional)

**Twitch – Gefolgt** aufklappen und **Mit Twitch anmelden** klicken oder **Lurk: Mit Twitch
anmelden** ausführen. Lurk öffnet twitch.tv mit bereits eingetragenem Code; dort bestätigen, und du
bist angemeldet. Abmelden geht über das <kbd>…</kbd>-Menü des Panels oder das Menü _Konten_ von
VS Code.

Lurk fragt bei Twitch drei Berechtigungen an: die Kanäle lesen, denen du folgst
(`user:read:follows`), deine Emotes für die Vervollständigung lesen (`user:read:emotes`) und deine
Chatnachrichten senden (`user:write:chat`).

## Einstellungen

| Einstellung                      | Standard | Beschreibung                                                          |
| -------------------------------- | -------- | --------------------------------------------------------------------- |
| `twitchPlayer.followRaids`       | `true`   | Automatisch zum geraideten Kanal wechseln.                            |
| `twitchPlayer.quality`           | `auto`   | Bevorzugte Qualität: `auto`, `1080p`, `720p`, `480p`, `360p`, `160p`. |
| `twitchPlayer.resumeLastChannel` | `false`  | Den letzten Kanal beim Start von VS Code wieder öffnen.               |
| `twitchPlayer.chat.maxMessages`  | `200`    | Anzahl der Chatnachrichten, die im Chat-Panel bleiben.                |
| `twitchPlayer.twitchClientId`    | (leer)   | Client-ID einer eigenen Twitch-Anwendung für die Anmeldung (Forks).   |

## Gut zu wissen

- **Kein Tracking, Konto optional.** Lurk sammelt keine Daten. Zum Schauen braucht es kein Konto.
  Meldest du dich an, bleibt das Twitch-Token im Geheimspeicher von VS Code (dem Schlüsselbund
  deines Systems), wird nur an Twitch geschickt und beim Abmelden widerrufen. Lurk verbindet sich
  nur mit Twitch (`gql.twitch.tv`, `usher.ttvnw.net` und den Video-CDNs, `hermes.twitch.tv` für
  Raids, `irc-ws.chat.twitch.tv` für den Chat, `static-cdn.jtvnw.net` für Emotes und Badges sowie
  `id.twitch.tv` und `api.twitch.tv`, wenn du angemeldet bist) und mit 7TV (`7tv.io`,
  `cdn.7tv.app`).
- **Schnittstellen der Website.** Für die Wiedergabe nutzt Lurk dieselben öffentlichen
  Schnittstellen wie die Website twitch.tv, so wie andere Drittanbieter-Player auch. Sie sind keine
  dokumentierte API; Twitch kann sie jederzeit ändern, und dann funktioniert etwas eventuell erst
  nach einem Update wieder. Alles, was dein Konto braucht, läuft über die offizielle API von Twitch.
- **Werbung** läuft wie auf twitch.tv; währenddessen zeigt der Player „Werbepause“ an.
- **Keine Kanalpunkte.** Twitch vergibt Kanalpunkte nur in den eigenen Apps und lässt sie nur dort
  einsammeln; in Lurk zu schauen bringt daher keine.
- **Kein Chat-Verlauf bei vergangenen Übertragungen.** Das Chat-Panel zeigt nur den Live-Chat.

## Mitmachen

Fehlerberichte, Ideen, Übersetzungen und Pull Requests sind willkommen – siehe
[CONTRIBUTING.md](CONTRIBUTING.md). Für eine neue Sprache braucht es nur zwei JSON-Dateien.

## Lizenz

Lurk ist freie Software unter der [GNU General Public License v3.0 oder später](LICENSE). Der
mitgelieferte AAC-Decoder basiert auf FAAD2, das unter der GPL steht; deshalb steht die Erweiterung
insgesamt unter der GPL. Komponenten von Dritten sind in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) aufgeführt.

Lurk steht in keiner Verbindung zu Twitch Interactive, Inc. oder 7TV und wird von ihnen weder
unterstützt noch gesponsert. Twitch ist eine Marke von Twitch Interactive, Inc.
