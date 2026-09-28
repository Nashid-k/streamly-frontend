import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/movie_service.dart';
import '../models/movie.dart';
import '../providers/user_data_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_rail.dart';
import 'person_screen.dart';
import 'player_screen.dart';
import 'see_all_page.dart';

class DetailScreen extends StatefulWidget {
  final Movie movie;
  const DetailScreen({super.key, required this.movie});

  @override
  State<DetailScreen> createState() => _DetailScreenState();
}

class _DetailScreenState extends State<DetailScreen> {
  late Movie _movie;
  bool _isLoading = true;
  bool _overviewExpanded = false;
  List<CastMember> _cast = [];
  List<Movie> _similar = [];
  int _selectedSeason = 1;
  List<Episode> _episodes = [];
  bool _isLoadingEpisodes = false;

  @override
  void initState() {
    super.initState();
    _movie = widget.movie;
    _loadFullDetails();
  }

  Future<void> _loadFullDetails() async {
    try {
      final results = await Future.wait([
        MovieService.getMovieDetails(_movie.id, _movie.isSeries),
        MovieService.getCredits(_movie.id, _movie.isSeries),
        MovieService.getSimilar(_movie.id, _movie.isSeries),
      ]);
      if (mounted) {
        setState(() {
          _movie   = results[0] as Movie;
          _cast    = (results[1] as List).cast<CastMember>();
          _similar = (results[2] as List).cast<Movie>();
          _isLoading = false;
        });
        if (_movie.isSeries) _loadEpisodes(_selectedSeason);
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _loadEpisodes(int season) async {
    setState(() => _isLoadingEpisodes = true);
    try {
      final eps = await MovieService.getSeasonEpisodes(_movie.id, season);
      if (mounted) setState(() { _episodes = eps; _isLoadingEpisodes = false; });
    } catch (_) {
      if (mounted) setState(() => _isLoadingEpisodes = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final userData    = Provider.of<UserDataProvider>(context);
    final inWatchlist = userData.isInWatchlist(_movie.id);
    final inCollection = userData.collections.any((c) => c.itemIds.contains(_movie.id));
    final accent      = Theme.of(context).colorScheme.primary;

    if (_isLoading && _movie.title.isEmpty) {
      return const Scaffold(
        backgroundColor: AppTheme.background,
        body: Center(child: CircularProgressIndicator(color: AppTheme.accentLime, strokeWidth: 2.5)),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // ── Collapsing backdrop header ──
          SliverAppBar(
            expandedHeight: 320,
            pinned: true,
            backgroundColor: AppTheme.background,
            elevation: 0,
            leading: Padding(
              padding: const EdgeInsets.all(8),
              child: Material(
                color: Colors.black.withValues(alpha: 0.5),
                shape: const CircleBorder(),
                child: InkWell(
                  onTap: () => Navigator.pop(context),
                  customBorder: const CircleBorder(),
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(Icons.arrow_back_rounded, color: Colors.white, size: 20),
                  ),
                ),
              ),
            ),
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  if (_movie.backdropUrl.isNotEmpty)
                    Hero(
                      tag: 'backdrop_${_movie.id}',
                      child: CachedNetworkImage(
                        imageUrl: _movie.backdropUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, _) =>
                            const ColoredBox(color: AppTheme.card),
                        errorWidget: (_, _, _) =>
                            const ColoredBox(color: AppTheme.card),
                      ),
                    ),
                  Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.35),
                          Colors.transparent,
                          AppTheme.background.withValues(alpha: 0.82),
                          AppTheme.background,
                        ],
                        stops: const [0.0, 0.35, 0.8, 1.0],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Body ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title / Logo
                  if (_movie.logoUrl.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: _movie.logoUrl,
                      height: 52,
                      alignment: Alignment.centerLeft,
                      fit: BoxFit.contain,
                      errorWidget: (_, _, _) => _TitleText(_movie.title),
                    )
                  else
                    _TitleText(_movie.title),

                  const SizedBox(height: 10),

                  // ── Metadata chips row ──
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      if (_movie.releaseYear.isNotEmpty)
                        _MetaChip(label: _movie.releaseYear),
                      if (_movie.certification != null)
                        _MetaChip(
                          label: _movie.certification!,
                          border: true,
                        ),
                      if (_movie.formattedRuntime.isNotEmpty)
                        _MetaChip(label: _movie.formattedRuntime),
                      if (_movie.isSeries && _movie.numberOfSeasons != null)
                        _MetaChip(
                          label: '${_movie.numberOfSeasons} Season${_movie.numberOfSeasons! > 1 ? "s" : ""}',
                        ),
                      if (_movie.rating > 0)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star_rounded, color: AppTheme.accentAmber, size: 15),
                            const SizedBox(width: 4),
                            Text(
                              _movie.rating.toStringAsFixed(1),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),

                  const SizedBox(height: 18),

                  // ── Action buttons ──
                  Row(
                    children: [
                      Expanded(
                        child: _WatchButton(
                          accent: accent,
                          onTap: () {
                            final season = _movie.isSeries ? _selectedSeason : null;
                            final resume = userData.progressFor(
                              _movie.id,
                              season: season,
                              episode: _movie.isSeries ? 1 : null,
                            );
                            Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) => PlayerScreen(
                                movie: _movie,
                                season: season,
                                episode: _movie.isSeries ? 1 : null,
                                initialServerIndex: userData.defaultServerIndex,
                                startAtSeconds: resume?.positionSeconds ?? 0,
                              ),
                            ));
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      _ActionBtn(
                        icon: inWatchlist
                            ? Icons.bookmark_added_rounded
                            : Icons.bookmark_add_outlined,
                        active: inWatchlist,
                        accent: accent,
                        onTap: () => userData.toggleWatchlist(_movie),
                      ),
                      const SizedBox(width: 8),
                      _ActionBtn(
                        icon: inCollection
                            ? Icons.playlist_add_check_rounded
                            : Icons.playlist_add_rounded,
                        active: inCollection,
                        accent: accent,
                        onTap: () => _showCollectionPicker(context, userData),
                      ),
                    ],
                  ),

                  const SizedBox(height: 22),

                  // ── Genres ──
                  if (_movie.genres.isNotEmpty) ...[
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _movie.genres.map((g) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.card,
                          borderRadius: BorderRadius.circular(AppTheme.radiusFull),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                        ),
                        child: Text(g,
                            style: const TextStyle(
                                color: AppTheme.textSecondary, fontSize: 12)),
                      )).toList(),
                    ),
                    const SizedBox(height: 20),
                  ],

                  // ── Overview ──
                  if (_movie.overview != null && _movie.overview!.isNotEmpty) ...[
                    const Text('Overview',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: () => setState(() => _overviewExpanded = !_overviewExpanded),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AnimatedCrossFade(
                            crossFadeState: _overviewExpanded
                                ? CrossFadeState.showSecond
                                : CrossFadeState.showFirst,
                            duration: const Duration(milliseconds: 250),
                            firstChild: Text(
                              _movie.overview!,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 14,
                                height: 1.6,
                              ),
                            ),
                            secondChild: Text(
                              _movie.overview!,
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 14,
                                height: 1.6,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _overviewExpanded ? 'Show less' : 'Read more',
                            style: TextStyle(
                                color: accent,
                                fontSize: 13,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),
                  ],

                  // ── Episodes (series) ──
                  if (_movie.isSeries) ...[
                    _EpisodesSection(
                      movie: _movie,
                      selectedSeason: _selectedSeason,
                      episodes: _episodes,
                      isLoading: _isLoadingEpisodes,
                      accent: accent,
                      onSeasonChanged: (s) {
                        setState(() { _selectedSeason = s; _episodes = []; });
                        _loadEpisodes(s);
                      },
                    ),
                    const SizedBox(height: 22),
                  ],

                  // ── Cast ──
                  if (_cast.isNotEmpty) ...[
                    const Text('Cast & Crew',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 116,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: _cast.length,
                        physics: const BouncingScrollPhysics(),
                        itemBuilder: (_, i) {
                          final m = _cast[i];
                          return GestureDetector(
                            onTap: () => Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) =>
                                  PersonScreen(personId: m.id, name: m.name),
                            )),
                            child: Container(
                              width: 76,
                              margin: const EdgeInsets.only(right: 12),
                              child: Column(
                                children: [
                                  CircleAvatar(
                                    radius: 32,
                                    backgroundColor: AppTheme.card,
                                    backgroundImage: m.avatarUrl.isNotEmpty
                                        ? CachedNetworkImageProvider(m.avatarUrl)
                                        : null,
                                    child: m.avatarUrl.isEmpty
                                        ? const Icon(Icons.person_rounded,
                                            color: AppTheme.textFaint)
                                        : null,
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    m.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600),
                                  ),
                                  if (m.character != null)
                                    Text(
                                      m.character!,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                          color: AppTheme.textFaint, fontSize: 10),
                                    ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 22),
                  ],
                ],
              ),
            ),
          ),

