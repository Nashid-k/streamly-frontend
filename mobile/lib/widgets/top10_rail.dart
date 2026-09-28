import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../models/movie.dart';
import '../screens/detail_screen.dart';
import '../theme/app_theme.dart';

class Top10Rail extends StatelessWidget {
  final List<Movie> movies;
  const Top10Rail({super.key, required this.movies});

  @override
  Widget build(BuildContext context) {
    if (movies.isEmpty) return const SizedBox.shrink();
    final capped = movies.take(10).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 10),
          child: Row(
            children: [
              Text(
                'Top 10 Today',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
              SizedBox(width: 8),
              Icon(Icons.local_fire_department_rounded,
                  color: AppTheme.accentCrimson, size: 20),
            ],
          ),
        ),
        SizedBox(
          height: 226,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: capped.length,
            physics: const BouncingScrollPhysics(),
            itemBuilder: (context, index) {
              final movie = capped[index];
              final rank  = index + 1;

              return GestureDetector(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => DetailScreen(movie: movie)),
                ),
                child: SizedBox(
                  width: 180,
                  child: Stack(
                    alignment: Alignment.centerLeft,
                    children: [
                      // ── Big outline rank number ──
                      Positioned(
                        left: 0,
                        bottom: 6,
                        child: Stack(
                          children: [
                            Text(
                              '$rank',
                              style: TextStyle(
                                fontSize: 110,
                                fontWeight: FontWeight.w900,
                                height: 0.85,
                                foreground: Paint()
                                  ..style = PaintingStyle.stroke
                                  ..strokeWidth = 3.5
                                  ..color = const Color(0xFF2A2A36),
                              ),
                            ),
                            Text(
                              '$rank',
                              style: const TextStyle(
                                fontSize: 110,
                                fontWeight: FontWeight.w900,
                                height: 0.85,
                                color: Color(0xFF0D0D12),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // ── Poster card ──
                      Positioned(
                        left: rank >= 10 ? 68 : 52,
                        top: 12,
                        bottom: 12,
                        right: 4,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                          child: Container(
                            color: AppTheme.card,
                            child: movie.posterUrl.isNotEmpty
                                ? CachedNetworkImage(
                                    imageUrl: movie.posterUrl,
                                    fit: BoxFit.cover,
                                    placeholder: (_, _) => Shimmer.fromColors(
                                      baseColor: AppTheme.card,
                                      highlightColor: AppTheme.cardElevated,
                                      child: const ColoredBox(color: AppTheme.card),
                                    ),
                                    errorWidget: (_, _, _) => const Center(
                                      child: Icon(Icons.movie_outlined,
                                          color: AppTheme.textFaint),
                                    ),
                                  )
                                : const Center(
                                    child: Icon(Icons.movie_outlined,
                                        color: AppTheme.textFaint),
                                  ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
