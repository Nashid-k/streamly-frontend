class Movie {
  final int id;
  final String title;
  final String? originalTitle;
  final String? overview;
  final String? posterPath;
  final String? backdropPath;
  final String? logoPath;
  final double rating;
  final int voteCount;
  final String? releaseDate;
  final bool isSeries;
  final List<int> genreIds;
  final List<String> genres;
  final String? certification;
  final int? runtime;
  final String? status;
  final String? tagline;
  final int? numberOfSeasons;
  final int? numberOfEpisodes;
  final String? imdbId;

  Movie({
    required this.id,
    required this.title,
    this.originalTitle,
    this.overview,
    this.posterPath,
    this.backdropPath,
    this.logoPath,
    this.rating = 0.0,
    this.voteCount = 0,
    this.releaseDate,
    this.isSeries = false,
    this.genreIds = const [],
    this.genres = const [],
    this.certification,
    this.runtime,
    this.status,
    this.tagline,
    this.numberOfSeasons,
    this.numberOfEpisodes,
    this.imdbId,
  });

  String get posterUrl => posterPath != null && posterPath!.isNotEmpty
      ? 'https://image.tmdb.org/t/p/w500$posterPath'
      : '';

  String get backdropUrl => backdropPath != null && backdropPath!.isNotEmpty
      ? 'https://image.tmdb.org/t/p/w1280$backdropPath'
      : '';

  String get logoUrl => logoPath != null && logoPath!.isNotEmpty
      ? 'https://image.tmdb.org/t/p/w500$logoPath'
      : '';

  String get releaseYear {
    if (releaseDate == null || releaseDate!.length < 4) return '';
    return releaseDate!.substring(0, 4);
  }

  String get formattedRuntime {
    if (runtime == null || runtime! <= 0) return '';
    final hours = runtime! ~/ 60;
    final mins = runtime! % 60;
    if (hours > 0 && mins > 0) return '${hours}h ${mins}m';
    if (hours > 0) return '${hours}h';
    return '${mins}m';
  }

  factory Movie.fromJson(Map<String, dynamic> json, {bool isTvExplicit = false}) {
    final bool isTv = isTvExplicit ||
        json['media_type'] == 'tv' ||
        json.containsKey('name') ||
        json.containsKey('first_air_date');

    final title = json['title'] as String? ??
        json['name'] as String? ??
        json['original_title'] as String? ??
        json['original_name'] as String? ??
        'Unknown Title';

    final releaseDate = json['release_date'] as String? ??
        json['first_air_date'] as String? ??
        '';

    List<int> gIds = [];
    if (json['genre_ids'] != null && json['genre_ids'] is List) {
      gIds = (json['genre_ids'] as List)
          .map((e) => (e as num).toInt())
          .toList();
    }

    List<String> genreNames = [];
    if (json['genres'] != null && json['genres'] is List) {
      genreNames = (json['genres'] as List)
          .map((e) => e['name'] as String? ?? '')
          .where((name) => name.isNotEmpty)
          .toList();
    }

    // Logo extraction if images appended
    String? logo;
    if (json['images'] != null && json['images']['logos'] is List) {
      final logos = json['images']['logos'] as List;
      if (logos.isNotEmpty) {
        // prefer en logo
        final enLogo = logos.firstWhere(
          (l) => l['iso_639_1'] == 'en',
          orElse: () => logos.first,
        );
        logo = enLogo['file_path'] as String?;
      }
    }

    // IMDB ID from external_ids or direct
    String? imdb;
    if (json['external_ids'] != null && json['external_ids']['imdb_id'] != null) {
      imdb = json['external_ids']['imdb_id'] as String?;
    } else if (json['imdb_id'] != null) {
      imdb = json['imdb_id'] as String?;
    }

    // Certification lookup
    String? cert;
    if (json['release_dates'] != null && json['release_dates']['results'] is List) {
      final results = json['release_dates']['results'] as List;
      final us = results.firstWhere(
        (r) => r['iso_3166_1'] == 'US',
        orElse: () => results.isNotEmpty ? results.first : null,
      );
      if (us != null && us['release_dates'] is List && us['release_dates'].isNotEmpty) {
        for (final rd in us['release_dates']) {
          final c = rd['certification'] as String?;
          if (c != null && c.isNotEmpty) {
            cert = c;
            break;
          }
        }
      }
    } else if (json['content_ratings'] != null && json['content_ratings']['results'] is List) {
      final results = json['content_ratings']['results'] as List;
      final us = results.firstWhere(
        (r) => r['iso_3166_1'] == 'US',
        orElse: () => results.isNotEmpty ? results.first : null,
      );
      if (us != null && us['rating'] != null) {
        cert = us['rating'] as String?;
      }
    }

    return Movie(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: title,
      originalTitle: json['original_title'] as String? ?? json['original_name'] as String?,
      overview: json['overview'] as String?,
      posterPath: json['poster_path'] as String?,
      backdropPath: json['backdrop_path'] as String?,
      logoPath: logo,
      rating: ((json['vote_average'] as num?)?.toDouble() ?? 0.0),
      voteCount: (json['vote_count'] as num?)?.toInt() ?? 0,
      releaseDate: releaseDate,
      isSeries: isTv,
      genreIds: gIds,
      genres: genreNames,
      certification: cert,
      runtime: (json['runtime'] as num?)?.toInt(),
      status: json['status'] as String?,
      tagline: json['tagline'] as String?,
      numberOfSeasons: (json['number_of_seasons'] as num?)?.toInt(),
      numberOfEpisodes: (json['number_of_episodes'] as num?)?.toInt(),
      imdbId: imdb,
    );
  }

  Movie copyWith({
    String? logoPath,
    String? certification,
    List<String>? genres,
    int? runtime,
    String? imdbId,
  }) {
    return Movie(
      id: id,
      title: title,
      originalTitle: originalTitle,
      overview: overview,
      posterPath: posterPath,
      backdropPath: backdropPath,
      logoPath: logoPath ?? this.logoPath,
      rating: rating,
      voteCount: voteCount,
      releaseDate: releaseDate,
      isSeries: isSeries,
      genreIds: genreIds,
      genres: genres ?? this.genres,
      certification: certification ?? this.certification,
      runtime: runtime ?? this.runtime,
      status: status,
      tagline: tagline,
      numberOfSeasons: numberOfSeasons,
      numberOfEpisodes: numberOfEpisodes,
      imdbId: imdbId ?? this.imdbId,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'original_title': originalTitle,
        'overview': overview,
        'poster_path': posterPath,
        'backdrop_path': backdropPath,
        'logo_path': logoPath,
        'vote_average': rating,
        'vote_count': voteCount,
        'release_date': releaseDate,
        'is_series': isSeries,
        'genres': genres,
        'certification': certification,
        'runtime': runtime,
        'imdb_id': imdbId,
      };
}

class Episode {
  final int id;
  final String name;
  final String? overview;
  final int episodeNumber;
  final int seasonNumber;
  final String? stillPath;
  final String? airDate;
  final double voteAverage;
  final int? runtime;

  Episode({
    required this.id,
    required this.name,
    this.overview,
    required this.episodeNumber,
    required this.seasonNumber,
    this.stillPath,
    this.airDate,
    this.voteAverage = 0.0,
    this.runtime,
  });

  String get stillUrl => stillPath != null && stillPath!.isNotEmpty
      ? 'https://image.tmdb.org/t/p/w500$stillPath'
      : '';

  String get formattedDuration {
    if (runtime == null || runtime! <= 0) return '';
    return '${runtime}m';
  }

  factory Episode.fromJson(Map<String, dynamic> json) {
    return Episode(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? 'Episode',
      overview: json['overview'] as String?,
      episodeNumber: (json['episode_number'] as num?)?.toInt() ?? 1,
      seasonNumber: (json['season_number'] as num?)?.toInt() ?? 1,
      stillPath: json['still_path'] as String?,
      airDate: json['air_date'] as String?,
      voteAverage: ((json['vote_average'] as num?)?.toDouble() ?? 0.0),
      runtime: (json['runtime'] as num?)?.toInt(),
    );
  }
}

class Season {
  final int id;
  final String name;
  final int seasonNumber;
  final int episodeCount;
  final String? posterPath;
  final String? airDate;

  Season({
    required this.id,
    required this.name,
    required this.seasonNumber,
    required this.episodeCount,
    this.posterPath,
    this.airDate,
  });

  factory Season.fromJson(Map<String, dynamic> json) {
    return Season(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? 'Season',
      seasonNumber: (json['season_number'] as num?)?.toInt() ?? 1,
      episodeCount: (json['episode_count'] as num?)?.toInt() ?? 0,
      posterPath: json['poster_path'] as String?,
      airDate: json['air_date'] as String?,
    );
  }
}

class CastMember {
  final int id;
  final String name;
  final String? character;
  final String? profilePath;

  CastMember({
    required this.id,
    required this.name,
    this.character,
    this.profilePath,
  });

  String get avatarUrl => profilePath != null && profilePath!.isNotEmpty
      ? 'https://image.tmdb.org/t/p/w185$profilePath'
      : '';

  factory CastMember.fromJson(Map<String, dynamic> json) {
    return CastMember(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? '',
      character: json['character'] as String?,
      profilePath: json['profile_path'] as String?,
    );
  }
}

class PersonDetails {
  final int id;
  final String name;
  final String? biography;
  final String? birthday;
  final String? placeOfBirth;
  final String? profilePath;
  final List<Movie> credits;

  PersonDetails({
    required this.id,
    required this.name,
    this.biography,
    this.birthday,
    this.placeOfBirth,
    this.profilePath,
    this.credits = const [],
  });

  String get avatarUrl => profilePath != null && profilePath!.isNotEmpty
      ? 'https://image.tmdb.org/t/p/w500$profilePath'
      : '';
}
