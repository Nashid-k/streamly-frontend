import 'package:flutter/material.dart';
import '../api/movie_service.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_nav_spacer.dart';
import '../widgets/hero_carousel.dart';
import '../widgets/movie_rail.dart';
import 'see_all_page.dart';

class MoviesScreen extends StatefulWidget {
  final bool active;

  const MoviesScreen({super.key, this.active = true});

  @override
  State<MoviesScreen> createState() => _MoviesScreenState();
}

class _MoviesScreenState extends State<MoviesScreen> {
  bool _isLoading = true;
  bool _loadQueued = false;
  List<Movie> _nowPlaying = [];
  List<Movie> _popular = [];
  List<Movie> _topRated = [];
  List<Movie> _upcoming = [];
  List<Movie> _action = [];
  List<Movie> _scifi = [];
  List<Movie> _comedy = [];

  @override
  void initState() {
    super.initState();
    if (widget.active) _loadMovies();
  }

  @override
  void didUpdateWidget(covariant MoviesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The tab starts inactive with _isLoading=true and never loads in
    // initState — so becoming active with empty lists must trigger a load
    // regardless of the stale _isLoading flag (which previously deadlocked
    // the tab on an eternal spinner).
    if (widget.active &&
        !oldWidget.active &&
        _popular.isEmpty &&
        _nowPlaying.isEmpty) {
      _loadMovies();
    }
  }

  Future<void> _loadMovies() async {
    if (_loadQueued) return;
    _loadQueued = true;
    setState(() => _isLoading = true);
    try {
      final res = await Future.wait([
        MovieService.getNowPlayingMovies(),
        MovieService.getPopularMovies(),
        MovieService.getTopRatedMovies(),
        MovieService.getUpcomingMovies(),
        MovieService.getDiscoverByGenre(28), // Action
        MovieService.getDiscoverByGenre(878), // Sci-Fi
        MovieService.getDiscoverByGenre(35), // Comedy
      ]);

      if (mounted) {
        setState(() {
          _nowPlaying = res[0];
          _popular = res[1];
          _topRated = res[2];
          _upcoming = res[3];
          _action = res[4];
          _scifi = res[5];
          _comedy = res[6];
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
        onRefresh: _loadMovies,
        color: AppTheme.accentLime,
        backgroundColor: AppTheme.surface,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_nowPlaying.isNotEmpty)
                HeroCarousel(movies: _nowPlaying.take(5).toList(), active: widget.active),

              const SizedBox(height: 8),

              if (_popular.isNotEmpty)
                MovieRail(
                  title: 'Popular Movies',
                  movies: _popular,
                  onSeeAll: _openMovies('Popular Movies', MovieService.getPopularMovies),
                ),

              if (_nowPlaying.isNotEmpty)
                MovieRail(
                  title: 'Now Playing in Theatres',
                  movies: _nowPlaying,
                  onSeeAll: _openMovies('Now Playing in Theatres', MovieService.getNowPlayingMovies),
                ),

              if (_topRated.isNotEmpty)
                MovieRail(
                  title: 'Top Rated Movies',
                  movies: _topRated,
                  onSeeAll: _openMovies('Top Rated Movies', MovieService.getTopRatedMovies),
                ),

              if (_action.isNotEmpty)
                MovieRail(
                  title: 'Action Blockbusters',
                  movies: _action,
                  onSeeAll: _openMovies('Action Blockbusters', () => MovieService.getDiscoverByGenre(28)),
                ),

              if (_scifi.isNotEmpty)
                MovieRail(
                  title: 'Sci-Fi & Cyberpunk',
                  movies: _scifi,
                  onSeeAll: _openMovies('Sci-Fi & Cyberpunk', () => MovieService.getDiscoverByGenre(878)),
                ),

              if (_comedy.isNotEmpty)
                MovieRail(
                  title: 'Comedy & Laughs',
                  movies: _comedy,
                  onSeeAll: _openMovies('Comedy & Laughs', () => MovieService.getDiscoverByGenre(35)),
                ),

              if (_upcoming.isNotEmpty)
                MovieRail(
                  title: 'Coming Soon',
                  movies: _upcoming,
                  onSeeAll: _openMovies('Coming Soon', MovieService.getUpcomingMovies),
                ),

              const BottomNavSpacer(),
            ],
          ),
        ),
      ),
    );
  }

  VoidCallback _openMovies(String title, Future<List<Movie>> Function() loader) {
    return () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => SeeAllPage(title: title, loader: loader),
          ),
        );
  }
}
