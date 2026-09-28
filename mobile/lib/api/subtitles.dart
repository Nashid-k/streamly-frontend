import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// OpenSubtitles track + fetch, mirroring the web `SubtitleFetcher`.
///
/// Unlike a browser, Dart CAN set `User-Agent`, so both legs work directly —
/// no relay needed. Downloads are `.gz`: sniffed by magic bytes (the
/// endpoint serves them without `content-encoding`) and gunzipped with the
/// built-in codec before the timestamp check.
class SubtitleTrack {
  final String language;
  final String languageId;
  final String downloadLink;

  const SubtitleTrack({
    required this.language,
    required this.languageId,
    required this.downloadLink,
  });
}

class SubtitleService {
  SubtitleService._();

  /// Legacy UA the OpenSubtitles download endpoint still gates on.
  static const String userAgent = 'TemporaryUserAgent';
  static const Duration timeout = Duration(seconds: 15);

  /// Available SRT tracks for an IMDb id (falls back to title search),
  /// deduplicated per language like the web client.
  static Future<List<SubtitleTrack>> search({
    String? imdbId,
    String title = '',
  }) async {
    try {
      String? url;
      if (imdbId != null && imdbId.isNotEmpty) {
        final clean = imdbId.replaceFirst(RegExp(r'^tt'), '').padLeft(7, '0');
        url = 'https://rest.opensubtitles.org/search/imdbid-$clean';
      } else if (title.isNotEmpty) {
        final safe =
            Uri.encodeComponent(title.toLowerCase()).replaceAll('%20', '+');
        url = 'https://rest.opensubtitles.org/search/query-$safe';
      } else {
        debugPrint('[Streamly][subtitles] search skipped — no imdbId or title.');
        return [];
      }
      final res = await http
          .get(Uri.parse(url), headers: {'User-Agent': userAgent})
          .timeout(timeout);
      if (res.statusCode != 200) {
        debugPrint('[Streamly][subtitles] search answered ${res.statusCode}.');
        return [];
      }
      final data = jsonDecode(res.body) as List;
      final byLanguage = <String, SubtitleTrack>{};
      for (final s in data) {
        if (s is! Map || s['SubFormat'] != 'srt') continue;
        final lang = s['LanguageName'] as String? ?? 'Unknown';
        byLanguage.putIfAbsent(
          lang,
          () => SubtitleTrack(
            language: lang,
            languageId: s['SubLanguageID'] as String? ?? lang,
            downloadLink: s['SubDownloadLink'] as String? ?? '',
          ),
        );
      }
      final out = byLanguage.values.toList()
        ..sort((a, b) => a.language.compareTo(b.language));
      return out.where((t) => t.downloadLink.isNotEmpty).toList();
    } catch (e) {
      debugPrint('[Streamly][subtitles] search failed: $e');
      return [];
    }
  }

  /// Download + decompress one track. Returns caption text, or null when the
  /// body is not subtitle-shaped (error page, undecodable bytes).
  static Future<String?> download(SubtitleTrack track) async {
    try {
      final res = await http
          .get(Uri.parse(track.downloadLink),
              headers: {'User-Agent': userAgent})
          .timeout(timeout);
      if (res.statusCode != 200) {
        debugPrint(
            '[Streamly][subtitles] download answered ${res.statusCode}.');
        return null;
      }
      List<int> decoded = res.bodyBytes;
      if (decoded.length >= 2 && decoded[0] == 0x1f && decoded[1] == 0x8b) {
        try {
          decoded = GZipCodec().decode(decoded);
        } catch (e) {
          debugPrint('[Streamly][subtitles] gunzip failed: $e');
          return null;
        }
      }
      final text = utf8.decode(decoded, allowMalformed: true);
      if (!isSubtitleText(text)) {
        debugPrint(
            '[Streamly][subtitles] body has no timestamp lines — refusing.');
        return null;
      }
      return text;
    } catch (e) {
      debugPrint('[Streamly][subtitles] download failed: $e');
      return null;
    }
  }

  /// True when the text carries at least one SRT/VTT timestamp line.
  static bool isSubtitleText(String text) {
    return RegExp(r'\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->').hasMatch(text);
  }
}
