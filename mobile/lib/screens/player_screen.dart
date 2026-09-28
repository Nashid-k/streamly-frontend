import 'dart:async';
import 'package:better_player_plus/better_player_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../api/embed_sniffer.dart';
import '../api/movie_service.dart';
import '../api/stream_resolver.dart';
import '../api/subtitles.dart';
import '../api/video_source_adapter.dart';
import '../models/movie.dart';
import '../providers/user_data_provider.dart';
import '../theme/app_theme.dart';
import '../theme/player_ui.dart';
import '../widgets/dynamic_island.dart';
import '../widgets/player_dialog_row.dart';
import '../widgets/player_hud.dart';
import '../widgets/player_sheet.dart';
import '../widgets/netflix_loader.dart';
import 'package:perfect_volume_control/perfect_volume_control.dart';

/// Native playback screen — resolver API → direct m3u8/DASH → ExoPlayer
/// with fully custom Dart-drawn HUD (seek bar, play/pause, quality/audio/
/// subtitle/speed sheets, volume & brightness swipe gestures, double-tap seek).
class PlayerScreen extends StatefulWidget {
  final Movie movie;
  final int? season;
  final int? episode;
  final int initialServerIndex;
  /// Resume position in seconds (from Continue Watching). Applied once the
  /// stream initializes; 0 or near-start means play from the beginning.
  final double startAtSeconds;

