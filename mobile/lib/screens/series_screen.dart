import 'package:flutter/material.dart';
import '../api/movie_service.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_nav_spacer.dart';
import '../widgets/hero_carousel.dart';
import '../widgets/movie_rail.dart';
import 'see_all_page.dart';

class SeriesScreen extends StatefulWidget {
  final bool active;

  const SeriesScreen({super.key, this.active = true});

  @override
  State<SeriesScreen> createState() => _SeriesScreenState();
}

class _SeriesScreenState extends State<SeriesScreen> {
  bool _isLoading = true;
  bool _loadQueued = false;
  List<Movie> _airing = [];
  List<Movie> _popular = [];
  List<Movie> _topRated = [];
  List<Movie> _regionalAiring = [];
  List<Movie> _animation = [];
  List<Movie> _drama = [];

  @override
  void initState() {
    super.initState();
    if (widget.active) _loadSeries();
  }

  @override
  void didUpdateWidget(covariant SeriesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Same deadlock as MoviesScreen had: the tab starts inactive with
    // _isLoading=true, so the stale flag must not gate the first load.
    if (widget.active &&
        !oldWidget.active &&
        _popular.isEmpty &&
        _airing.isEmpty) {
      _loadSeries();
    }
  }

  Future<void> _loadSeries() async {
    if (_loadQueued) return;
    _loadQueued = true;
    setState(() => _isLoading = true);
    try {
      final res = await Future.wait([
        MovieService.getAiringThisWeek(),
        MovieService.getPopularTv(),
        MovieService.getTopRatedTv(),
        MovieService.getRegionalAiring(),
        MovieService.getDiscoverByGenre(16, isTv: true), // Animation / Anime
        MovieService.getDiscoverByGenre(18, isTv: true), // Drama
      ]);

      if (mounted) {
        setState(() {
          _airing = res[0];
          _popular = res[1];
          _topRated = res[2];
          _regionalAiring = res[3];
          _animation = res[4];
          _drama = res[5];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    } finally {
      _loadQueued = false;
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
        onRefresh: _loadSeries,
        color: AppTheme.accentLime,
        backgroundColor: AppTheme.surface,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_popular.isNotEmpty)
                HeroCarousel(movies: _popular.take(5).toList(), active: widget.active),

              const SizedBox(height: 8),

              if (_airing.isNotEmpty)
                MovieRail(
                  title: 'Airing This Week',
                  movies: _airing,
                  onSeeAll: _openSeries('Airing This Week', MovieService.getAiringThisWeek),
                ),

              if (_popular.isNotEmpty)
                MovieRail(
                  title: 'Trending Series',
                  movies: _popular,
                  onSeeAll: _openSeries('Trending Series', MovieService.getPopularTv),
                ),

              if (_regionalAiring.isNotEmpty)
                MovieRail(
                  title: 'Regional Indian Shows',
                  subtitle: 'Tamil, Telugu, Hindi, Malayalam',
                  movies: _regionalAiring,
                  onSeeAll: _openSeries('Regional Indian Shows', MovieService.getRegionalAiring),
                ),

              if (_topRated.isNotEmpty)
                MovieRail(
                  title: 'All-Time Top Rated Series',
                  movies: _topRated,
                  onSeeAll: _openSeries('All-Time Top Rated Series', MovieService.getTopRatedTv),
                ),

              if (_animation.isNotEmpty)
                MovieRail(
                  title: 'Anime & Animated Series',
                  movies: _animation,
                  onSeeAll: _openSeries('Anime & Animated Series', () => MovieService.getDiscoverByGenre(16, isTv: true)),
                ),

              if (_drama.isNotEmpty)
                MovieRail(
                  title: 'Acclaimed Drama',
                  movies: _drama,
                  onSeeAll: _openSeries('Acclaimed Drama', () => MovieService.getDiscoverByGenre(18, isTv: true)),
                ),

              const BottomNavSpacer(),
            ],
          ),
        ),
      ),
    );
  }

  VoidCallback _openSeries(String title, Future<List<Movie>> Function() loader) {
    return () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => SeeAllPage(title: title, loader: loader),
          ),
        );
  }
}
