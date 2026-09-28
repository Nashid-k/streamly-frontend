import 'package:flutter_test/flutter_test.dart';
import 'package:streamly_mobile/models/movie.dart';
import 'package:streamly_mobile/api/video_source_adapter.dart';

void main() {
  test('Movie.fromJson creates movie object correctly', () {
    final json = {
      'id': 12345,
      'title': 'Streamly Movie',
      'vote_average': 8.5,
      'poster_path': '/path.jpg',
      'backdrop_path': '/backdrop.jpg',
      'release_date': '2026-05-10',
    };

    final movie = Movie.fromJson(json);
    expect(movie.id, 12345);
    expect(movie.title, 'Streamly Movie');
    expect(movie.rating, 8.5);
    expect(movie.releaseYear, '2026');
    expect(movie.isSeries, false);
  });

  test('VideoSourceAdapter builds streaming URLs correctly', () {
    final movieUrl = VideoSourceAdapter.buildStreamUrl(
      serverIndex: 0,
      tmdbId: 100,
    );
    expect(movieUrl.contains('cinesrc.st'), true);
    expect(movieUrl.contains('movie/100'), true);

    final tvUrl = VideoSourceAdapter.buildStreamUrl(
      serverIndex: 0,
      tmdbId: 200,
      season: 2,
      episode: 5,
    );
    expect(tvUrl.contains('cinesrc.st'), true);
    expect(tvUrl.contains('tv/200'), true);
    expect(tvUrl.contains('s=2'), true);
    expect(tvUrl.contains('e=5'), true);
  });
}
