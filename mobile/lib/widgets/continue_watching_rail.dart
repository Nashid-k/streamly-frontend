import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/movie.dart';
import '../models/user_data.dart';
import '../providers/user_data_provider.dart';
import '../screens/player_screen.dart';
import '../theme/app_theme.dart';

class ContinueWatchingRail extends StatelessWidget {
  const ContinueWatchingRail({super.key});

  @override
  Widget build(BuildContext context) {
    final items = Provider.of<UserDataProvider>(context).continueWatching;
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 10),
          child: Row(
            children: [
              Icon(Icons.play_circle_fill_rounded, color: AppTheme.accentLime, size: 20),
              SizedBox(width: 8),
              Text(
                'Continue Watching',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 192,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: items.length,
            physics: const BouncingScrollPhysics(),
            itemBuilder: (_, i) => _ContinueCard(item: items[i]),
          ),
        ),
        const SizedBox(height: 4),
      ],
    );
  }
}

class _ContinueCard extends StatelessWidget {
  final ContinueWatchingItem item;
  const _ContinueCard({required this.item});

  void _remove(BuildContext context) {
    final userData = Provider.of<UserDataProvider>(context, listen: false);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Removed "${item.title}"'),
          duration: const Duration(seconds: 4),
          action: SnackBarAction(
            label: 'Undo',
            textColor: AppTheme.accentLime,
            onPressed: () => userData.recordProgress(
              tmdbId: item.tmdbId,
              isSeries: item.isSeries,
              title: item.title,
              season: item.season,
              episode: item.episode,
              episodeTitle: item.episodeTitle,
              positionSeconds: item.positionSeconds,
              durationSeconds: item.durationSeconds,
              posterPath: item.posterPath,
              backdropPath: item.backdropPath,
            ),
          ),
        ),
      );
    userData.removeContinueWatching(item.tmdbId);
  }

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;

    return GestureDetector(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PlayerScreen(
          movie: Movie(
            id: item.tmdbId,
            title: item.title,
            isSeries: item.isSeries,
            posterPath: item.posterPath,
            backdropPath: item.backdropPath,
          ),
          season: item.season,
          episode: item.episode,
          startAtSeconds: item.positionSeconds,
        ),
      )),
      child: Container(
        width: 220,
        margin: const EdgeInsets.symmetric(horizontal: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Thumbnail ──
            ClipRRect(
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              child: Container(
                height: 126,
                color: AppTheme.card,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Image
                    _buildImage(),

                    // Dark vignette
                    Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, Colors.black54],
                          stops: [0.5, 1.0],
                        ),
                      ),
                    ),

                    // Center play icon
                    Center(
                      child: Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.55),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
                        ),
                        child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 26),
                      ),
                    ),

                    // Remove button top-right
                    Positioned(
                      top: 6, right: 6,
                      child: GestureDetector(
                        onTap: () => _remove(context),
                        child: Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.68),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white12),
                          ),
                          child: const Icon(Icons.close_rounded, color: Colors.white, size: 15),
                        ),
                      ),
                    ),

                    // Progress bar bottom
                    Positioned(
                      bottom: 0, left: 0, right: 0,
                      child: ClipRRect(
                        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(AppTheme.radiusMd)),
                        child: LinearProgressIndicator(
                          value: item.progress.clamp(0.0, 1.0),
                          minHeight: 4,
                          backgroundColor: Colors.white12,
                          valueColor: AlwaysStoppedAnimation<Color>(accent),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 7),

            Text(
              item.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),

            const SizedBox(height: 2),

            Text(
              item.isSeries
                  ? 'S${item.season} · E${item.episode}${item.episodeTitle != null ? "  ${item.episodeTitle}" : ""}'
                  : _percentLeft(item.progress),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppTheme.textFaint, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildImage() {
    final url = item.backdropUrl.isNotEmpty ? item.backdropUrl : item.posterUrl;
    if (url.isEmpty) {
      return const Center(child: Icon(Icons.movie_outlined, color: AppTheme.textFaint));
    }
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      errorWidget: (_, _, _) =>
          const Center(child: Icon(Icons.movie_outlined, color: AppTheme.textFaint)),
    );
  }

  String _percentLeft(double progress) {
    final pct = ((1 - progress.clamp(0.0, 1.0)) * 100).round();
    return '$pct% remaining';
  }
}
