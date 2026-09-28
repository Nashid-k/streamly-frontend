# Streamly — Mobile app (`mobile/`)

Flutter client for the Streamly catalogue. Native playback through ExoPlayer
(`better_player_plus`), TMDB catalogue, multi-server resolution with a
headless-WebView embed sniffer and a visible WebView fallback.

- Package: `streamly_mobile`, v1.0.0+1 · Dart SDK `^3.13.4`
- Player engine: `better_player_plus ^1.4.1` (ExoPlayer/Media3 — HLS/DASH,
  ASMS quality tracks, speed, aspect override, hardcoded subtitle styling)
- Embed sniffing: `flutter_inappwebview ^6.1.5` headless (captures direct
  `.m3u8` from embed pages when the resolver returns nothing)
- Web fallback: `webview_flutter` (hosts that need their own player JS)
- State: `provider` + `shared_preferences` (`aios_*` / `setting_*` keys)

## Screens

| Screen | File | What it does |
|---|---|---|
| Home | `lib/screens/main_screen.dart` + `home_screen.dart` | hero carousel, rails, Continue Watching |
| Movies / Series | `lib/screens/movies_screen.dart` / `series_screen.dart` | browse + genre, see-all pages |
| Search | `lib/screens/search_screen.dart` | live TMDB multi-search + history |
| Details | `lib/screens/detail_screen.dart` | hero, actions, cast, episodes, similar |
| Player | `lib/screens/player_screen.dart` | the native player (see below) |
| Library | `lib/screens/watchlist_screen.dart` | My List + collections |
| Settings | `lib/screens/settings_screen.dart` | server, autoplay, seek step, data |

## Playback pipeline

```
PlayerScreen(season, episode, startAtSeconds)
  └─ StreamResolver.resolve(serverKey) → https://streamlyvercelin.vercel.app/api/source
     (VidCore bypasses it: VidcoreScraper → videasy/vidzen HLS, referer vidcore.io)
  └─ resolver null + embedUrlBuilder → EmbedSniffer (headless WebView, 25s cap)
  └─ still null → visible WebView fallback (host's own player)
  └─ native → BetterPlayerController (custom HUD, quality/speed/aspect sheets)
```

- **Subtitles:** manifest-embedded tracks only (hardcoded white/16sp style).
  No OpenSubtitles fetch, no track picker — known gap.
- **Audio:** `useAsmsAudioTracks` is on but there is no picker UI — known gap.
- **Resume:** Continue Watching positions restore once per screen via
  `startAtSeconds` (`UserDataProvider.progressFor` skips near-start and
  near-finished positions); series rows are scoped per episode.
- Progress saves every 15s while native; WebView watches are not tracked.

## Commands

```bash
flutter pub get
flutter analyze        # the app's static gate
flutter test           # widget/unit tests in test/
flutter run            # device/emulator attached
flutter build apk      # → build/app/outputs/flutter-apk/app-release.apk
```

Diagnostics in-code use `debugPrint('[Streamly][...]')` (logcat on device).

## Never commit

`build/`, `.dart_tool/`, `.flutter-plugins*`, `*.iml`, `.idea/`,
signing keys, `*.apk`/`*.aab` — all covered by `mobile/.gitignore`.
