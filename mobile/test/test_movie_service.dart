import 'package:flutter_test/flutter_test.dart';
import 'package:streamly_mobile/api/movie_service.dart';

void main() {
  test('MovieService loads featured and trending movies', () async {
    print('Testing getFeaturedMovies()...');
    final featured = await MovieService.getFeaturedMovies();
    print('Featured count: ${featured.length}');
    expect(featured.isNotEmpty, true);
    print('First featured: ${featured[0].title}');

    print('Testing getTop10()...');
    final top10 = await MovieService.getTop10();
    print('Top 10 count: ${top10.length}');
    expect(top10.isNotEmpty, true);

    print('Testing searchMulti("Spider")...');
    final search = await MovieService.searchMulti('Spider');
    print('Search count: ${search.length}');
    expect(search.isNotEmpty, true);
    print('First search title: ${search[0].title}');
  });
}
