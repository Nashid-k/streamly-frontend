import 'dart:async';
import 'dart:collection';
import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'stream_resolver.dart';

/// WebView-based stream sniffer.
///
/// Some embed providers build their .m3u8 only in browser JS (encrypted
/// second-stage fetches). Loading the page headlessly and listening to
/// resource loads lets THEIR player produce the URL — then ExoPlayer plays it.
class EmbedSniffer {
  static const Duration _timeout = Duration(seconds: 25);
  static final Map<String, ResolvedStream> _cache = {};

  HeadlessInAppWebView? _webview;
  final Queue<String> _recentRequests = Queue<String>();
  Completer<ResolvedStream?>? _completer;
  Timer? _timer;
  bool _busy = false;

  static final EmbedSniffer I = EmbedSniffer._();

  EmbedSniffer._();

  Future<ResolvedStream?> sniff({
    required String embedUrl,
    required String referer,
    bool isHlsPreferred = true,
  }) async {
    final cached = _cache[embedUrl];
    if (cached != null) return cached;
    if (_busy) return null; // one sniff at a time
    _busy = true;

    _completer = Completer<ResolvedStream?>();
    _recentRequests.clear();

    try {
      _webview = HeadlessInAppWebView(
        initialSettings: InAppWebViewSettings(
          javaScriptEnabled: true,
          mediaPlaybackRequiresUserGesture: false,
          userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
          transparentBackground: true,
          useHybridComposition: true,
        ),
        initialUrlRequest: URLRequest(url: WebUri(embedUrl)),
        shouldOverrideUrlLoading: (controller, action) async {
          final url = action.request.url.toString();
          _inspect(url);
          // Block nothing: main-frame navigations stay (popups are blocked by
          // window.open replacement below), subframes must keep loading.
          return NavigationActionPolicy.ALLOW;
        },
        onLoadResource: (controller, resource) {
          final url = resource.url?.toString() ?? '';
          _inspect(url);
        },
        onConsoleMessage: (controller, msg) {
          // Some players log their resolved source.
          final m = RegExp(r'https?://[^\s"]+\.m3u8[^\s"]*').firstMatch(msg.message);
          if (m != null) _inspect(m.group(0)!);
        },
        onLoadStop: (controller, url) async {
          // Nudge autoplay for players that require a gesture.
          try {
            await controller.evaluateJavascript(source: '''
              document.querySelectorAll('video').forEach(v => { v.muted = true; v.play().catch(function(){}); });
              document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.postMessage('{"event":"play","args":{}}','*'); } catch(e){} });
            ''');
          } catch (_) {}
        },
      );

      await _webview!.run();
      _timer = Timer(_timeout, () {
        if (!(_completer?.isCompleted ?? true)) {
          _completer?.complete(null);
        }
      });

      final result = await _completer!.future;
      if (result != null) _cache[embedUrl] = result;
      return result;
    } catch (e) {
      debugPrint('[Streamly][EmbedSniffer] error: $e');
      return null;
    } finally {
      _timer?.cancel();
      try {
        await _webview?.dispose();
      } catch (_) {}
      _webview = null;
      _busy = false;
    }
  }

  void _inspect(String url) {
    if (url.isEmpty) return;
    _recentRequests.addLast(url);
    while (_recentRequests.length > 50) {
      _recentRequests.removeFirst();
    }

    final isStream =
        RegExp(r'\.m3u8(\?|$)', caseSensitive: false).hasMatch(url) ||
        RegExp(r'\.mpd(\?|$)', caseSensitive: false).hasMatch(url) ||
        RegExp(r'\.mp4(\?|$)', caseSensitive: false).hasMatch(url);
    if (!isStream) return;
    if (RegExp(r'(ads?|doubleclick|track)', caseSensitive: false).hasMatch(url)) return;

    final type = url.toLowerCase().contains('.m3u8')
        ? 'hls'
        : url.toLowerCase().contains('.mpd')
            ? 'dash'
            : 'mp4';

    _completer?.complete(ResolvedStream(
      url: url,
      type: type,
      headers: const {},
      provider: 'webview-sniff',
    ));
  }

  void dispose() {
    _timer?.cancel();
    _webview?.dispose();
  }
}
