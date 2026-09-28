import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/movie.dart';
import '../models/user_data.dart';
import '../providers/user_data_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_card.dart';
import '../widgets/page_header.dart';

class WatchlistScreen extends StatefulWidget {
  const WatchlistScreen({super.key});

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController =
      TabController(length: 2, vsync: this);
  String _filterType = 'All';

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final userData = Provider.of<UserDataProvider>(context);
    final accent   = Theme.of(context).colorScheme.primary;

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Column(
        children: [
          PageHeader(title: 'My Library'),

          // ── Tab bar ──
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            ),
            child: TabBar(
              controller: _tabController,
              indicator: BoxDecoration(
                color: accent,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              indicatorSize: TabBarIndicatorSize.tab,
              dividerHeight: 0,
              labelColor: Colors.black,
              unselectedLabelColor: AppTheme.textSecondary,
              labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.normal, fontSize: 13),
              tabs: [
                Tab(text: 'Watchlist (${userData.watchlist.length})'),
                Tab(text: 'Collections (${userData.collections.length})'),
              ],
            ),
          ),

          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildWatchlistTab(userData, accent),
                _buildCollectionsTab(userData, accent),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWatchlistTab(UserDataProvider userData, Color accent) {
    var items = userData.watchlist;
    if (_filterType == 'Movies')   items = items.where((i) => !i.isSeries).toList();
    if (_filterType == 'TV Shows') items = items.where((i) =>  i.isSeries).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: ['All', 'Movies', 'TV Shows'].map((f) {
              final sel = _filterType == f;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(f),
                  selected: sel,
                  onSelected: (v) { if (v) setState(() => _filterType = f); },
                ),
              );
            }).toList(),
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? _EmptyState(
                  icon: Icons.bookmark_border_rounded,
                  title: 'Watchlist is empty',
                  subtitle: 'Tap the bookmark icon on any title',
                )
              : GridView.builder(
                  padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.paddingOf(context).bottom + 96),
                  itemCount: items.length,
                  physics: const BouncingScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 0.50,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 14,
                  ),
                  itemBuilder: (_, i) {
                    final item = items[i];
                    return MovieCard(
                      movie: Movie(
                        id: item.tmdbId,
                        title: item.title,
                        isSeries: item.isSeries,
                        posterPath: item.posterPath,
                        rating: item.rating,
                        releaseDate: item.releaseYear,
                      ),
                      width: null,
                      height: null,
                      margin: EdgeInsets.zero,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildCollectionsTab(UserDataProvider userData, Color accent) {
    return Column(
      children: [
        // Create button row
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${userData.collections.length} folder${userData.collections.length == 1 ? "" : "s"}',
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
              FilledButton.icon(
                onPressed: () => _showCreateDialog(userData),
                icon: const Icon(Icons.add_rounded, size: 17, color: Colors.black),
                label: const Text('New Folder',
                    style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 13)),
                style: FilledButton.styleFrom(
                  backgroundColor: accent,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
                ),
              ),
            ],
          ),
        ),

        Expanded(
          child: userData.collections.isEmpty
              ? _EmptyState(
                  icon: Icons.folder_open_rounded,
                  title: 'No collections yet',
                  subtitle: 'Organize your favorites into folders',
                )
              : ListView.separated(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, MediaQuery.paddingOf(context).bottom + 96),
                  itemCount: userData.collections.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final col = userData.collections[i];
                    return _CollectionTile(
                      collection: col,
                      accent: accent,
                      onRename: () => _showRenameDialog(userData, col),
                      onDelete: () => _confirmDelete(userData, col),
                    );
                  },
                ),
        ),
      ],
    );
  }

  // ── Dialogs ──

  void _confirmDelete(UserDataProvider userData, CustomCollection col) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete collection?'),
        content: Text('"${col.name}" (${col.itemIds.length} titles) will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
          ),
          FilledButton(
            onPressed: () { userData.deleteCollection(col.id); Navigator.pop(ctx); },
            style: FilledButton.styleFrom(backgroundColor: AppTheme.accentCrimson),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _showCreateDialog(UserDataProvider userData) {
    final ctl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New Collection'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'e.g. Marvel, Anime',
            hintStyle: TextStyle(color: AppTheme.textFaint),
            enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white24)),
            focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: AppTheme.accentLime)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (ctl.text.trim().isNotEmpty) {
                userData.createCollection(ctl.text.trim());
                Navigator.pop(ctx);
              }
            },
            style: FilledButton.styleFrom(backgroundColor: AppTheme.accentLime, foregroundColor: Colors.black),
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _showRenameDialog(UserDataProvider userData, CustomCollection col) {
    final ctl = TextEditingController(text: col.name);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white24)),
            focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: AppTheme.accentLime)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (ctl.text.trim().isNotEmpty) {
                userData.renameCollection(col.id, ctl.text.trim());
                Navigator.pop(ctx);
              }
            },
            style: FilledButton.styleFrom(backgroundColor: AppTheme.accentLime, foregroundColor: Colors.black),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

// ── Shared empty-state widget ──
class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _EmptyState({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: const Color(0xFF252530), size: 72),
        const SizedBox(height: 16),
        Text(title, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Text(subtitle, style: const TextStyle(color: AppTheme.textFaint, fontSize: 13)),
      ],
    ),
  );
}

// ── Collection list tile ──
class _CollectionTile extends StatelessWidget {
  final CustomCollection collection;
  final Color accent;
  final VoidCallback onRename;
  final VoidCallback onDelete;
  const _CollectionTile({
    required this.collection,
    required this.accent,
    required this.onRename,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          ),
          child: Icon(Icons.folder_rounded, color: accent, size: 22),
        ),
        title: Text(collection.name,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        subtitle: Text(
          '${collection.itemIds.length} title${collection.itemIds.length == 1 ? "" : "s"}',
          style: const TextStyle(color: AppTheme.textFaint, fontSize: 12),
        ),
        trailing: PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert_rounded, color: Colors.white54),
          color: AppTheme.cardElevated,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
          onSelected: (v) => v == 'rename' ? onRename() : onDelete(),
          itemBuilder: (_) => [
            const PopupMenuItem(
              value: 'rename',
              child: Row(children: [
                Icon(Icons.drive_file_rename_outline_rounded, color: Colors.white70, size: 18),
                SizedBox(width: 10),
                Text('Rename', style: TextStyle(color: Colors.white)),
              ]),
            ),
            const PopupMenuItem(
              value: 'delete',
              child: Row(children: [
                Icon(Icons.delete_outline_rounded, color: AppTheme.accentCrimson, size: 18),
                SizedBox(width: 10),
                Text('Delete', style: TextStyle(color: AppTheme.accentCrimson)),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}
