import 'package:flutter/material.dart';
import '../api/movie_service.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_nav_spacer.dart';
import '../widgets/continue_watching_rail.dart';
import '../widgets/hero_carousel.dart';
import '../widgets/movie_rail.dart';
import '../widgets/top10_rail.dart';
import 'see_all_page.dart';

class HomeScreen extends StatefulWidget {
  final bool active;

  const HomeScreen({super.key, this.active = true});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _isLoading = true;

  List<Movie> _featured = [];
  List<Movie> _top10 = [];
  List<Movie> _trending = [];
  List<Movie> _airing = [];
  List<Movie> _popularMovies = [];
  List<Movie> _popularTv = [];
  List<Movie> _regionalUpcoming = [];
  List<Movie> _upcoming = [];

  @override
  void initState() {
    super.initState();
    _loadAllData();
  }

  Future<void> _loadAllData() async {
    setState(() => _isLoading = true);

    try {
      final results = await Future.wait([
        MovieService.getFeaturedMovies(),
        MovieService.getTop10(),
        MovieService.getTrendingThisWeek(),
        MovieService.getAiringThisWeek(),
        MovieService.getPopularMovies(),
        MovieService.getPopularTv(),
        MovieService.getRegionalUpcoming(),
        MovieService.getUpcomingMovies(),
      ]);

      if (mounted) {
        setState(() {
          _featured = results[0];
          _top10 = results[1];
          _trending = results[2];
          _airing = results[3];
          _popularMovies = results[4];
          _popularTv = results[5];
          _regionalUpcoming = results[6];
          _upcoming = results[7];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppTheme.background,
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(AppTheme.accentLime),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: RefreshIndicator(
        onRefresh: _loadAllData,
        color: AppTheme.accentLime,
        backgroundColor: AppTheme.surface,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [

              // Featured Hero Carousel
              if (_featured.isNotEmpty)
                HeroCarousel(movies: _featured, active: widget.active),

              const SizedBox(height: 8),

              // Continue Watching Rail
              const ContinueWatchingRail(),

              // Top 10 Rail
              if (_top10.isNotEmpty)
                Top10Rail(movies: _top10),

              // Trending This Week
              if (_trending.isNotEmpty)
                MovieRail(
                  title: 'Trending This Week',
                  movies: _trending,
                  onSeeAll: () => _openSeeAll(
                    'Trending This Week',
                    MovieService.getTrendingThisWeek,
                  ),
                ),

              // Airing This Week (TV)
              if (_airing.isNotEmpty)
                MovieRail(
                  title: 'Airing This Week',
                  movies: _airing,
                  onSeeAll: () => _openSeeAll(
                    'Airing This Week',
                    MovieService.getAiringThisWeek,
                  ),
                ),

              // Regional Spotlight (Indian Releases)
              if (_regionalUpcoming.isNotEmpty)
                MovieRail(
                  title: 'Regional Spotlight',
                  subtitle: 'Tamil, Telugu, Hindi, Malayalam',
                  movies: _regionalUpcoming,
                  onSeeAll: () => _openSeeAll(
                    'Regional Spotlight',
                    MovieService.getRegionalUpcoming,
                  ),
                ),

              // Popular Movies
              if (_popularMovies.isNotEmpty)
                MovieRail(
                  title: 'Popular Movies',
                  movies: _popularMovies,
                  onSeeAll: () => _openSeeAll(
                    'Popular Movies',
                    MovieService.getPopularMovies,
                  ),
                ),

              // Popular TV Shows
              if (_popularTv.isNotEmpty)
                MovieRail(
                  title: 'Popular TV Shows',
                  movies: _popularTv,
                  onSeeAll: () => _openSeeAll(
                    'Popular TV Shows',
                    MovieService.getPopularTv,
                  ),
                ),

              // Upcoming Releases
              if (_upcoming.isNotEmpty)
                MovieRail(
                  title: 'Upcoming Releases',
                  movies: _upcoming,
                  onSeeAll: () => _openSeeAll(
                    'Upcoming Releases',
                    MovieService.getUpcomingMovies,
                  ),
                ),

              const BottomNavSpacer(),
            ],
          ),
        ),
      ),
    );
  }

  void _openSeeAll(String title, Future<List<Movie>> Function() loader) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SeeAllPage(title: title, loader: loader),
      ),
    );
  }
}

