import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'vidcore_scraper.dart';

/// Result of resolving an embed server into a DIRECT playable stream
/// (the same contract AniVortex's signed backend returns to its native player).
class ResolvedStream {
  final String url; // playback URL (usually Streamly same-origin /api/proxy)
  final String type; // hls | dash | mp4
  final Map<String, String> headers;
  final String provider;

  const ResolvedStream({
    required this.url,
    required this.type,
    required this.headers,
    required this.provider,
  });

  bool get isHls => type == 'hls';
  bool get isDash => type == 'dash';

  factory ResolvedStream.fromJson(Map<String, dynamic> json) => ResolvedStream(
    url: json['url'] as String? ?? '',
    type: json['type'] as String? ?? 'hls',
    headers: (json['headers'] as Map<String, dynamic>? ?? {}).map(
      (k, v) => MapEntry(k, v.toString()),
    ),
    provider: json['provider'] as String? ?? 'unknown',
  );
}

/// Streamly stream resolver client.
///
/// Calls our Vercel function (api/source.js) which fetches the embed page
/// server-side and extracts the direct .m3u8/.mpd/.mp4 URL — the native
/// equivalent of what AniVortex does with its private signed API.
class StreamResolver {
  // Same-origin production function host (mirrors TmdbClient.proxyBase).
  static const String _base = 'https://streamlyvercelin.vercel.app/api/source';
  static const String _clientTag = 'streamly-mobile/1.0';

  static final http.Client _client = http.Client();
  static final Map<String, ResolvedStream> _cache = {};

  /// Resolve a direct stream for [serverKey] ('vidsrc', 'vidlink',
  /// 'twoembed', 'smashystream', or '' = auto-across-providers).
  static Future<ResolvedStream?> resolve({
    required String serverKey,
    required int tmdbId,
    bool isSeries = false,
    int? season,
    int? episode,
    String? imdbId,
  }) async {
    if (tmdbId <= 0) return null;

    final cacheKey =
        '$serverKey|$tmdbId|${isSeries ? season : null}|${isSeries ? episode : null}|$imdbId';
    final cached = _cache[cacheKey];
    if (cached != null) return cached;

    // Native scrapers
    if (serverKey == 'vidcore') {
      final url = await VidcoreScraper.resolveStream(
        tmdbId: tmdbId,
        isSeries: isSeries,
        season: season,
        episode: episode,
      );
      if (url != null) {
        final resolved = ResolvedStream(
          url: url,
          type: url.contains('.m3u8') ? 'hls' : 'mp4',
          headers: const {'referer': 'https://vidcore.io/'},
          provider: 'VidCore',
        );
        _cache[cacheKey] = resolved;
        return resolved;
      }
      return null;
    }

    final params = <String, String>{
      'server': serverKey,
      'tmdb': '$tmdbId',
      if (isSeries && season != null) 's': '$season',
      if (isSeries && episode != null) 'e': '$episode',
      if (imdbId != null && imdbId.isNotEmpty) 'imdb': imdbId,
    };

    final uri = Uri.parse(_base).replace(queryParameters: params);
    try {
      final res = await _client
          .get(uri, headers: {'X-Streamly-Client': _clientTag})
          .timeout(const Duration(seconds: 15));

      if (res.statusCode != 200) {
        debugPrint(
          '[Streamly][StreamResolver] HTTP ${res.statusCode} for $serverKey',
        );
        return null;
      }
      final body = jsonDecode(utf8.decode(res.bodyBytes));
      if (body is! Map<String, dynamic> || body['ok'] != true) {
        debugPrint(
          '[Streamly][StreamResolver] resolve failed: ${body is Map ? body['error'] : 'bad body'}',
        );
        return null;
      }
      final resolved = ResolvedStream.fromJson(body);
      if (resolved.url.isEmpty) return null;
      _cache[cacheKey] = resolved;
      debugPrint(
        '[Streamly][StreamResolver] resolved ${resolved.provider}/${resolved.type} for tmdb=$tmdbId',
      );
      return resolved;
    } catch (e) {
      debugPrint('[Streamly][StreamResolver] request failed: $e');
      return null;
    }
  }

  static void clearCache() => _cache.clear();
}
