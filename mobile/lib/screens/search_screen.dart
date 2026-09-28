import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/movie_service.dart';
import '../models/movie.dart';
import '../providers/user_data_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_card.dart';
import '../widgets/page_header.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  Timer? _debounceTimer;
  List<Movie> _results = [];
  bool _isSearching = false;
  bool _searchFailed = false;
  int _querySeq = 0;
  String _selectedFilter = 'All';

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onQueryChanged(String query) {
    _debounceTimer?.cancel();
    if (query.trim().isEmpty) {
      _querySeq++;
      setState(() { _results = []; _isSearching = false; _searchFailed = false; });
      return;
    }

    _debounceTimer = Timer(const Duration(milliseconds: 350), () async {
      final seq = ++_querySeq;
      setState(() => _isSearching = true);
      try {
        final results = await MovieService.searchMulti(query);
        if (!mounted || seq != _querySeq) return;
        setState(() { _results = results; _isSearching = false; _searchFailed = false; });
        if (results.isNotEmpty) {
          Provider.of<UserDataProvider>(context, listen: false).addSearchQuery(query);
        }
      } catch (_) {
        if (!mounted || seq != _querySeq) return;
        setState(() { _results = []; _isSearching = false; _searchFailed = true; });
      }
    });
  }

  List<Movie> get _filteredResults {
    if (_selectedFilter == 'Movies') return _results.where((m) => !m.isSeries).toList();
    if (_selectedFilter == 'TV Shows') return _results.where((m) => m.isSeries).toList();
    return _results;
  }

  @override
  Widget build(BuildContext context) {
    final userData = Provider.of<UserDataProvider>(context);
    final accent   = Theme.of(context).colorScheme.primary;
    final hasQuery = _controller.text.isNotEmpty;

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(title: 'Search'),

          // ── Search field ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Container(
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                border: Border.all(
                  color: _focusNode.hasFocus
                      ? accent.withValues(alpha: 0.5)
                      : Colors.white.withValues(alpha: 0.08),
                ),
              ),
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                onChanged: _onQueryChanged,
                onTap: () => setState(() {}), // rebuild to show border
                style: const TextStyle(color: Colors.white, fontSize: 15),
                decoration: InputDecoration(
                  hintText: 'Movies, shows, actors…',
                  hintStyle: const TextStyle(color: AppTheme.textFaint),
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(left: 14, right: 10),
                    child: Icon(Icons.search_rounded, color: AppTheme.textSecondary, size: 22),
                  ),
                  prefixIconConstraints: const BoxConstraints(minWidth: 0),
                  suffixIcon: hasQuery
                      ? IconButton(
                          icon: const Icon(Icons.cancel_rounded, color: AppTheme.textFaint, size: 20),
                          onPressed: () {
                            _controller.clear();
                            _onQueryChanged('');
                            _focusNode.unfocus();
                          },
                        )
                      : null,
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
              ),
            ),
          ),

          // ── Filter chips ──
          if (hasQuery && _results.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: ['All', 'Movies', 'TV Shows'].map((f) {
                  final sel = _selectedFilter == f;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(f),
                      selected: sel,
                      onSelected: (v) { if (v) setState(() => _selectedFilter = f); },
                    ),
                  );
                }).toList(),
              ),
            ),

          // ── Body ──
          Expanded(
            child: _isSearching
                ? const Center(child: CircularProgressIndicator(color: AppTheme.accentLime, strokeWidth: 2.5))
                : !hasQuery
                    ? _buildHistory(userData)
                    : _searchFailed
                        ? _buildError()
                        : _filteredResults.isEmpty
                            ? _buildEmpty()
                            : _buildGrid(_filteredResults),
          ),
        ],
      ),
    );
  }

  Widget _buildHistory(UserDataProvider userData) {
    if (userData.searchHistory.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.movie_filter_rounded, color: Color(0xFF2A2A35), size: 72),
            SizedBox(height: 16),
            Text('Search movies & series', style: TextStyle(color: AppTheme.textFaint, fontSize: 15)),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Recent',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            TextButton(
              onPressed: userData.clearSearchHistory,
              child: const Text('Clear', style: TextStyle(color: AppTheme.accentCrimson, fontSize: 13)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: userData.searchHistory.map((q) => InputChip(
            label: Text(q),
            onPressed: () {
              _controller.text = q;
              _onQueryChanged(q);
            },
            onDeleted: () => userData.removeSearchQuery(q),
            deleteIconColor: AppTheme.textFaint,
          )).toList(),
        ),
      ],
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, color: AppTheme.textFaint, size: 52),
          const SizedBox(height: 14),
          const Text(
            'Search unavailable\nCheck your connection',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 14, height: 1.5),
          ),
          const SizedBox(height: 18),
          ElevatedButton.icon(
            onPressed: () => _onQueryChanged(_controller.text),
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Retry'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.accentLime,
              foregroundColor: Colors.black,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.search_off_rounded, color: AppTheme.textFaint, size: 52),
          const SizedBox(height: 14),
          Text(
            'No results for "${_controller.text}"',
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildGrid(List<Movie> items) {
    return GridView.builder(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.paddingOf(context).bottom + 96),
      itemCount: items.length,
      physics: const BouncingScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        // 0.50 fits the 2:3 poster MovieCard derives plus the title/year
        // block below it (see movie_card.dart).
        childAspectRatio: 0.50,
        crossAxisSpacing: 10,
        mainAxisSpacing: 14,
      ),
      itemBuilder: (_, i) => MovieCard(
        movie: items[i],
        width: null,
        height: null,
        margin: EdgeInsets.zero,
      ),
    );
  }
}