          // ── More Like This ──
          if (_similar.isNotEmpty)
            SliverToBoxAdapter(
              child: Column(
                children: [
                  MovieRail(
                    title: 'More Like This',
                    movies: _similar,
                    onSeeAll: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => SeeAllPage(
                        title: 'More Like This',
                        loader: () => MovieService.getSimilar(_movie.id, _movie.isSeries),
                      ),
                    )),
                  ),
                  const SizedBox(height: 96),
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _showCollectionPicker(BuildContext context, UserDataProvider userData) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: StatefulBuilder(
          builder: (_, setModal) => Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Add to Collection',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold)),
                    TextButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        _showCreateCollection(context, userData);
                      },
                      child: const Text('+ New',
                          style: TextStyle(color: AppTheme.accentLime)),
                    ),
                  ],
                ),
                const Divider(),
                if (userData.collections.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Center(
                      child: Text('No collections yet.',
                          style: TextStyle(color: AppTheme.textFaint)),
                    ),
                  )
                else
                  ListView.builder(
                    shrinkWrap: true,
                    itemCount: userData.collections.length,
                    itemBuilder: (_, i) {
                      final col      = userData.collections[i];
                      final contains = col.itemIds.contains(_movie.id);
                      return ListTile(
                        leading: Icon(
                          contains ? Icons.folder_rounded : Icons.folder_outlined,
                          color: contains
                              ? Theme.of(context).colorScheme.primary
                              : AppTheme.textFaint,
                        ),
                        title: Text(col.name,
                            style: const TextStyle(color: Colors.white)),
                        subtitle: Text('${col.itemIds.length} titles',
                            style: const TextStyle(
                                color: AppTheme.textFaint, fontSize: 12)),
                        trailing: Icon(
                          contains
                              ? Icons.check_box_rounded
                              : Icons.check_box_outline_blank_rounded,
                          color: contains
                              ? Theme.of(context).colorScheme.primary
                              : Colors.white30,
                        ),
                        onTap: () async {
                          await userData.toggleItemInCollection(
                              col.id, _movie.id);
                          setModal(() {});
                        },
                      );
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showCreateCollection(BuildContext context, UserDataProvider userData) {
    final ctl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create Collection'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'e.g. Marvel, Favorites, Anime',
            hintStyle: TextStyle(color: AppTheme.textFaint),
            enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white24)),
            focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: AppTheme.accentLime)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
          ),
          FilledButton(
            onPressed: () {
              if (ctl.text.trim().isNotEmpty) {
                userData.createCollection(ctl.text.trim(), [_movie.id]);
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Added to "${ctl.text.trim()}"')),
                );
              }
            },
            style: FilledButton.styleFrom(
                backgroundColor: AppTheme.accentLime, foregroundColor: Colors.black),
            child: const Text('Create & Add'),
          ),
        ],
      ),
    );
  }
}

