import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/movie.dart';
import '../models/user_data.dart';
import '../theme/app_theme.dart';

class UserDataProvider extends ChangeNotifier {
  static const String _keyMyList = 'aios_my_list';
  static const String _keyContinueWatching = 'aios_continue_watching';
  static const String _keyCollections = 'aios_my_collections';
  static const String _keySearchHistory = 'aios_search_history';
  static const String _keyDefaultServer = 'setting_defaultServer';
  static const String _keyAccentColor = 'setting_accentColor';
  static const String _keyAutoSkipIntro = 'setting_autoSkipIntro';
  static const String _keyAutoPlayNext = 'setting_autoPlayNext';
  static const String _keySeekStep = 'setting_seekStep';

  List<WatchlistItem> _watchlist = [];
  List<ContinueWatchingItem> _continueWatching = [];
  List<CustomCollection> _collections = [];
  List<String> _searchHistory = [];

  int _defaultServerIndex = 0;
  Color _accentColor = AppTheme.accentLime;
  bool _autoSkipIntro = true;
  bool _autoPlayNext = true;
  int _seekStepSeconds = 10;

  List<WatchlistItem> get watchlist => _watchlist;
  List<ContinueWatchingItem> get continueWatching => _continueWatching;
  List<CustomCollection> get collections => _collections;
  List<String> get searchHistory => _searchHistory;

  int get defaultServerIndex => _defaultServerIndex;
  Color get accentColor => _accentColor;
  bool get autoSkipIntro => _autoSkipIntro;
  bool get autoPlayNext => _autoPlayNext;
  int get seekStepSeconds => _seekStepSeconds;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();

    // Watchlist
    final wlRaw = prefs.getStringList(_keyMyList) ?? [];
    _watchlist = wlRaw
        .map((s) {
          try {
            return WatchlistItem.fromJson(jsonDecode(s));
          } catch (_) {
            return null;
          }
        })
        .whereType<WatchlistItem>()
        .toList();

