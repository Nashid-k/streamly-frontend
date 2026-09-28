import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shimmer/shimmer.dart';
import '../models/movie.dart';
import '../providers/user_data_provider.dart';
import '../screens/detail_screen.dart';
import '../screens/player_screen.dart';
import '../theme/app_theme.dart';

class HeroCarousel extends StatefulWidget {
  final List<Movie> movies;
  final bool active;

  const HeroCarousel({super.key, required this.movies, this.active = true});

  @override
  State<HeroCarousel> createState() => _HeroCarouselState();
}

class _HeroCarouselState extends State<HeroCarousel> {
  late final PageController _pageController =
      PageController(viewportFraction: 1.0);
  int _currentIndex = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.active) _startTimer();
  }

  @override
  void didUpdateWidget(HeroCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      _startTimer();
    } else if (!widget.active) {
      _timer?.cancel();
    }
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 7), (_) {
      if (!mounted || !widget.active || widget.movies.isEmpty) return;
      final next = (_currentIndex + 1) % widget.movies.length;
      _pageController.animateToPage(
        next,
        duration: const Duration(milliseconds: 700),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.movies.isEmpty) return const SizedBox.shrink();

    final screenH = MediaQuery.of(context).size.height;
    final heroH = (screenH * 0.60).clamp(380.0, 540.0);

    return SizedBox(
      height: heroH,
      child: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.movies.length,
            onPageChanged: (i) {
              setState(() => _currentIndex = i);
              _startTimer();
            },
            itemBuilder: (_, index) => _HeroSlide(
              movie: widget.movies[index],
              height: heroH,
            ),
          ),

          // Progress indicator dots
          Positioned(
            bottom: 14,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(widget.movies.length, (i) {
                final isActive = i == _currentIndex;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOutCubic,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  height: 3.5,
                  width: isActive ? 24 : 6,
                  decoration: BoxDecoration(
                    color: isActive
                        ? Theme.of(context).colorScheme.primary
                        : Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                    boxShadow: isActive
                        ? [
                            BoxShadow(
                              color: Theme.of(context)
                                  .colorScheme
                                  .primary
                                  .withValues(alpha: 0.5),
                              blurRadius: 6,
                            ),
                          ]
                        : [],
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroSlide extends StatelessWidget {
  final Movie movie;
  final double height;
  const _HeroSlide({required this.movie, required this.height});

  @override
  Widget build(BuildContext context) {
    final userData = Provider.of<UserDataProvider>(context);
    final inList  = userData.isInWatchlist(movie.id);
    final accent  = Theme.of(context).colorScheme.primary;

    return Stack(
      fit: StackFit.expand,
      children: [
        // ── Backdrop ──
        if (movie.backdropUrl.isNotEmpty)
          CachedNetworkImage(
            imageUrl: movie.backdropUrl,
            fit: BoxFit.cover,
            placeholder: (_, _) => Shimmer.fromColors(
              baseColor: AppTheme.card,
              highlightColor: AppTheme.cardElevated,
              child: const ColoredBox(color: AppTheme.card),
            ),
            errorWidget: (_, _, _) => const ColoredBox(color: AppTheme.card),
          ),

        // ── Gradient — top→ bottom dark vignette ──
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.28),
                Colors.transparent,
                AppTheme.background.withValues(alpha: 0.7),
                AppTheme.background.withValues(alpha: 0.97),
                AppTheme.background,
              ],
              stops: const [0.0, 0.22, 0.58, 0.88, 1.0],
            ),
          ),
        ),

        // ── Left side vignette ──
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [
                Colors.black.withValues(alpha: 0.25),
                Colors.transparent,
              ],
            ),
          ),
        ),

        // ── Content ──
        Positioned(
          bottom: 32,
          left: 18,
          right: 18,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Logo or title
              if (movie.logoUrl.isNotEmpty)
                CachedNetworkImage(
                  imageUrl: movie.logoUrl,
                  height: 58,
                  fit: BoxFit.contain,
                  placeholder: (_, _) => _TitleText(movie.title),
                  errorWidget: (_, _, _) => _TitleText(movie.title),
                )
              else
                _TitleText(movie.title),

              const SizedBox(height: 10),

              // Metadata row
              _MetaRow(movie: movie, accent: accent),

              const SizedBox(height: 18),

              // Action buttons
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Play
                  Expanded(
                    child: _HeroButton(
                      onTap: () {
                        final resume = userData.progressFor(movie.id);
                        Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => PlayerScreen(
                            movie: movie,
                            initialServerIndex: userData.defaultServerIndex,
                            startAtSeconds: resume?.positionSeconds ?? 0,
                          ),
                        ));
                      },
                      backgroundColor: accent,
                      icon: Icons.play_arrow_rounded,
                      label: 'Play',
                      foregroundColor: Colors.black,
                    ),
                  ),
                  const SizedBox(width: 10),

                  // My List
                  _HeroIconBtn(
                    onTap: () => userData.toggleWatchlist(movie),
                    icon: inList ? Icons.bookmark_added_rounded : Icons.bookmark_add_outlined,
                    active: inList,
                    accent: accent,
                    tooltip: inList ? 'Remove from list' : 'Add to list',
                  ),
                  const SizedBox(width: 8),

                  // Info
                  _HeroIconBtn(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => DetailScreen(movie: movie),
                    )),
                    icon: Icons.info_outline_rounded,
                    active: false,
                    accent: accent,
                    tooltip: 'More info',
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TitleText extends StatelessWidget {
  final String title;
  const _TitleText(this.title);
  @override
  Widget build(BuildContext context) => Text(
    title,
    textAlign: TextAlign.center,
    maxLines: 2,
    overflow: TextOverflow.ellipsis,
    style: const TextStyle(
      color: Colors.white,
      fontSize: 28,
      fontWeight: FontWeight.w900,
      letterSpacing: -0.6,
      height: 1.1,
    ),
  );
}

class _MetaRow extends StatelessWidget {
  final Movie movie;
  final Color accent;
  const _MetaRow({required this.movie, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 6,
      children: [
        if (movie.rating > 0) ...[
          const Icon(Icons.star_rounded, color: AppTheme.accentAmber, size: 14),
          Text(
            movie.rating.toStringAsFixed(1),
            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const _Dot(),
        ],
        if (movie.releaseYear.isNotEmpty)
          Text(movie.releaseYear,
              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
        if (movie.certification != null) ...[
          const _Dot(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white30),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              movie.certification!,
              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
        ],
        const _Dot(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(AppTheme.radiusFull),
          ),
          child: Text(
            movie.isSeries ? 'Series' : 'Movie',
            style: TextStyle(color: accent, fontSize: 11, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot();
  @override
  Widget build(BuildContext context) =>
      const Text('·', style: TextStyle(color: AppTheme.textFaint, fontSize: 14));
}

class _HeroButton extends StatelessWidget {
  final VoidCallback onTap;
  final Color backgroundColor;
  final Color foregroundColor;
  final IconData icon;
  final String label;
  const _HeroButton({
    required this.onTap,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 13),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: foregroundColor, size: 22),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: foregroundColor,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroIconBtn extends StatelessWidget {
  final VoidCallback onTap;
  final IconData icon;
  final bool active;
  final Color accent;
  final String tooltip;
  const _HeroIconBtn({
    required this.onTap,
    required this.icon,
    required this.active,
    required this.accent,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          child: Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              border: Border.all(
                color: active ? accent.withValues(alpha: 0.5) : Colors.white24,
              ),
            ),
            child: Icon(icon, color: active ? accent : Colors.white, size: 22),
          ),
        ),
      ),
    );
  }
}
