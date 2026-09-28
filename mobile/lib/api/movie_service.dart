import '../models/movie.dart';
import 'tmdb_client.dart';

class MovieService {
  static Future<List<Movie>> getFeaturedMovies() async {
    try {
      final res = await TmdbClient.get('/trending/all/week');
      final list = (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item))
          .where((m) => m.backdropPath != null && m.backdropPath!.isNotEmpty)
          .take(6)
          .toList();

      // Enrich top featured titles with high-res logos
      final enriched = await Future.wait(list.map((m) async {
        try {
          final detail = await TmdbClient.get(
            m.isSeries ? '/tv/${m.id}' : '/movie/${m.id}',
            params: {'append_to_response': 'images'},
          );
          final updated = Movie.fromJson(detail, isTvExplicit: m.isSeries);
          return updated.logoPath != null ? updated : m;
        } catch (_) {
          return m;
        }
      }));

      return enriched;
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getTop10() async {
    try {
      final res = await TmdbClient.get('/trending/all/day');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item))
          .take(10)
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getTrendingThisWeek() async {
    try {
      final res = await TmdbClient.get('/trending/all/week');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getAiringThisWeek() async {
    try {
      final res = await TmdbClient.get('/tv/on_the_air');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: true))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getPopularMovies() async {
    try {
      final res = await TmdbClient.get('/movie/popular');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: false))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getPopularTv() async {
    try {
      final res = await TmdbClient.get('/tv/popular');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: true))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getTopRatedMovies() async {
    try {
      final res = await TmdbClient.get('/movie/top_rated');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: false))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getTopRatedTv() async {
    try {
      final res = await TmdbClient.get('/tv/top_rated');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: true))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getNowPlayingMovies() async {
    try {
      final res = await TmdbClient.get('/movie/now_playing');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: false))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getUpcomingMovies() async {
    try {
      final res = await TmdbClient.get('/movie/upcoming');
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: false))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getRegionalUpcoming() async {
    try {
      final res = await TmdbClient.get('/discover/movie', params: {
        'with_original_language': 'hi|ta|te|ml',
        'sort_by': 'popularity.desc',
      });
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: false))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getRegionalAiring() async {
    try {
      final res = await TmdbClient.get('/discover/tv', params: {
        'with_original_language': 'hi|ta|te|ml',
        'sort_by': 'popularity.desc',
      });
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: true))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Movie> getMovieDetails(int id, bool isTv) async {
    final path = isTv ? '/tv/$id' : '/movie/$id';
    final params = {
      'append_to_response':
          'credits,videos,images,recommendations,similar,external_ids,release_dates,content_ratings',
    };
    final json = await TmdbClient.get(path, params: params);
    return Movie.fromJson(json, isTvExplicit: isTv);
  }

  static Future<List<CastMember>> getCredits(int id, bool isTv) async {
    try {
      final path = isTv ? '/tv/$id/credits' : '/movie/$id/credits';
      final res = await TmdbClient.get(path);
      return (res['cast'] as List? ?? [])
          .map((c) => CastMember.fromJson(c))
          .where((c) => c.avatarUrl.isNotEmpty)
          .take(20)
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> getSimilar(int id, bool isTv) async {
    try {
      final path = isTv ? '/tv/$id/similar' : '/movie/$id/similar';
      final res = await TmdbClient.get(path);
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: isTv))
          .where((m) => m.posterPath != null)
          .take(15)
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Episode>> getSeasonEpisodes(int tvId, int seasonNumber) async {
    try {
      final res = await TmdbClient.get('/tv/$tvId/season/$seasonNumber');
      return (res['episodes'] as List? ?? [])
          .map((ep) => Episode.fromJson(ep))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Movie>> searchMulti(String query) async {
    if (query.trim().isEmpty) return [];
    final res = await TmdbClient.get('/search/multi', params: {'query': query.trim()});
    return (res['results'] as List? ?? [])
        .where((item) => item['media_type'] == 'movie' || item['media_type'] == 'tv')
        .map((item) => Movie.fromJson(item))
        .toList();
  }

  static Future<List<Movie>> getDiscoverByGenre(int genreId, {bool isTv = false}) async {
    try {
      final path = isTv ? '/discover/tv' : '/discover/movie';
      final res = await TmdbClient.get(path, params: {
        'with_genres': genreId,
        'sort_by': 'popularity.desc',
      });
      return (res['results'] as List? ?? [])
          .map((item) => Movie.fromJson(item, isTvExplicit: isTv))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<PersonDetails> getPersonDetails(int personId) async {
    final res = await TmdbClient.get('/person/$personId', params: {
      'append_to_response': 'combined_credits',
    });

    List<Movie> credits = [];
    if (res['combined_credits'] != null && res['combined_credits']['cast'] is List) {
      credits = (res['combined_credits']['cast'] as List)
          .map((item) => Movie.fromJson(item))
          .where((m) => m.posterPath != null && m.posterPath!.isNotEmpty)
          .take(30)
          .toList();
    }

    return PersonDetails(
      id: personId,
      name: res['name'] as String? ?? 'Actor',
      biography: res['biography'] as String?,
      birthday: res['birthday'] as String?,
      placeOfBirth: res['place_of_birth'] as String?,
      profilePath: res['profile_path'] as String?,
      credits: credits,
    );
  }
}
