import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class VidcoreScraper {
  static const String _playerReferer = 'https://vidcore.io/';
  static const String _videasyApi =
      'https://vidrack.created.app/api/sources/videasy';
  static const String _vidzenApi = 'https://vidzen.fun/api/sources';

  /// Resolves the raw HLS stream URL for VidCore.
  /// First tries Videasy (direct quality m3u8s), then falls back to Vidzen (master m3u8).
  static Future<String?> resolveStream({
    required int tmdbId,
    required bool isSeries,
    int? season,
    int? episode,
  }) async {
    final type = isSeries ? 'tv' : 'movie';
    final sTmdbId = tmdbId.toString();

    // 1. Try Videasy API
    try {
      final uri = Uri.parse(_videasyApi).replace(
        queryParameters: {
          'id': sTmdbId,
          'type': type,
          if (isSeries && season != null) 'season': season.toString(),
          if (isSeries && episode != null) 'episode': episode.toString(),
        },
      );

      final res = await http
          .get(uri, headers: {'referer': _playerReferer})
          .timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(utf8.decode(res.bodyBytes));
        if (data is Map<String, dynamic> && data['sources'] is List) {
          final sources = (data['sources'] as List)
              .cast<Map<String, dynamic>>();
          // Find first valid m3u8 source
          for (final source in sources) {
            final url = source['url']?.toString() ?? '';
            if (url.isNotEmpty &&
                url.contains('.m3u8') &&
                !url.toLowerCase().contains('cap.php')) {
              debugPrint('[VidcoreScraper] Resolved via Videasy: $url');
              return url;
            }
          }
        }
      }
    } catch (e) {
      debugPrint('[VidcoreScraper] Videasy error: $e');
    }

    // 2. Try Vidzen API Fallback
    try {
      final uri = Uri.parse(_vidzenApi).replace(
        queryParameters: {
          'type': type,
          'id': sTmdbId,
          if (isSeries && season != null) 'season': season.toString(),
          if (isSeries && episode != null) 'episode': episode.toString(),
        },
      );

      final res = await http
          .get(uri, headers: {'referer': _playerReferer})
          .timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(utf8.decode(res.bodyBytes));
        if (data is Map<String, dynamic> && data['sources'] is List) {
          final sources = (data['sources'] as List)
              .cast<Map<String, dynamic>>();
          final first = sources.firstWhere(
            (s) => (s['url']?.toString() ?? '').isNotEmpty,
            orElse: () => {},
          );
          if (first.isNotEmpty) {
            final url = first['url'].toString();
            // Resolve relative URLs if needed, but usually it returns a path like "/api/stream/..."
            final masterUrl = Uri.parse(_vidzenApi).resolve(url).toString();
            debugPrint('[VidcoreScraper] Resolved via Vidzen: $masterUrl');
            return masterUrl;
          }
        }
      }
    } catch (e) {
      debugPrint('[VidcoreScraper] Vidzen error: $e');
    }

    debugPrint('[VidcoreScraper] Failed to resolve stream.');
    return null;
  }
}