// ── Episodes section widget ──
class _EpisodesSection extends StatelessWidget {
  final Movie movie;
  final int selectedSeason;
  final List<Episode> episodes;
  final bool isLoading;
  final Color accent;
  final ValueChanged<int> onSeasonChanged;

  const _EpisodesSection({
    required this.movie,
    required this.selectedSeason,
    required this.episodes,
    required this.isLoading,
    required this.accent,
    required this.onSeasonChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Episodes',
                style: TextStyle(
                    color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: DropdownButton<int>(
                value: selectedSeason,
                underline: const SizedBox.shrink(),
                dropdownColor: AppTheme.surface,
                icon: const Icon(Icons.arrow_drop_down_rounded, color: Colors.white),
                style: const TextStyle(color: Colors.white, fontSize: 13),
                items: List.generate(
                  movie.numberOfSeasons ?? 1,
                  (i) => DropdownMenuItem(
                    value: i + 1,
                    child: Text('Season ${i + 1}'),
                  ),
                ),
                onChanged: (v) { if (v != null) onSeasonChanged(v); },
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (isLoading)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator(color: AppTheme.accentLime, strokeWidth: 2.5)),
          )
        else if (episodes.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('No episode info available',
                style: TextStyle(color: AppTheme.textFaint)),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: episodes.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final ep = episodes[i];
              return GestureDetector(
                onTap: () {
                  final userData = Provider.of<UserDataProvider>(context, listen: false);
                  final resume = userData.progressFor(
                    movie.id,
                    season: selectedSeason,
                    episode: ep.episodeNumber,
                  );
                  Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => PlayerScreen(
                      movie: movie,
                      season: selectedSeason,
                      episode: ep.episodeNumber,
                      initialServerIndex: userData.defaultServerIndex,
                      startAtSeconds: resume?.positionSeconds ?? 0,
                    ),
                  ));
                },
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.card,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: Row(
                    children: [
                      // Thumbnail
                      ClipRRect(
                        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                        child: SizedBox(
                          width: 106,
                          height: 64,
                          child: ep.stillUrl.isNotEmpty
                              ? CachedNetworkImage(
                                  imageUrl: ep.stillUrl,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) => const _EpThumbPlaceholder(),
                                )
                              : const _EpThumbPlaceholder(),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${ep.episodeNumber}. ${ep.name}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                              ),
                            ),
                            if (ep.overview != null && ep.overview!.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                ep.overview!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: AppTheme.textSecondary, fontSize: 12, height: 1.4),
                              ),
                            ],
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Icon(Icons.play_circle_outline_rounded, color: accent, size: 26),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

class _EpThumbPlaceholder extends StatelessWidget {
  const _EpThumbPlaceholder();
  @override
  Widget build(BuildContext context) => const ColoredBox(
    color: AppTheme.card,
    child: Center(child: Icon(Icons.movie_outlined, color: AppTheme.textFaint)),
  );
}

class _TitleText extends StatelessWidget {
  final String title;
  const _TitleText(this.title);
  @override
  Widget build(BuildContext context) => Text(
    title,
    style: const TextStyle(
      color: Colors.white,
      fontSize: 26,
      fontWeight: FontWeight.w900,
      letterSpacing: -0.5,
      height: 1.1,
    ),
  );
}

class _MetaChip extends StatelessWidget {
  final String label;
  final bool border;
  const _MetaChip({required this.label, this.border = false});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: border ? Colors.transparent : AppTheme.card,
      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      border: Border.all(
          color: border ? Colors.white38 : Colors.white.withValues(alpha: 0.06)),
    ),
    child: Text(label,
        style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
  );
}

class _WatchButton extends StatelessWidget {
  final Color accent;
  final VoidCallback onTap;
  const _WatchButton({required this.accent, required this.onTap});
  @override
  Widget build(BuildContext context) => Material(
    color: accent,
    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.play_arrow_rounded, color: Colors.black, size: 24),
            const SizedBox(width: 6),
            const Text('Watch Now',
                style: TextStyle(
                    color: Colors.black, fontSize: 15, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    ),
  );
}

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final bool active;
  final Color accent;
  final VoidCallback onTap;
  const _ActionBtn({required this.icon, required this.active, required this.accent, required this.onTap});
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white.withValues(alpha: 0.07),
    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          border: Border.all(
            color: active ? accent.withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.1),
          ),
        ),
        child: Icon(icon, color: active ? accent : Colors.white, size: 22),
      ),
    ),
  );
}