  const PlayerScreen({
    super.key,
    required this.movie,
    this.season,
    this.episode,
    this.initialServerIndex = 0,
    this.startAtSeconds = 0,
  });

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

enum _PlayerEngine { resolving, native, webview, error }

class _PlayerScreenState extends State<PlayerScreen>
    with SingleTickerProviderStateMixin {
  BetterPlayerController? _controller;
  WebViewController? _webController;

  _PlayerEngine _engine = _PlayerEngine.resolving;
  String? _errorDetail;
  late int _activeServerIndex;
  late int _currentSeason;
  late int _currentEpisode;

  bool _showHud = true;
  bool _isBuffering = true;
  bool _switchingSource = false;
  bool _showEndCard = false;
  bool _isPlaying = false;
  Timer? _hudTimer;
  Timer? _progressSaver;
  Timer? _singleTapTimer;
  Duration _lastPosition = Duration.zero;
  Duration _duration = Duration.zero;

  // 3-zone tap model (web parity): edge taps wait 260ms for a double-tap,
  // center taps toggle play immediately.
  DateTime? _lastEdgeTapAt;
  String? _lastEdgeTapZone; // 'left' | 'right'
  // Hold-to-2x (web: 420ms delay, right half only).
  Timer? _holdTimer;
  bool _hold2x = false;
  double _heldRate = 1.0;
  // Pinch-to-fill aspect.
  double _pinchBase = 1.0;
  BoxFit _pinchBaseFit = BoxFit.contain;
  bool _pinching = false;
  // Transient HUD pill: volume | aspect | seek | play | pause | hold2x.
  String? _hudKind;
  String _hudValue = '';
  Timer? _hudFadeTimer;
  
  bool _hasAutoSkipped = false;
  bool _hasAutoPlayedNext = false;
  bool _didApplyStartAt = false;
  bool _showSkipIntroButton = false;

  // Resume card (web parity): offer {at}, countdown ticks only while playing.
  double? _resumeAt;
  int _resumeLeft = 0;
  Timer? _resumeTimer;
  // Up-Next card (TV-only): next episode + 15s countdown with cancel.
  int? _upNextNumber;
  String? _upNextTitle;
  int _upNextLeft = 0;
  Timer? _upNextTimer;
  // Subtitles (OpenSubtitles fetch + plugin memory source).
  List<SubtitleTrack> _subtitleTracks = [];
  bool _isLoadingSubtitles = false;
  String? _currentSubtitleName;
  String? _subtitleError;
  // Audio track choice (null = plugin default, i.e. first ASMS track).
  int? _currentAudioId;
  // True while the subtitle sheet is on screen — the lazy fetch must not
  // pop the player itself if the user closed the sheet first.
  bool _subsSheetOpen = false;
  // Spinner with cold-open immediacy (web: 700ms delay once playing).
  bool _showSpinner = false;
  Timer? _spinnerTimer;

  // Drag-seek state
  bool _isScrubbing = false;
  Duration _scrubPosition = Duration.zero;

  // Gesture brightness/volume feedback
  String? _feedbackText;
  Timer? _feedbackTimer;
  late final AnimationController _feedbackScale =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 200));
  late final Animation<double> _feedbackScaleAnim =
      CurvedAnimation(parent: _feedbackScale, curve: Curves.easeOutBack);

  // Volume/brightness swipe tracking
  double _dragStartY = 0;
  double _dragStartValue = 0; // normalized 0..1
  bool _draggingVolume = false;
  double _currentVolume = 1.0;
  bool _muted = false;
  double _lastVolume = 1.0;
  double _currentBrightness = 0.5;

  /// Aspect catalog (web parity): fit/fill/stretch ride the plugin's
  /// `BoxFit`; the zoom modes punch in via a `Transform.scale` wrapper
  /// around the video widget (the plugin cannot express scale itself).
  static const List<({String label, BoxFit fit, double scale})> aspectModes =
      [
    (label: 'Fit', fit: BoxFit.contain, scale: 1.0),
    (label: 'Fill', fit: BoxFit.cover, scale: 1.0),
    (label: 'Zoom', fit: BoxFit.contain, scale: 1.25),
    (label: 'Cinema', fit: BoxFit.contain, scale: 1.344),
    (label: '16:10', fit: BoxFit.contain, scale: 1.111),
    (label: 'Stretch', fit: BoxFit.fill, scale: 1.0),
  ];
  static const String _aspectPrefKey = 'setting_aspectIndex';
  int _aspectIndex = 0;
  BoxFit _currentFit = BoxFit.contain;
  double _videoScale = 1.0;

  List<Episode> _episodes = [];
  bool _isLoadingEpisodes = false;

  // Servers with index >= this rely on the host's own player JS → WebView path.
  // SmashyStream (index 7) has resolverKey and usesNativePlayer=true so it
  // stays on the native path despite being index 7; this threshold covers only
  // the hosts that explicitly set usesNativePlayer=false.
  bool get _useWebViewForServer =>
      !VideoSourceAdapter.servers[_activeServerIndex].usesNativePlayer;

  bool get _hasNextEpisode => _episodes
      .any((e) => e.episodeNumber == _currentEpisode + 1);

  @override
  void initState() {
    super.initState();
    _activeServerIndex = widget.initialServerIndex
        .clamp(0, VideoSourceAdapter.servers.length - 1);
    _currentSeason = widget.season ?? 1;
    _currentEpisode = widget.episode ?? 1;

    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);

    // Restore the persisted aspect mode (defaults Fit).
    SharedPreferences.getInstance().then((prefs) {
      if (!mounted) return;
      final i = prefs.getInt(_aspectPrefKey) ?? 0;
      if (i > 0 && i < aspectModes.length) {
        setState(() {
          _aspectIndex = i;
          _currentFit = aspectModes[i].fit;
          _videoScale = aspectModes[i].scale;
        });
      }
    });

    if (widget.movie.isSeries) _loadSeasonEpisodes();
    _resetHudTimer();
    _startPlayback();
  }

  @override
  void dispose() {
    _progressSaver?.cancel();
    _hudTimer?.cancel();
    _singleTapTimer?.cancel();
    _holdTimer?.cancel();
    _hudFadeTimer?.cancel();
    _resumeTimer?.cancel();
    _upNextTimer?.cancel();
    _spinnerTimer?.cancel();
    _feedbackTimer?.cancel();
    _feedbackScale.dispose();
    _controller?.dispose();
    // Restore system UI BEFORE super.dispose() to avoid post-frame issues.
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Source resolution + player setup
  // ------------------------------------------------------------------

  Future<void> _startPlayback() async {
    setState(() {
      _engine = _PlayerEngine.resolving;
      _errorDetail = null;
      _showEndCard = false;
      _showHud = true;
      _isPlaying = false;
    });
    _resetHudTimer();

    if (_useWebViewForServer) {
      _initWebView();
      if (!mounted) return;
      setState(() => _engine = _PlayerEngine.webview);
      return;
    }

    final server = VideoSourceAdapter.servers[_activeServerIndex];
    final key = server.resolverKey;
    var resolved = await StreamResolver.resolve(
      serverKey: key,
      tmdbId: widget.movie.id,
      isSeries: widget.movie.isSeries,
      season: widget.movie.isSeries ? _currentSeason : null,
      episode: widget.movie.isSeries ? _currentEpisode : null,
      imdbId: widget.movie.imdbId,
    );

    // Stage 2: sniff the embed page for the m3u8 if resolver returned nothing.
    if (resolved == null && server.embedUrlBuilder != null) {
      final embedUrl = server.embedUrlBuilder!(
        widget.movie.id,
        widget.movie.isSeries ? _currentSeason : null,
        widget.movie.isSeries ? _currentEpisode : null,
        widget.movie.imdbId,
      );
      debugPrint('[Streamly][Player] resolver empty → sniffing $embedUrl');
      resolved = await EmbedSniffer.I.sniff(embedUrl: embedUrl, referer: embedUrl);
    }

    if (!mounted) return;
    if (resolved == null) {
      _initWebView();
      setState(() {
        _engine = _PlayerEngine.webview;
        _errorDetail = 'Direct stream unavailable — using web fallback.';
      });
      // _errorDetail only renders on the error engine, so announce the
      // downgrade or the WebView looks like an unexplained mode switch.
      DynamicIsland.show(context, 'Direct stream unavailable — web fallback',
          icon: Icons.language_rounded, duration: const Duration(seconds: 2));
      return;
    }

    await _setupNative(resolved);
  }

  Future<void> _setupNative(ResolvedStream resolved) async {
    _controller?.dispose();
    _controller = null;

    final dataSource = BetterPlayerDataSource.network(
      resolved.url,
      headers: resolved.headers,
      useAsmsTracks: true,
      useAsmsAudioTracks: true,
      useAsmsSubtitles: true,
      liveStream: false,
      bufferingConfiguration: const BetterPlayerBufferingConfiguration(
        minBufferMs: 15000,
        maxBufferMs: 50000,
        bufferForPlaybackMs: 2500,
        bufferForPlaybackAfterRebufferMs: 5000,
      ),
    );

    final config = BetterPlayerConfiguration(
      autoPlay: true,
      allowedScreenSleep: false,
      fit: _currentFit,
      subtitlesConfiguration: const BetterPlayerSubtitlesConfiguration(
        fontColor: Colors.white,
        fontSize: 16,
        outlineColor: Colors.black,
        outlineEnabled: true,
        // Keep subtitles above the bottom HUD bar.
        bottomPadding: 56,
      ),
      // Completely disable built-in controls — we draw our own.
      controlsConfiguration: const BetterPlayerControlsConfiguration(
        showControls: false,
      ),
    );

    final controller = BetterPlayerController(config, betterPlayerDataSource: dataSource);
    controller.addEventsListener(_onPlayerEvent);
    _controller = controller;

    try {
      await controller.setupDataSource(dataSource);
      if (!mounted) return;
      setState(() {
        _engine = _PlayerEngine.native;
        _isBuffering = true;
        _isPlaying = true;
      });
      controller.play();
      _startProgressSaver();
    } catch (e) {
      debugPrint('[Streamly][Player] native setup failed: $e');
      if (!mounted) return;
      _initWebView();
      setState(() => _engine = _PlayerEngine.webview);
    }
  }

  void _onPlayerEvent(BetterPlayerEvent event) {
    if (!mounted) return;
    switch (event.betterPlayerEventType) {
      case BetterPlayerEventType.initialized:
        final dur = _controller?.videoPlayerController?.value.duration;
        setState(() {
          _duration = dur ?? Duration.zero;
          _isBuffering = false;
          _showSpinner = false;
          _isPlaying = true;
        });
        // Resume offer, once per screen (web parity): the saved position
        // (already vetted by progressFor) becomes a card with an 8s
        // countdown instead of a silent jump.
        if (!_didApplyStartAt) {
          _didApplyStartAt = true;
          final at = widget.startAtSeconds;
          final total = (_duration.inMilliseconds / 1000.0);
          if (at > 5 && (total <= 0 || at < total - 10)) {
            _offerResume(at);
          }
        }
        break;
      case BetterPlayerEventType.play:
        setState(() => _isPlaying = true);
        break;
      case BetterPlayerEventType.pause:
        _releaseHold();
        _spinnerTimer?.cancel();
        setState(() {
          _isPlaying = false;
          _showSpinner = false; // paused never spins (web parity)
        });
        break;
      case BetterPlayerEventType.bufferingStart:
        // Cold open spins immediately; mid-play stalls wait 700ms so a
        // blip never flashes the overlay (web parity).
        _spinnerTimer?.cancel();
        if (_duration.inMilliseconds <= 0) {
          setState(() {
            _isBuffering = true;
            _showSpinner = true;
          });
        } else {
          setState(() => _isBuffering = true);
          _spinnerTimer = Timer(const Duration(milliseconds: 700), () {
            if (!mounted) return;
            if (_isBuffering) setState(() => _showSpinner = true);
          });
        }
        break;
      case BetterPlayerEventType.bufferingEnd:
        _spinnerTimer?.cancel();
        setState(() {
          _isBuffering = false;
          _showSpinner = false;
        });
        break;
      case BetterPlayerEventType.exception:
        // Reachable error engine at last: an exception before the stream
        // ever initialized is fatal, not a silent WebView downgrade.
        debugPrint('[Streamly][Player] player exception: ${event.parameters}');
        if (_duration.inMilliseconds <= 0 &&
            _engine == _PlayerEngine.native) {
          _spinnerTimer?.cancel();
          setState(() {
            _engine = _PlayerEngine.error;
            _errorDetail = 'Playback failed before the first frame.';
            _showSpinner = false;
          });
        }
        break;
      case BetterPlayerEventType.progress:
        final p = event.parameters?['progress'] as Duration?;
        final d = event.parameters?['duration'] as Duration?;
        if (p != null || d != null) {
          setState(() {
            if (p != null) _lastPosition = p;
            if (d != null && d > Duration.zero) _duration = d;
          });
          
          if (!mounted) return;
          final userData = Provider.of<UserDataProvider>(context, listen: false);
          
          // Skip-intro window (web parity): TV-only [0, 90+10s grace],
          // skipped for short episodes (<15min) whose "intro" is the film.
          if (widget.movie.isSeries && _lastPosition.inSeconds > 0) {
            final pos = _lastPosition.inSeconds;
            final longEnough =
                _duration.inSeconds == 0 || _duration.inSeconds >= 900;
            if (userData.autoSkipIntro &&
                !_hasAutoSkipped &&
                longEnough &&
                pos < 90) {
              _hasAutoSkipped = true;
              _controller?.seekTo(Duration(seconds: _introTarget()));
              DynamicIsland.show(context, 'Intro Skipped', icon: Icons.fast_forward_rounded, duration: const Duration(seconds: 2));
            } else if (!userData.autoSkipIntro) {
              final show = longEnough && pos < 100;
              if (show && !_showSkipIntroButton) {
                setState(() => _showSkipIntroButton = true);
              } else if (!show && _showSkipIntroButton) {
                setState(() => _showSkipIntroButton = false);
              }
            } else {
              if (_showSkipIntroButton) setState(() => _showSkipIntroButton = false);
            }
          } else {
            if (_showSkipIntroButton) setState(() => _showSkipIntroButton = false);
          }
        }
        break;
      case BetterPlayerEventType.finished:
        _releaseHold();
        _saveProgress(force: true);
        _hudTimer?.cancel();
        final userData = Provider.of<UserDataProvider>(context, listen: false);
        if (widget.movie.isSeries && _hasNextEpisode && userData.autoPlayNext && !_hasAutoPlayedNext) {
          _hasAutoPlayedNext = true;
          _offerUpNext();
        } else {
          setState(() {
            _showHud = false;
            _showEndCard = true;
            _isPlaying = false;
            _showSkipIntroButton = false;
          });
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Progress persistence
  // ------------------------------------------------------------------

  /// Resume card (web parity): "Left off at" + 8s countdown that ticks
  /// only while playing, committed by Resume, the play toggle, or zero.
  void _offerResume(double at) {
    _resumeTimer?.cancel();
    setState(() {
      _resumeAt = at;
      _resumeLeft = 8;
    });
    _resumeTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (!_isPlaying) return; // frozen while paused
      setState(() => _resumeLeft--);
      if (_resumeLeft <= 0) _commitResume();
    });
  }

  void _commitResume() {
    final at = _resumeAt;
    _resumeTimer?.cancel();
    if (!mounted) return;
    setState(() {
      _resumeAt = null;
      _resumeLeft = 0;
    });
    if (at != null) {
      _controller?.seekTo(Duration(milliseconds: (at * 1000).round()));
      if (!_isPlaying) _controller?.play();
      DynamicIsland.show(
        context,
        'Resumed from ${_formatDuration(Duration(seconds: at.round()))}',
        icon: Icons.history_rounded,
        duration: const Duration(seconds: 2),
      );
    }
  }

  void _dismissResume() {
    _resumeTimer?.cancel();
    if (mounted) {
      setState(() {
        _resumeAt = null;
        _resumeLeft = 0;
      });
    }
  }

  /// Up-Next card (web parity, TV-only): 15s countdown with cancel + Play now.
  void _offerUpNext() {
    final next = _currentEpisode + 1;
    String? title;
    for (final e in _episodes) {
      if (e.episodeNumber == next) {
        title = e.name;
        break;
      }
    }
    _upNextTimer?.cancel();
    setState(() {
      _upNextNumber = next;
      _upNextTitle = title;
      _upNextLeft = 15;
    });
    _upNextTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _upNextLeft--);
      if (_upNextLeft <= 0) {
        _upNextTimer?.cancel();
        _nextEpisode();
      }
    });
  }

  void _cancelUpNext() {
    _upNextTimer?.cancel();
    if (!mounted) return;
    setState(() {
      _upNextNumber = null;
      _upNextTitle = null;
      _upNextLeft = 0;
      _showEndCard = true;
      _isPlaying = false;
    });
  }

  /// Skip-intro target (web parity): 90s default, clamped to dur-5 so a
  /// short episode never seeks past its end.
  int _introTarget() {
    final dur = _duration.inSeconds;
    if (dur > 95) return 90;
    return (dur - 5).clamp(0, 90);
  }

  void _startProgressSaver() {
    _progressSaver?.cancel();
    // Web parity: persist every ~4s, only once past 10s in — a peek never
    // writes a resume point.
    _progressSaver = Timer.periodic(const Duration(seconds: 4), (_) {
      _saveProgress();
    });
  }

  void _saveProgress({bool force = false}) {
    if (!mounted) return;
    if (_engine != _PlayerEngine.native) return;
    if (!force && (!_isPlaying || _lastPosition.inSeconds < 10)) return;
    final dur = _duration.inMilliseconds;
    if (dur <= 0 && !force) return;
    Provider.of<UserDataProvider>(context, listen: false).recordProgress(
      tmdbId: widget.movie.id,
      isSeries: widget.movie.isSeries,
      title: widget.movie.title,
      season: _currentSeason,
      episode: _currentEpisode,
      positionSeconds: _lastPosition.inMilliseconds / 1000.0,
      durationSeconds: dur / 1000.0,
      posterPath: widget.movie.posterPath,
      backdropPath: widget.movie.backdropPath,
    );
  }

  // ------------------------------------------------------------------
  // WebView fallback
  // ------------------------------------------------------------------

  void _initWebView() {
    final streamUrl = VideoSourceAdapter.buildStreamUrl(
      serverIndex: _activeServerIndex,
      tmdbId: widget.movie.id,
      season: widget.movie.isSeries ? _currentSeason : null,
      episode: widget.movie.isSeries ? _currentEpisode : null,
      imdbId: widget.movie.imdbId,
    );

    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() => _isBuffering = true),
        onPageFinished: (_) => setState(() => _isBuffering = false),
      ))
      ..loadRequest(Uri.parse(streamUrl));
  }

  // ------------------------------------------------------------------
  // HUD auto-hide
  // ------------------------------------------------------------------

  /// Chrome visibility heartbeat — show, then hide 3s later iff playing.
  void _poke() {
    if (!mounted) return;
    setState(() => _showHud = true);
    _resetHudTimer();
  }

  /// Transient HUD pill (1100ms self-fade, pointer-transparent).
  void _flashHud(String kind, String value) {
    _hudFadeTimer?.cancel();
    if (!mounted) return;
    setState(() {
      _hudKind = kind;
      _hudValue = value;
    });
    _hudFadeTimer = Timer(PlayerUi.hudFade, () {
      if (!mounted) return;
      setState(() => _hudKind = null);
    });
  }

  /// 3-zone tap model (web parity): center toggles play immediately (no lag);
  /// edge taps wait 260ms — a second tap on the same third within 350ms seeks
  /// instead. Every tap pokes the chrome visible.
  void _handleTapDown(TapDownDetails details) {
    _poke();
    if (_engine != _PlayerEngine.native) return;
    final width = MediaQuery.of(context).size.width;
    final dx = details.globalPosition.dx;
    final zone = dx < width / 3 ? 'left' : dx > width * 2 / 3 ? 'right' : 'center';
    if (zone == 'center') {
      _singleTapTimer?.cancel();
      _lastEdgeTapAt = null;
      _togglePlayPause();
      return;
    }
    final now = DateTime.now();
    if (_lastEdgeTapAt != null &&
        _lastEdgeTapZone == zone &&
        now.difference(_lastEdgeTapAt!).inMilliseconds <=
            PlayerUi.edgeDoubleTapMs.round()) {
      _singleTapTimer?.cancel();
      _lastEdgeTapAt = null;
      final step =
          Provider.of<UserDataProvider>(context, listen: false).seekStepSeconds;
      _seekBy(zone == 'left' ? -step : step);
      _flashHud('seek', zone == 'left' ? '-${step}s' : '+${step}s');
      return;
    }
    _lastEdgeTapAt = now;
    _lastEdgeTapZone = zone;
    _singleTapTimer?.cancel();
    _singleTapTimer = Timer(const Duration(milliseconds: 260), () {
      if (!mounted) return;
      _lastEdgeTapAt = null;
      _togglePlayPause();
    });
  }

  /// Right-half press-and-hold arms 2x after a 420ms delay (web parity);
  /// quick taps never engage it.
  void _handleHoldStart(LongPressStartDetails details) {
    if (_engine != _PlayerEngine.native || _controller == null || _isBuffering) {
      return;
    }
    if (details.globalPosition.dx <=
        MediaQuery.of(context).size.width / 2) {
      return;
    }
    _holdTimer?.cancel();
    _holdTimer = Timer(
      Duration(milliseconds: PlayerUi.hold2xDelayMs.round()),
      () {
        if (!mounted || _pinching) return;
        _heldRate =
            _controller?.videoPlayerController?.value.speed ?? 1.0;
        _controller?.setSpeed(2.0);
        setState(() => _hold2x = true);
        _flashHud('hold2x', '');
        _poke();
      },
    );
  }

  void _handleHoldEnd(LongPressEndDetails _) {
    _holdTimer?.cancel();
    if (_hold2x) {
      _controller?.setSpeed(_heldRate);
      if (mounted) setState(() => _hold2x = false);
    }
  }

  void _releaseHold() {
    _holdTimer?.cancel();
    if (_hold2x) {
      _controller?.setSpeed(_heldRate);
      _hold2x = false;
    }
  }

  /// Pinch-to-fill: two-finger scale toggles Fit ↔ Fill with 15% hysteresis,
  /// re-based on every crossing so repeated pinches work without lifting.
  /// (Single-finger volume drag lives in a separate gesture arena.)
  void _handleScaleStart(ScaleStartDetails _) {
    _pinching = true;
    _pinchBase = 1.0;
    _pinchBaseFit = _currentFit;
    _hudTimer?.cancel();
  }

  void _handleScaleUpdate(ScaleUpdateDetails details) {
    if (!_pinching || _engine != _PlayerEngine.native) return;
    final s = details.scale / _pinchBase;
    if (s > 1 + PlayerUi.pinchHysteresis &&
        _pinchBaseFit != BoxFit.cover) {
      _applyAspect(BoxFit.cover);
      _pinchBaseFit = BoxFit.cover;
      _pinchBase = details.scale;
    } else if (s < 1 - PlayerUi.pinchHysteresis &&
        _pinchBaseFit != BoxFit.contain) {
      _applyAspect(BoxFit.contain);
      _pinchBaseFit = BoxFit.contain;
      _pinchBase = details.scale;
    }
  }

  void _handleScaleEnd(ScaleEndDetails _) {
    _pinching = false;
    _resetHudTimer();
  }

  void _setAspect(int index, {bool notify = true}) {
    if (index < 0 || index >= aspectModes.length) return;
    final mode = aspectModes[index];
    setState(() {
      _aspectIndex = index;
      _currentFit = mode.fit;
      _videoScale = mode.scale;
    });
    _controller?.setOverriddenFit(mode.fit);
    SharedPreferences.getInstance().then(
      (prefs) => prefs.setInt(_aspectPrefKey, index),
    );
    if (notify) {
      _flashHud('aspect', mode.label);
      DynamicIsland.show(context, 'Aspect: ${mode.label}',
          icon: Icons.aspect_ratio_rounded);
    }
  }

  void _applyAspect(BoxFit fit) {
    // Pinch toggles Fit ↔ Fill only (indices 0/1); zoom modes stay in-menu.
    final index = fit == BoxFit.cover ? 1 : 0;
    _setAspect(index);
    _poke();
  }

  void _seekBy(int seconds) {
    final c = _controller;
    if (c == null || _engine != _PlayerEngine.native) return;
    _releaseHold();
    final value = c.videoPlayerController?.value;
    if (value == null) return;
    final durMs = value.duration?.inMilliseconds ?? _duration.inMilliseconds;
    var targetMs = value.position.inMilliseconds + seconds * 1000;
    if (targetMs < 0) targetMs = 0;
    if (durMs > 0 && targetMs > durMs) targetMs = durMs;
    c.seekTo(Duration(milliseconds: targetMs));
  }

  /// Toggle with settled-state flash (web parity): a rejected play never
  /// flashes "play".
  Future<void> _togglePlayPause() async {
    final c = _controller;
    if (c == null) return;
    _poke();
    // A pending resume offer wins over the toggle (web parity).
    if (_resumeAt != null && !_isPlaying) {
      _commitResume();
      _flashHud('play', '');
      _resetHudTimer();
      return;
    }
    try {
      if (_isPlaying) {
        _releaseHold();
        await c.pause();
        _flashHud('pause', '');
      } else {
        await c.play();
        _flashHud('play', '');
      }
    } catch (_) {
      _flashHud('pause', '');
    }
    _resetHudTimer();
  }

  void _replay() {
    setState(() => _showEndCard = false);
    _controller?.seekTo(Duration.zero);
    _controller?.play();
  }

  void _nextEpisode() {
    if (!_hasNextEpisode) return;
    _upNextTimer?.cancel();
    _dismissResume();
    setState(() {
      _currentEpisode++;
      _showEndCard = false;
      _upNextNumber = null;
      _upNextTitle = null;
      _upNextLeft = 0;
      _engine = _PlayerEngine.resolving;
    });
    _startPlayback();
  }

  /// Season episode list for Up-Next, the end card, and the Episodes drawer.
  /// Unaired episodes are filtered out (air date in the future) so no path
  /// can auto-play or page into an episode that has not aired.
  Future<void> _loadSeasonEpisodes() async {
    if (!widget.movie.isSeries) return;
    setState(() => _isLoadingEpisodes = true);
    try {
      final eps = await MovieService.getSeasonEpisodes(widget.movie.id, _currentSeason);
      if (!mounted) return;
      final now = DateTime.now();
      setState(() {
        _episodes = eps.where((e) {
          if (e.airDate == null || e.airDate!.isEmpty) return true;
          final d = DateTime.tryParse(e.airDate!);
          return d == null || !d.isAfter(now);
        }).toList();
        _isLoadingEpisodes = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoadingEpisodes = false);
    }
  }

  /// Drawer / end-card episode jump within the current season.
  void _playEpisode(int number) {
    Navigator.of(context).maybePop();
    _saveProgress(force: true);
    _dismissResume();
    _upNextTimer?.cancel();
    setState(() {
      _currentEpisode = number;
      _showEndCard = false;
      _hasAutoSkipped = false;
      _hasAutoPlayedNext = false;
      _upNextNumber = null;
      _upNextTitle = null;
      _upNextLeft = 0;
      _engine = _PlayerEngine.resolving;
    });
    _startPlayback();
  }

  void _onScrubStart(double fraction) {
    _dismissResume();
    setState(() => _isScrubbing = true);
    _hudTimer?.cancel();
  }

  void _onScrubUpdate(double fraction) {
    setState(() {
      _scrubPosition = Duration(milliseconds: (_duration.inMilliseconds * fraction).round());
      DynamicIsland.show(context, _formatDuration(_scrubPosition), icon: Icons.access_time_rounded, duration: const Duration(milliseconds: 800));
    });
  }

  Future<void> _onScrubEnd(double fraction) async {
    setState(() => _isScrubbing = false);
    if (_controller != null && _duration.inMilliseconds > 0) {
      final f = fraction.clamp(0.0, 1.0);
      await _controller!.seekTo(Duration(milliseconds: (_duration.inMilliseconds * f).round()));
    }
    _resetHudTimer();
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    final mm = (h > 0 ? m : d.inMinutes).toString().padLeft(2, '0');
    final ss = s.toString().padLeft(2, '0');
    return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
  }

  void _onVerticalDragStart(DragStartDetails details) {
    _dragStartY = details.globalPosition.dy;
    final width = MediaQuery.of(context).size.width;
    _draggingVolume = details.globalPosition.dx > width / 2;
    _dragStartValue = _draggingVolume ? _currentVolume : _currentBrightness;
    _hudTimer?.cancel();
    // No brightness plugin is installed, so a left-half drag cannot change
    // the display — say so once instead of showing a fake percentage.
    if (!_draggingVolume) {
      DynamicIsland.show(context, 'Brightness: use system settings',
          icon: Icons.light_mode_rounded, duration: const Duration(milliseconds: 1500));
    }
  }

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    if (!_draggingVolume) return;
    final screenH = MediaQuery.of(context).size.height;
    final delta = (_dragStartY - details.globalPosition.dy) / screenH;
    final newVal = (_dragStartValue + delta).clamp(0.0, 1.0);
    _currentVolume = newVal;
    // A drag is an explicit volume choice — clears a player mute like web.
    _muted = false;
    if (_controller != null) _controller!.setVolume(newVal);
    PerfectVolumeControl.setVolume(newVal);
    _flashHud('volume', '${(newVal * 100).round()}%');
    setState(() {});
  }

  void _onVerticalDragEnd(DragEndDetails _) {
    _resetHudTimer();
  }

  void _showSettingsSheet() {
    _hudTimer?.cancel();
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Settings', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            const Divider(color: Colors.white10, height: 1),
            ListTile(
              leading: const Icon(Icons.audiotrack_rounded, color: Colors.white),
              title: const Text('Audio', style: TextStyle(color: Colors.white)),
              subtitle: Text(_currentAudioLabel(), style: const TextStyle(color: AppTheme.textFaint)),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppTheme.textSecondary),
              onTap: () {
                Navigator.pop(ctx);
                _showAudioPicker();
              },
            ),
            ListTile(
              leading: const Icon(Icons.closed_caption_rounded, color: Colors.white),
              title: const Text('Subtitles', style: TextStyle(color: Colors.white)),
              subtitle: Text(_currentSubtitleName ?? 'Off', style: const TextStyle(color: AppTheme.textFaint)),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppTheme.textSecondary),
              onTap: () {
                Navigator.pop(ctx);
                _showSubtitlePicker();
              },
            ),
            ListTile(
              leading: const Icon(Icons.high_quality_rounded, color: Colors.white),
              title: const Text('Video Quality', style: TextStyle(color: Colors.white)),
              subtitle: Text(_currentQualityLabel(), style: const TextStyle(color: AppTheme.textFaint)),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppTheme.textSecondary),
              onTap: () {
                Navigator.pop(ctx);
                _showQualityPicker();
              },
            ),
            ListTile(
              leading: const Icon(Icons.aspect_ratio_rounded, color: Colors.white),
              title: const Text('Aspect Ratio', style: TextStyle(color: Colors.white)),
              subtitle: Text(_currentAspectLabel(), style: const TextStyle(color: AppTheme.textFaint)),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppTheme.textSecondary),
              onTap: () {
                Navigator.pop(ctx);
                _showAspectRatioPicker();
              },
            ),
            ListTile(
              leading: const Icon(Icons.speed_rounded, color: Colors.white),
              title: const Text('Playback Speed', style: TextStyle(color: Colors.white)),
              subtitle: Text(_currentSpeedLabel(), style: const TextStyle(color: AppTheme.textFaint)),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppTheme.textSecondary),
              onTap: () {
                Navigator.pop(ctx);
                _showSpeedPicker();
              },
            ),
          ],
        ),
      ),
    ).then((_) => _resetHudTimer());
  }

  String _currentQualityLabel() {
    final t = _controller?.betterPlayerAsmsTrack;
    if (t == null || t.height == 0) return 'Auto';
    return '${t.height}p';
  }

  String _currentAspectLabel() => aspectModes[_aspectIndex].label;

  String _currentSpeedLabel() {
    final s = _controller?.videoPlayerController?.value.speed ?? 1.0;
    return '${s}x';
  }

  void _showQualityPicker() {
    final tracks = _controller?.betterPlayerAsmsTracks ?? [];
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Video Quality', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            const Divider(color: Colors.white10, height: 1),
            ListTile(
              title: const Text('Auto', style: TextStyle(color: Colors.white)),
              trailing: _controller?.betterPlayerAsmsTrack == null ? const Icon(Icons.check_circle, color: AppTheme.accentLime) : null,
              onTap: () {
                _controller?.setTrack(BetterPlayerAsmsTrack.defaultTrack());
                Navigator.pop(ctx);
                DynamicIsland.show(context, 'Quality: Auto', icon: Icons.high_quality_rounded);
              },
            ),
            ...tracks.where((t) => t.height != null && t.height! > 0).map((t) {
              final isSelected = _controller?.betterPlayerAsmsTrack?.id == t.id;
              return ListTile(
                title: Text('${t.height}p', style: TextStyle(color: isSelected ? AppTheme.accentLime : Colors.white)),
                subtitle: t.bitrate != null ? Text('${(t.bitrate! / 1000000).toStringAsFixed(1)} Mbps', style: const TextStyle(color: AppTheme.textFaint, fontSize: 12)) : null,
                trailing: isSelected ? const Icon(Icons.check_circle, color: AppTheme.accentLime) : null,
                onTap: () {
                  _controller?.setTrack(t);
                  Navigator.pop(ctx);
                  DynamicIsland.show(context, 'Quality: ${t.height}p', icon: Icons.high_quality_rounded);
                },
              );
            }),
          ],
        ),
      ),
    );
  }

  void _showAspectRatioPicker() {
    showPlayerSheet(
      context: context,
      title: 'Aspect Ratio',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PlayerSheetSection('Aspect Ratio'),
          ...List.generate(aspectModes.length, (i) {
            final mode = aspectModes[i];
            return PlayerDialogRow(
              title: mode.label,
              sub: mode.scale != 1.0 ? '${mode.scale}x punch-in' : null,
              selected: i == _aspectIndex,
              onTap: () {
                Navigator.pop(context);
                _setAspect(i);
              },
            );
          }),
        ],
      ),
    ).then((_) => _resetHudTimer());
  }

  void _showSpeedPicker() {
    final speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Playback Speed', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            const Divider(color: Colors.white10, height: 1),
            ...speeds.map((s) {
              final isSel = _controller?.videoPlayerController?.value.speed == s;
              return ListTile(
                title: Text('${s}x', style: TextStyle(color: isSel ? AppTheme.accentLime : Colors.white)),
                trailing: isSel ? const Icon(Icons.check_circle, color: AppTheme.accentLime) : null,
                onTap: () {
                  _controller?.setSpeed(s);
                  Navigator.pop(ctx);
                  DynamicIsland.show(context, 'Speed: ${s}x', icon: Icons.speed_rounded);
                },
              );
            }),
          ],
        ),
      ),
    );
  }

  /// Player-only mute (system volume untouched). Any volume drag clears it.
  void _toggleMute() {
    setState(() {
      if (_muted) {
        _muted = false;
        _currentVolume = _lastVolume > 0 ? _lastVolume : 1.0;
      } else {
        _lastVolume = _currentVolume;
        _muted = true;
        _currentVolume = 0.0;
      }
    });
    _controller?.setVolume(_currentVolume);
    _resetHudTimer();
  }

  bool get _hasPrevEpisode =>
      _episodes.isNotEmpty && _currentEpisode > _episodes.first.episodeNumber;

  void _goPrevEpisode() {
    if (!_hasPrevEpisode) return;
    _playEpisode(_currentEpisode - 1);
  }

  /// Buffered-ahead fraction from the video element (snapshot per rebuild,
  /// like the web `video.buffered` read on `timeupdate`). Falls back to the
  /// played progress when the element reports nothing yet.
  double _bufferedFraction(double played) {
    final v = _controller?.videoPlayerController?.value;
    final totalMs = _duration.inMilliseconds;
    if (v == null || totalMs <= 0 || v.buffered.isEmpty) return played;
    var endMs = 0;
    for (final r in v.buffered) {
      if (r.end.inMilliseconds > endMs) endMs = r.end.inMilliseconds;
    }
    return (endMs / totalMs).clamp(0.0, 1.0);
  }

  Widget _transportBtn({
    required IconData icon,
    required String tooltip,
    required VoidCallback? onTap,
    double size = PlayerUi.railIcon,
    bool dimmed = false,
  }) {
    return SizedBox(
      width: PlayerUi.btnSize,
      height: PlayerUi.btnSize,
      child: IconButton(
        icon: Icon(icon, color: dimmed ? PlayerUi.text(0.35) : Colors.white, size: size),
        tooltip: tooltip,
        onPressed: onTap,
      ),
    );
  }

  String _currentAudioLabel() {
    final tracks = _controller?.betterPlayerAsmsAudioTracks ?? [];
    if (tracks.isEmpty) return 'Original';
    final current = _currentAudioId == null
        ? tracks.first
        : tracks.firstWhere((t) => t.id == _currentAudioId,
            orElse: () => tracks.first);
    return current.label ?? current.language ?? 'Original';
  }

  void _showAudioPicker() {
    final tracks = _controller?.betterPlayerAsmsAudioTracks ?? [];
    showPlayerSheet(
      context: context,
      title: 'Audio',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const PlayerSheetSection('Audio'),
          if (tracks.isEmpty)
            const PlayerDialogRow(
              title: 'Original',
              sub: "This source's soundtrack",
              selected: true,
            )
          else
            ...tracks.map((t) {
              final selected =
                  _currentAudioId == null ? t == tracks.first : t.id == _currentAudioId;
              return PlayerDialogRow(
                title: t.label ?? t.language ?? 'Audio ${t.id}',
                sub: t.language != null && t.language != t.label ? t.language : null,
                selected: selected,
                onTap: () {
                  setState(() => _currentAudioId = t.id);
                  _controller?.setAudioTrack(t);
                  Navigator.pop(context);
                  DynamicIsland.show(context, 'Audio → ${t.label ?? t.language ?? 'track'}',
                      icon: Icons.audiotrack_rounded);
                },
              );
            }),
        ],
      ),
    ).then((_) => _resetHudTimer());
  }

  void _showSubtitlePicker() {
    _hudTimer?.cancel();
    // Fetch lazily on open (not on player init) so titles without subtitle
    // interest never pay the OpenSubtitles round trip.
    if (_subtitleTracks.isEmpty && !_isLoadingSubtitles) {
      setState(() {
        _isLoadingSubtitles = true;
        _subtitleError = null;
      });
      SubtitleService.search(
        imdbId: widget.movie.imdbId,
        title: widget.movie.title,
      ).then((tracks) {
        if (!mounted) return;
        setState(() {
          _subtitleTracks = tracks;
          _isLoadingSubtitles = false;
        });
        // Refresh the open sheet with the results — but never pop something
        // the user already closed themselves.
        if (_subsSheetOpen && mounted) {
          Navigator.pop(context);
          _showSubtitlePicker();
        }
      });
    }
    _subsSheetOpen = true;
    showPlayerSheet(
      context: context,
      title: 'Subtitles',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PlayerSheetSection('Subtitles'),
          PlayerDialogRow(
            title: 'Off',
            selected: _currentSubtitleName == null,
            onTap: () async {
              await _controller?.setupSubtitleSource(
                BetterPlayerSubtitlesSource(
                    type: BetterPlayerSubtitlesSourceType.none),
              );
              if (!mounted) return;
              setState(() {
                _currentSubtitleName = null;
                _subtitleError = null;
              });
              Navigator.pop(context);
            },
          ),
          if (_isLoadingSubtitles)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Text('Searching OpenSubtitles…',
                  style: TextStyle(
                      color: Colors.white54, fontSize: 12.5, height: 1.45)),
            )
          else if (_subtitleTracks.isNotEmpty)
            ..._subtitleTracks.map((s) => PlayerDialogRow(
                  title: s.language,
                  selected: _currentSubtitleName == s.language,
                  onTap: () => _selectSubtitle(s),
                ))
          else
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Text('No subtitles found for this title on OpenSubtitles.',
                  style: TextStyle(
                      color: Colors.white54, fontSize: 12.5, height: 1.45)),
            ),
          if (_subtitleError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _subtitleError!,
                style: const TextStyle(
                    color: Color(0xFFFF9D9D), fontSize: 12.5, height: 1.5),
              ),
            ),
        ],
      ),
    ).then((_) {
      _subsSheetOpen = false;
      _resetHudTimer();
    });
  }

  Future<void> _selectSubtitle(SubtitleTrack track) async {
    Navigator.pop(context);
    setState(() => _subtitleError = null);
    DynamicIsland.show(context, 'Loading ${track.language}…',
        icon: Icons.closed_caption_rounded,
        duration: const Duration(seconds: 1));
    final text = await SubtitleService.download(track);
    if (!mounted) return;
    if (text == null) {
      setState(() {
        _subtitleError =
            'Subtitle download failed — try another language.';
      });
      _showSubtitlePicker();
      return;
    }
    await _controller?.setupSubtitleSource(
      BetterPlayerSubtitlesSource(
        type: BetterPlayerSubtitlesSourceType.memory,
        name: track.language,
        content: text,
        selectedByDefault: true,
      ),
    );
    if (!mounted) return;
    setState(() {
      _currentSubtitleName = track.language;
      _subtitleError = null;
    });
    DynamicIsland.show(context, 'Subtitles → ${track.language}',
        icon: Icons.closed_caption_rounded);
  }

  Widget _buildTopBar() {
    // Web parity: the top bar carries only Back. Title lives in the bottom
    // title block; settings live in the transport row.
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        decoration: const BoxDecoration(gradient: PlayerUi.topGradient),
        child: SafeArea(
          bottom: false,
          child: Row(
            children: [
              SizedBox(
                width: PlayerUi.btnSize,
                height: PlayerUi.btnSize,
                child: IconButton(
                  icon: const Icon(Icons.arrow_back_rounded,
                      color: Colors.white, size: 24),
                  tooltip: 'Back',
                  onPressed: () => Navigator.pop(context),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCenterControls() {
    // Web parity: the Rewind / Play / Forward trio shows only while paused
    // with content (play flash is transient; see Phase B HUDs).
    if (_isPlaying || _isBuffering || _showEndCard) {
      return const SizedBox.shrink();
    }
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _CenterControlBtn(
            icon: Icons.chevron_left_rounded,
            ghost: true,
            onTap: () {
              final step = Provider.of<UserDataProvider>(context, listen: false).seekStepSeconds;
              _seekBy(-step);
              DynamicIsland.show(context, '-${step}s', icon: Icons.replay_10_rounded);
            },
          ),
          const SizedBox(width: PlayerUi.centerGap),
          _CenterControlBtn(
            icon: Icons.play_arrow_rounded,
            filled: true,
            onTap: _togglePlayPause,
          ),
          const SizedBox(width: PlayerUi.centerGap),
          _CenterControlBtn(
            icon: Icons.chevron_right_rounded,
            ghost: true,
            onTap: () {
              final step = Provider.of<UserDataProvider>(context, listen: false).seekStepSeconds;
              _seekBy(step);
              DynamicIsland.show(context, '+${step}s', icon: Icons.forward_10_rounded);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar() {
    final position = _isScrubbing ? _scrubPosition : _lastPosition;
    final total = _duration;
    final progress =
        total.inMilliseconds > 0 ? position.inMilliseconds / total.inMilliseconds : 0.0;

    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
        decoration: const BoxDecoration(gradient: PlayerUi.bottomGradient),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Title block + clock (web touch layout).
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.movie.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                            height: 1.1,
                          ),
                        ),
                        if (widget.movie.isSeries)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              'S$_currentSeason:E$_currentEpisode',
                              style: TextStyle(
                                  color: PlayerUi.text(0.7), fontSize: 14, fontWeight: FontWeight.w500),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Text(
                    '${_formatDuration(position)} / ${_formatDuration(total)}',
                    style: TextStyle(
                      color: PlayerUi.text(0.9),
                      fontSize: 13,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
              if (_engine == _PlayerEngine.native) ...[
                _SeekBar(
                  progress: progress.clamp(0.0, 1.0),
                  buffered: _bufferedFraction(progress.clamp(0.0, 1.0)),
                  active: _isScrubbing,
                  bubbleLabel:
                      _isScrubbing ? _formatDuration(_scrubPosition) : null,
                  accentColor: PlayerUi.red,
                  onDragStart: _onScrubStart,
                  onDragUpdate: _onScrubUpdate,
                  onDragEnd: _onScrubEnd,
                ),
              ],
              // Transport row (web touch order).
              Row(
                children: [
                  _transportBtn(
                    icon: _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    tooltip: _isPlaying ? 'Pause' : 'Play',
                    size: PlayerUi.playPauseIcon,
                    onTap: _togglePlayPause,
                  ),
                  _transportBtn(
                    icon: _muted || _currentVolume == 0
                        ? Icons.volume_off_rounded
                        : _currentVolume < 0.5
                            ? Icons.volume_down_rounded
                            : Icons.volume_up_rounded,
                    tooltip: _muted ? 'Unmute' : 'Mute',
                    onTap: _toggleMute,
                  ),
                  const Spacer(),
                  if (widget.movie.isSeries) ...[
                    _transportBtn(
                      icon: Icons.skip_previous_rounded,
                      tooltip: 'Previous episode',
                      dimmed: !_hasPrevEpisode,
                      onTap: _hasPrevEpisode ? _goPrevEpisode : null,
                    ),
                    _transportBtn(
                      icon: Icons.skip_next_rounded,
                      tooltip: 'Next episode',
                      dimmed: !_hasNextEpisode,
                      onTap: _hasNextEpisode ? _nextEpisode : null,
                    ),
                  ],
                  _transportBtn(
                    icon: Icons.video_library_rounded,
                    tooltip: 'Episodes',
                    onTap: widget.movie.isSeries ? _showEpisodesDrawer : null,
                    dimmed: !widget.movie.isSeries,
                  ),
                  _transportBtn(
                    icon: Icons.settings_rounded,
                    tooltip: 'Settings',
                    onTap: _showSettingsSheet,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showEpisodesDrawer() {
    _hudTimer?.cancel();
    Scaffold.of(context).openEndDrawer();
  }

  /// Same-season episode list for the drawer (Up-Next uses the same data).
  Widget _buildEpisodesDrawer() {
    return Drawer(
      backgroundColor: AppTheme.surface,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                'Season $_currentSeason · ${_episodes.length} episodes',
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            const Divider(color: Colors.white10, height: 1),
            Expanded(
              child: _isLoadingEpisodes
                  ? const Center(child: CircularProgressIndicator(color: AppTheme.accentLime, strokeWidth: 2.5))
                  : _episodes.isEmpty
                      ? const Center(
                          child: Text('No episodes available',
                              style: TextStyle(color: AppTheme.textFaint)),
                        )
                      : ListView.builder(
                          itemCount: _episodes.length,
                          itemBuilder: (_, i) {
                            final ep = _episodes[i];
                            final playing = ep.episodeNumber == _currentEpisode;
                            return ListTile(
                              leading: ep.stillUrl.isNotEmpty
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(6),
                                      child: Image.network(ep.stillUrl,
                                          width: 72, height: 42, fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) =>
                                              const SizedBox(width: 72, height: 42)),
                                    )
                                  : Container(
                                      width: 72,
                                      height: 42,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                          color: Colors.white10,
                                          borderRadius: BorderRadius.circular(6)),
                                      child: Text('${ep.episodeNumber}',
                                          style: const TextStyle(
                                              color: Colors.white, fontWeight: FontWeight.bold)),
                                    ),
                              title: Text(
                                'E${ep.episodeNumber} · ${ep.name}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    color: playing ? AppTheme.accentLime : Colors.white,
                                    fontWeight: playing ? FontWeight.bold : FontWeight.normal,
                                    fontSize: 13),
                              ),
                              subtitle: ep.formattedDuration.isNotEmpty
                                  ? Text(ep.formattedDuration,
                                      style: const TextStyle(
                                          color: AppTheme.textFaint, fontSize: 11))
                                  : null,
                              trailing: playing
                                  ? const Icon(Icons.play_arrow_rounded, color: AppTheme.accentLime)
                                  : null,
                              onTap: playing ? null : () => _playEpisode(ep.episodeNumber),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }

  void _resetHudTimer() {
    if (!_isPlaying || _isScrubbing) return;
    _hudTimer?.cancel();
    _hudTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _isPlaying && !_isScrubbing) {
        setState(() => _showHud = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: true,
      child: Scaffold(
        backgroundColor: Colors.black,
        endDrawer: widget.movie.isSeries ? _buildEpisodesDrawer() : null,
        body: GestureDetector(
          onTapDown: _handleTapDown,
          onLongPressStart: _handleHoldStart,
          onLongPressEnd: _handleHoldEnd,
          onScaleStart: _handleScaleStart,
          onScaleUpdate: _handleScaleUpdate,
          onScaleEnd: _handleScaleEnd,
          onVerticalDragStart: _engine == _PlayerEngine.native ? _onVerticalDragStart : null,
          onVerticalDragUpdate: _engine == _PlayerEngine.native ? _onVerticalDragUpdate : null,
          onVerticalDragEnd: _engine == _PlayerEngine.native ? _onVerticalDragEnd : null,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (_engine == _PlayerEngine.native && _controller != null)
                Transform.scale(
                  scale: _videoScale,
                  child: BetterPlayer(controller: _controller!),
                )
              else if (_engine == _PlayerEngine.webview && _webController != null)
                WebViewWidget(controller: _webController!)
              else
                _buildSplash(),
                
              if (_showSpinner || _engine == _PlayerEngine.resolving || _switchingSource)
                _buildBufferingOverlay(),
                
              if (_engine == _PlayerEngine.error)
                _buildErrorView(),
                
              if (_showEndCard)
                _buildEndCard(),

              if (_resumeAt != null)
                _buildResumeCard(),

              if (_upNextNumber != null)
                _buildUpNextCard(),

              if (_feedbackText != null)
                _buildFeedbackPill(),

              // Transient HUD pills (web parity): pointer-transparent,
              // self-fading, above the video but below nothing interactive.
              AnimatedOpacity(
                opacity: (_hudKind != null || _hold2x) ? 1.0 : 0.0,
                duration: const Duration(milliseconds: 180),
                child: IgnorePointer(
                  child: Stack(
                    children: [
                      if (_hold2x)
                        const PlayerHud(kind: 'hold2x', value: ''),
                      if (_hudKind != null && _hudKind != 'hold2x')
                        PlayerHud(
                          kind: _hudKind!,
                          value: _hudValue,
                          volume: _muted ? 0 : _currentVolume,
                          muted: _muted,
                        ),
                    ],
                  ),
                ),
              ),

              AnimatedOpacity(
                opacity: _showHud ? 1.0 : 0.0,
                duration: const Duration(milliseconds: 220),
                child: IgnorePointer(
                  ignoring: !_showHud,
                  child: Stack(
                    children: [
                      _buildTopBar(),
                      if (_engine == _PlayerEngine.native)
                        _buildCenterControls(),
                      if (_showSkipIntroButton)
                        Positioned(
                          bottom: 90,
                          right: 20,
                          child: ElevatedButton.icon(
                            onPressed: () {
                              _controller?.seekTo(
                                  Duration(seconds: _introTarget()));
                              setState(() => _showSkipIntroButton = false);
                            },
                            icon: const Icon(Icons.fast_forward_rounded, color: Colors.black, size: 20),
                            label: const Text('Skip Intro', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.accentLime,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            ),
                          ),
                        ),
                      _buildBottomBar(),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSplash() {
    return Stack(
      fit: StackFit.expand,
      children: [
        if ((widget.movie.backdropPath?.isNotEmpty ?? false))
          Image.network(
            'https://image.tmdb.org/t/p/w780${widget.movie.backdropPath}',
            fit: BoxFit.cover,
            color: Colors.black54,
            colorBlendMode: BlendMode.darken,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        const Center(
          child: NetflixLoader(size: 45),
        ),
      ],
    );
  }

  Widget _buildBufferingOverlay() {
    return Container(
      color: Colors.black.withValues(alpha: 0.3),
      child: const Center(
        child: NetflixLoader(size: 45),
      ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 32),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 22),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.85),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white24),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, color: AppTheme.accentCrimson, size: 44),
            const SizedBox(height: 10),
            const Text('Playback Error',
                style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(_errorDetail ?? 'Failed to load video.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppTheme.textFaint, fontSize: 13, height: 1.4)),
            const SizedBox(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton.icon(
                  onPressed: () {
                    setState(() { _engine = _PlayerEngine.resolving; _errorDetail = null; });
                    _startPlayback();
                  },
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Retry'),
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentLime, foregroundColor: Colors.black),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back_rounded, size: 18, color: Colors.white),
                  label: const Text('Back', style: TextStyle(color: Colors.white)),
                  style: OutlinedButton.styleFrom(
                      side: BorderSide(color: Colors.white.withValues(alpha: 0.4))),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEndCard() {
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 32),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 22),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.85),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white24),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_rounded, color: AppTheme.accentLime, size: 44),
            const SizedBox(height: 10),
            const Text('Playback finished',
                style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
            const SizedBox(height: 18),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: _replay,
                  icon: const Icon(Icons.replay_rounded, color: AppTheme.accentLime),
                  label: const Text('Replay', style: TextStyle(color: AppTheme.accentLime)),
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: AppTheme.accentLime)),
                ),
                if (_hasNextEpisode)
                  ElevatedButton.icon(
                    onPressed: _nextEpisode,
                    icon: const Icon(Icons.skip_next_rounded),
                    label: Text('Episode ${_currentEpisode + 1}'),
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentLime, foregroundColor: Colors.black),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Resume card (web parity): bottom-right, countdown ticks while playing.
  Widget _buildResumeCard() {
    final at = Duration(seconds: _resumeAt!.round());
    return Positioned(
      right: 24,
      bottom: 120,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: PlayerUi.cardBg,
          borderRadius: BorderRadius.circular(PlayerUi.cardRadius),
          boxShadow: const [
            BoxShadow(color: Color(0xCC000000), blurRadius: 32, offset: Offset(0, 8)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Left off at ${_formatDuration(at)}',
              style: const TextStyle(
                  color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            Text(
              _resumeLeft > 0
                  ? 'Auto-resuming in ${_resumeLeft}s'
                  : 'Resuming…',
              style: TextStyle(color: PlayerUi.text(0.6), fontSize: 12),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ElevatedButton(
                  onPressed: _commitResume,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(3)),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 8),
                  ),
                  child: const Text('Resume',
                      style:
                          TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () {
                    _dismissResume();
                    _controller?.seekTo(Duration.zero);
                    _controller?.play();
                  },
                  style: OutlinedButton.styleFrom(
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(3)),
                    side: BorderSide(
                        color: Colors.white.withValues(alpha: 0.4)),
                  ),
                  child: const Text('Restart',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Up-Next card (web parity, TV-only): 15s countdown bar + cancel + Play now.
  Widget _buildUpNextCard() {
    final frac = (_upNextLeft / 15).clamp(0.0, 1.0);
    final title = _upNextTitle != null && _upNextTitle!.isNotEmpty
        ? 'E$_upNextNumber · $_upNextTitle'
        : 'Episode $_upNextNumber';
    return Positioned(
      right: 24,
      bottom: 120,
      child: Container(
        width: 260,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: PlayerUi.cardBg,
          borderRadius: BorderRadius.circular(PlayerUi.cardRadius),
          boxShadow: const [
            BoxShadow(color: Color(0xCC000000), blurRadius: 32, offset: Offset(0, 8)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('UP NEXT',
                    style: TextStyle(
                        color: PlayerUi.text(0.55),
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.8)),
                const Spacer(),
                GestureDetector(
                  onTap: _cancelUpNext,
                  child: const Icon(Icons.close_rounded,
                      color: Colors.white, size: 16),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Container(
              height: 3,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Align(
                alignment: Alignment.centerLeft,
                child: FractionallySizedBox(
                  widthFactor: frac,
                  child: Container(
                    decoration: BoxDecoration(
                      color: PlayerUi.red,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Playing in ${_upNextLeft}s',
              style: TextStyle(color: PlayerUi.text(0.6), fontSize: 12),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  _upNextTimer?.cancel();
                  _nextEpisode();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(3)),
                ),
                child: const Text('Play now',
                    style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFeedbackPill() {
    return Center(
      child: ScaleTransition(
        scale: _feedbackScaleAnim,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(30),
          ),
          child: Text(
            _feedbackText ?? '',
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ),
      ),
    );
  }


}

class _CenterControlBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;
  final bool ghost;

  const _CenterControlBtn({
    required this.icon,
    required this.onTap,
    this.filled = false,
    this.ghost = false,
  });

  @override
  Widget build(BuildContext context) {
    if (filled) {
      // Web parity: solid white 92px circle, black glyph, elevation shadow.
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(48),
          child: Container(
            width: PlayerUi.centerPlayCircle,
            height: PlayerUi.centerPlayCircle,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: Color(0x99000000), blurRadius: 30, offset: Offset(0, 10)),
              ],
            ),
            child: const Icon(Icons.play_arrow_rounded,
                color: Colors.black, size: PlayerUi.centerPlayIcon),
          ),
        ),
      );
    }
    // Ghost chevrons with legibility shadow (pause-cluster sides).
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(48),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Icon(
            icon,
            color: Colors.white,
            size: PlayerUi.centerSideIcon,
            shadows: const [Shadow(color: Color(0xCC000000), blurRadius: 6)],
          ),
        ),
      ),
    );
  }
}

/// Seek bar — mirrors the web scrubber: thin track, white buffered layer,
/// red played fill, knob that grows while scrubbing, time bubble above it.
class _SeekBar extends StatelessWidget {
  final double progress; // 0..1
  final double buffered; // 0..1
  final bool active; // scrubbing / hover
  final String? bubbleLabel;
  final Color accentColor;
  final void Function(double) onDragStart;
  final void Function(double) onDragUpdate;
  final Future<void> Function(double) onDragEnd;

  const _SeekBar({
    required this.progress,
    this.buffered = 0,
    this.active = false,
    this.bubbleLabel,
    required this.accentColor,
    required this.onDragStart,
    required this.onDragUpdate,
    required this.onDragEnd,
  });

  double _normalize(double dx, double width) => (dx / width).clamp(0.0, 1.0);




  @override
  Widget build(BuildContext context) {
    final knob = active ? PlayerUi.knobActive : PlayerUi.knobIdle;
    final trackH =
        active ? PlayerUi.trackHeightActive : PlayerUi.trackHeightIdle;
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (d) {
            onDragStart(_normalize(d.localPosition.dx, width));
            onDragEnd(_normalize(d.localPosition.dx, width));
          },
          onHorizontalDragStart: (d) =>
              onDragStart(_normalize(d.localPosition.dx, width)),
          onHorizontalDragUpdate: (d) =>
              onDragUpdate(_normalize(d.localPosition.dx, width)),
          onHorizontalDragEnd: (d) =>
              onDragEnd(_normalize(0, 1)), // uses last scrubPosition
          child: SizedBox(
            height: PlayerUi.scrubHitHeight,
            width: double.infinity,
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Track
                Container(
                  height: trackH,
                  decoration: BoxDecoration(
                    color: PlayerUi.trackBase,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                // Buffered ahead
                Align(
                  alignment: Alignment.centerLeft,
                  child: FractionallySizedBox(
                    widthFactor: buffered.clamp(0.0, 1.0),
                    child: Container(
                      height: trackH,
                      decoration: BoxDecoration(
                        color: PlayerUi.trackBuffered,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                ),
                // Played portion
                Align(
                  alignment: Alignment.centerLeft,
                  child: FractionallySizedBox(
                    widthFactor: progress,
                    child: Container(
                      height: trackH,
                      decoration: BoxDecoration(
                        color: accentColor,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                ),
                // Knob
                Align(
                  alignment: Alignment(progress * 2 - 1, 0),
                  child: Container(
                    width: knob,
                    height: knob,
                    decoration: BoxDecoration(
                      color: accentColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.6),
                          blurRadius: 6,
                          offset: const Offset(0, 1),
                        ),
                      ],
                    ),
                  ),
                ),
                // Hover time bubble while scrubbing
                if (active && bubbleLabel != null)
                  Positioned(
                    bottom: 28,
                    left: (progress * width)
                        .clamp(48.0, (width - 48).clamp(48.0, width)),
                    child: Transform.translate(
                      offset: const Offset(-24, 0),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.8),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          bubbleLabel!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}


















