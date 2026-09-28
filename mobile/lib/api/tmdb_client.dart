import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class TmdbClient {
  static const String apiKey = '522f1f08eda5e03bf93100ba29471d5d';
  // Same-origin production proxy: works on all ISPs without DNS blockades
  static const String proxyBase = 'https://streamlyvercelin.vercel.app/api/tmdb';
  static const String directBase = 'https://api.themoviedb.org/3';

  static final http.Client _client = http.Client();

  static Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? params,
  }) async {
    final queryParams = <String, String>{
      'api_key': apiKey,
    };

    if (params != null) {
      params.forEach((key, value) {
        if (value != null) {
          queryParams[key] = value.toString();
        }
      });
    }

    // 1. Try Vercel same-origin proxy first (works universally on all cellular / Wi-Fi networks)
    try {
      final proxyUri = Uri.parse('$proxyBase$path').replace(queryParameters: queryParams);
      final response = await _client.get(proxyUri).timeout(const Duration(seconds: 8));
      if (response.statusCode >= 200 && response.statusCode < 300) {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map<String, dynamic>) {
          return decoded;
        }
        return {'results': decoded};
      }
    } catch (e) {
      if (kDebugMode) {
        print('[Streamly][TMDB] Proxy request failed, falling back to direct: $e');
      }
    }

    // 2. Direct fallback
    try {
      final directUri = Uri.parse('$directBase$path').replace(queryParameters: queryParams);
      final response = await _client.get(directUri).timeout(const Duration(seconds: 8));
      if (response.statusCode >= 200 && response.statusCode < 300) {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map<String, dynamic>) {
          return decoded;
        }
        return {'results': decoded};
      } else {
        throw Exception('TMDB error: ${response.statusCode}');
      }
    } catch (e) {
      if (kDebugMode) {
        print('[Streamly][TMDB] Direct request failed: $e');
      }
      rethrow;
    }
  }
}
