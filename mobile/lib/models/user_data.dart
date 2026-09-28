class WatchlistItem {
  final int tmdbId;
  final bool isSeries;
  final String title;
  final String? posterPath;
  final double rating;
  final String? releaseYear;
  final int addedAt;

  WatchlistItem({
    required this.tmdbId,
    required this.isSeries,
    required this.title,
    this.posterPath,
    this.rating = 0.0,
    this.releaseYear,
    required this.addedAt,
  });

  String get posterUrl => posterPath != null && posterPath!.isNotEmpty
      ? (posterPath!.startsWith('http')
          ? posterPath!
          : 'https://image.tmdb.org/t/p/w500$posterPath')
      : '';

  Map<String, dynamic> toJson() => {
        'tmdbId': tmdbId,
        'isSeries': isSeries,
        'title': title,
        'posterPath': posterPath,
        'rating': rating,
        'releaseYear': releaseYear,
        'addedAt': addedAt,
      };

  factory WatchlistItem.fromJson(Map<String, dynamic> json) => WatchlistItem(
        tmdbId: json['tmdbId'] as int,
        isSeries: json['isSeries'] as bool? ?? false,
        title: json['title'] as String? ?? '',
        posterPath: json['posterPath'] as String?,
        rating: ((json['rating'] as num?)?.toDouble() ?? 0.0),
        releaseYear: json['releaseYear'] as String?,
        addedAt: json['addedAt'] as int? ?? 0,
      );
}

class ContinueWatchingItem {
  final int tmdbId;
  final bool isSeries;
  final String title;
  final int season;
  final int episode;
  final String? episodeTitle;
  final double positionSeconds;
  final double durationSeconds;
  final String? posterPath;
  final String? backdropPath;
  final int updatedAt;

  ContinueWatchingItem({
    required this.tmdbId,
    required this.isSeries,
    required this.title,
    this.season = 1,
    this.episode = 1,
    this.episodeTitle,
    this.positionSeconds = 0.0,
    this.durationSeconds = 0.0,
    this.posterPath,
    this.backdropPath,
    required this.updatedAt,
  });

  double get progress {
    if (durationSeconds <= 0) return 0.0;
    return (positionSeconds / durationSeconds).clamp(0.0, 1.0);
  }

  String get posterUrl => posterPath != null && posterPath!.isNotEmpty
      ? (posterPath!.startsWith('http')
          ? posterPath!
          : 'https://image.tmdb.org/t/p/w500$posterPath')
      : '';

  String get backdropUrl => backdropPath != null && backdropPath!.isNotEmpty
      ? (backdropPath!.startsWith('http')
          ? backdropPath!
          : 'https://image.tmdb.org/t/p/w780$backdropPath')
      : '';

  Map<String, dynamic> toJson() => {
        'tmdbId': tmdbId,
        'isSeries': isSeries,
        'title': title,
        'season': season,
        'episode': episode,
        'episodeTitle': episodeTitle,
        'positionSeconds': positionSeconds,
        'durationSeconds': durationSeconds,
        'posterPath': posterPath,
        'backdropPath': backdropPath,
        'updatedAt': updatedAt,
      };

  factory ContinueWatchingItem.fromJson(Map<String, dynamic> json) =>
      ContinueWatchingItem(
        tmdbId: json['tmdbId'] as int,
        isSeries: json['isSeries'] as bool? ?? false,
        title: json['title'] as String? ?? '',
        season: json['season'] as int? ?? 1,
        episode: json['episode'] as int? ?? 1,
        episodeTitle: json['episodeTitle'] as String?,
        positionSeconds: ((json['positionSeconds'] as num?)?.toDouble() ?? 0.0),
        durationSeconds: ((json['durationSeconds'] as num?)?.toDouble() ?? 0.0),
        posterPath: json['posterPath'] as String?,
        backdropPath: json['backdropPath'] as String?,
        updatedAt: json['updatedAt'] as int? ?? 0,
      );
}

class CustomCollection {
  final String id;
  final String name;
  final int createdAt;
  final List<int> itemIds;

  CustomCollection({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.itemIds,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'createdAt': createdAt,
        'itemIds': itemIds,
      };

  factory CustomCollection.fromJson(Map<String, dynamic> json) =>
      CustomCollection(
        id: json['id'] as String,
        name: json['name'] as String,
        createdAt: json['createdAt'] as int? ?? 0,
        itemIds: (json['itemIds'] as List? ?? [])
            .map((e) => (e as num).toInt())
            .toList(),
      );
}
