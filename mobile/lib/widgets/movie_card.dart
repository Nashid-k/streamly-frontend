import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../models/movie.dart';
import '../screens/detail_screen.dart';
import '../theme/app_theme.dart';

class MovieCard extends StatelessWidget {
  final Movie movie;
  final double? width;
  final double? height;
  final EdgeInsetsGeometry? margin;

  const MovieCard({
    super.key,
    required this.movie,
    this.width = 128,
    this.height = 190,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    final poster = movie.posterUrl;

    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        PageRouteBuilder(
          pageBuilder: (_, animation, _) => DetailScreen(movie: movie),
          transitionsBuilder: (_, animation, _, child) => FadeTransition(
            opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
            child: child,
          ),
          transitionDuration: const Duration(milliseconds: 280),
        ),
      ),
      // Grid cells (search, see-all, library, credits) construct the card
      // with null width/height. A null-height poster around an expanding
      // Stack under unbounded Column constraints lays out to infinity and
      // blanks the whole cell while the tight tile keeps hit-testing — the
      // "empty but tappable" grid. Derive a 2:3 poster from the cell width.
      child: LayoutBuilder(
        builder: (_, constraints) {
          final maxW = constraints.maxWidth;
          final w = width ?? (maxW.isFinite ? maxW : 128.0);
          final h = height ?? w * 1.5;
          return Container(
        width: width,
        margin: margin ?? const EdgeInsets.symmetric(horizontal: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Poster ──
            Hero(
              tag: 'poster_${movie.id}',
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                child: Container(
                  height: h,
                  width: w,
                  color: AppTheme.card,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (poster.isNotEmpty)
                        CachedNetworkImage(
                          imageUrl: poster,
                          fit: BoxFit.cover,
                          placeholder: (_, _) => Shimmer.fromColors(
                            baseColor: AppTheme.card,
                            highlightColor: AppTheme.cardElevated,
                            child: const ColoredBox(color: AppTheme.card),
                          ),
                          errorWidget: (_, _, _) => const _PosterPlaceholder(),
                        )
                      else
                        const _PosterPlaceholder(),

                      // Subtle bottom vignette so text below is readable
                      Positioned(
                        bottom: 0, left: 0, right: 0,
                        child: Container(
                          height: 48,
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.bottomCenter,
                              end: Alignment.topCenter,
                              colors: [Colors.black54, Colors.transparent],
                            ),
                          ),
                        ),
                      ),

                      // ── Rating pill ──
                      if (movie.rating > 0)
                        Positioned(
                          top: 7, right: 7,
                          child: _Pill(
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.star_rounded, color: AppTheme.accentAmber, size: 11),
                                const SizedBox(width: 3),
                                Text(
                                  movie.rating.toStringAsFixed(1),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),

                      // ── Type badge ──
                      if (movie.isSeries)
                        Positioned(
                          top: 7, left: 7,
                          child: _Pill(
                            child: const Text(
                              'TV',
                              style: TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(height: 7),

            // ── Title ──
            Text(
              movie.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),

            // ── Year · cert ──
            if (movie.releaseYear.isNotEmpty || movie.certification != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  children: [
                    if (movie.releaseYear.isNotEmpty)
                      Text(
                        movie.releaseYear,
                        style: const TextStyle(color: AppTheme.textFaint, fontSize: 11),
                      ),
                    if (movie.releaseYear.isNotEmpty && movie.certification != null)
                      const Text(' · ', style: TextStyle(color: AppTheme.textFaint, fontSize: 10)),
                    if (movie.certification != null)
                      Text(
                        movie.certification!,
                        style: const TextStyle(color: AppTheme.textFaint, fontSize: 11),
                      ),
                  ],
                ),
              ),
          ],
        ),
        );
        },
      ),
    );
  }
}

class _PosterPlaceholder extends StatelessWidget {
  const _PosterPlaceholder();
  @override
  Widget build(BuildContext context) => const Center(
    child: Icon(Icons.movie_outlined, color: AppTheme.textFaint, size: 36),
  );
}

class _Pill extends StatelessWidget {
  final Widget child;
  const _Pill({required this.child});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.72),
      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
    ),
    child: child,
  );
}