    // Continue Watching
    final cwRaw = prefs.getStringList(_keyContinueWatching) ?? [];
    _continueWatching = cwRaw
        .map((s) {
          try {
            return ContinueWatchingItem.fromJson(jsonDecode(s));
          } catch (_) {
            return null;
          }
        })
        .whereType<ContinueWatchingItem>()
        .toList()
      ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));

    // Collections
    final colRaw = prefs.getStringList(_keyCollections) ?? [];
    _collections = colRaw
        .map((s) {
          try {
            return CustomCollection.fromJson(jsonDecode(s));
          } catch (_) {
            return null;
          }
        })
        .whereType<CustomCollection>()
        .toList();

    // Search History
    _searchHistory = prefs.getStringList(_keySearchHistory) ?? [];

    // Settings
    _defaultServerIndex = prefs.getInt(_keyDefaultServer) ?? 0;
    final accentVal = prefs.getInt(_keyAccentColor);
    if (accentVal != null) {
      _accentColor = Color(accentVal);
    }
    _autoSkipIntro = prefs.getBool(_keyAutoSkipIntro) ?? true;
    _autoPlayNext = prefs.getBool(_keyAutoPlayNext) ?? true;
    _seekStepSeconds = prefs.getInt(_keySeekStep) ?? 10;

    notifyListeners();
  }

  // --- Watchlist ---
  bool isInWatchlist(int tmdbId) {
    return _watchlist.any((item) => item.tmdbId == tmdbId);
  }

  Future<void> toggleWatchlist(Movie movie) async {
    final existingIndex = _watchlist.indexWhere((item) => item.tmdbId == movie.id);
    if (existingIndex >= 0) {
      _watchlist.removeAt(existingIndex);
    } else {
      _watchlist.insert(
        0,
        WatchlistItem(
          tmdbId: movie.id,
          isSeries: movie.isSeries,
          title: movie.title,
          posterPath: movie.posterPath,
          rating: movie.rating,
          releaseYear: movie.releaseYear,
          addedAt: DateTime.now().millisecondsSinceEpoch,
        ),
      );
    }
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _keyMyList,
      _watchlist.map((i) => jsonEncode(i.toJson())).toList(),
    );
  }

  // --- Continue Watching ---
  /// Saved position for a title (exact season+episode for series, tmdbId for
  /// movies) — the player seeks to this on open instead of restarting at 0.
  /// Returns null when there is nothing worth resuming.
  ContinueWatchingItem? progressFor(int tmdbId, {int? season, int? episode}) {
    for (final i in _continueWatching) {
      if (i.tmdbId != tmdbId) continue;
      if (i.isSeries) {
        if (season == null || episode == null) continue;
        if (i.season != season || i.episode != episode) continue;
      }
      // Finished (or nearly) — replay from the start, not the credits.
      if (i.durationSeconds > 0 &&
          i.positionSeconds >= i.durationSeconds - 15) {
        return null;
      }
      return i.positionSeconds > 5 ? i : null;
    }
    return null;
  }

  Future<void> recordProgress({
    required int tmdbId,
    required bool isSeries,
    required String title,
    int season = 1,
    int episode = 1,
    String? episodeTitle,
    required double positionSeconds,
    required double durationSeconds,
    String? posterPath,
    String? backdropPath,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    // Series rows are scoped to the exact episode — S2E5 must not clobber the
    // S1E1 row the way a tmdbId-only key did.
    _continueWatching.removeWhere((i) =>
        i.tmdbId == tmdbId &&
        (!isSeries || (i.season == season && i.episode == episode)));

    _continueWatching.insert(
      0,
      ContinueWatchingItem(
        tmdbId: tmdbId,
        isSeries: isSeries,
        title: title,
        season: season,
        episode: episode,
        episodeTitle: episodeTitle,
        positionSeconds: positionSeconds,
        durationSeconds: durationSeconds,
        posterPath: posterPath,
        backdropPath: backdropPath,
        updatedAt: now,
      ),
    );

    if (_continueWatching.length > 30) {
      _continueWatching = _continueWatching.sublist(0, 30);
    }

    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _keyContinueWatching,
      _continueWatching.map((i) => jsonEncode(i.toJson())).toList(),
    );
  }

  Future<void> removeContinueWatching(int tmdbId) async {
    _continueWatching.removeWhere((i) => i.tmdbId == tmdbId);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _keyContinueWatching,
      _continueWatching.map((i) => jsonEncode(i.toJson())).toList(),
    );
  }

  // --- Collections ---
  Future<void> createCollection(String name, [List<int>? itemIds]) async {
    final col = CustomCollection(
      id: 'col_${DateTime.now().millisecondsSinceEpoch}',
      name: name.trim(),
      createdAt: DateTime.now().millisecondsSinceEpoch,
      itemIds: itemIds ?? [],
    );
    _collections.insert(0, col);
    notifyListeners();
    _persistCollections();
  }

  Future<void> renameCollection(String id, String newName) async {
    final index = _collections.indexWhere((c) => c.id == id);
    if (index >= 0) {
      final old = _collections[index];
      _collections[index] = CustomCollection(
        id: old.id,
        name: newName.trim(),
        createdAt: old.createdAt,
        itemIds: old.itemIds,
      );
      notifyListeners();
      _persistCollections();
    }
  }

  Future<void> deleteCollection(String id) async {
    _collections.removeWhere((c) => c.id == id);
    notifyListeners();
    _persistCollections();
  }

  Future<void> toggleItemInCollection(String collectionId, int tmdbId) async {
    final index = _collections.indexWhere((c) => c.id == collectionId);
    if (index >= 0) {
      final col = _collections[index];
      final ids = List<int>.from(col.itemIds);
      if (ids.contains(tmdbId)) {
        ids.remove(tmdbId);
      } else {
        ids.add(tmdbId);
      }
      _collections[index] = CustomCollection(
        id: col.id,
        name: col.name,
        createdAt: col.createdAt,
        itemIds: ids,
      );
      notifyListeners();
      _persistCollections();
    }
  }

  Future<void> _persistCollections() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _keyCollections,
      _collections.map((c) => jsonEncode(c.toJson())).toList(),
    );
  }

  // --- Search History ---
  Future<void> addSearchQuery(String query) async {
    final q = query.trim();
    if (q.isEmpty) return;
    _searchHistory.remove(q);
    _searchHistory.insert(0, q);
    if (_searchHistory.length > 20) {
      _searchHistory = _searchHistory.sublist(0, 20);
    }
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_keySearchHistory, _searchHistory);
  }

  Future<void> removeSearchQuery(String query) async {
    _searchHistory.remove(query);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_keySearchHistory, _searchHistory);
  }

  Future<void> clearSearchHistory() async {
    _searchHistory.clear();
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keySearchHistory);
  }

  // --- Settings ---
  Future<void> setDefaultServer(int index) async {
    _defaultServerIndex = index;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyDefaultServer, index);
  }

  Future<void> setAccentColor(Color color) async {
    _accentColor = color;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyAccentColor, color.toARGB32());
  }

  Future<void> setAutoSkipIntro(bool val) async {
    _autoSkipIntro = val;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyAutoSkipIntro, val);
  }

  Future<void> setAutoPlayNext(bool val) async {
    _autoPlayNext = val;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyAutoPlayNext, val);
  }

  Future<void> setSeekStep(int seconds) async {
    _seekStepSeconds = seconds;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keySeekStep, seconds);
  }

  Future<void> clearAllData() async {
    _watchlist.clear();
    _continueWatching.clear();
    _collections.clear();
    _searchHistory.clear();
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }
}
