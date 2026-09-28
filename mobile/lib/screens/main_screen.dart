import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';
import 'movies_screen.dart';
import 'search_screen.dart';
import 'series_screen.dart';
import 'settings_screen.dart';
import 'watchlist_screen.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> with SingleTickerProviderStateMixin {
  int _currentIndex = 0;
  late final AnimationController _navAnimController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 180),
  );

  static const _tabs = [
    (icon: Icons.home_rounded,      outline: Icons.home_outlined,        label: 'Home'),
    (icon: Icons.movie_rounded,     outline: Icons.movie_outlined,        label: 'Movies'),
    (icon: Icons.tv_rounded,        outline: Icons.tv_outlined,           label: 'Series'),
    (icon: Icons.search_rounded,    outline: Icons.search_outlined,       label: 'Search'),
    (icon: Icons.bookmarks_rounded, outline: Icons.bookmarks_outlined,    label: 'My List'),
    (icon: Icons.settings_rounded,  outline: Icons.settings_outlined,     label: 'Settings'),
  ];

  void _onTabTap(int index) {
    if (index == _currentIndex) return;
    HapticFeedback.selectionClick();
    _navAnimController.forward(from: 0);
    setState(() => _currentIndex = index);
  }

  @override
  void dispose() {
    _navAnimController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      backgroundColor: AppTheme.background,
      extendBody: true,
      body: IndexedStack(
        index: _currentIndex,
        children: [
          HomeScreen(active: _currentIndex == 0),
          MoviesScreen(active: _currentIndex == 1),
          SeriesScreen(active: _currentIndex == 2),
          const SearchScreen(),
          const WatchlistScreen(),
          const SettingsScreen(),
        ],
      ),
      bottomNavigationBar: _buildFloatingNav(accent),
    );
  }

  Widget _buildFloatingNav(Color accent) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
        child: Container(
          height: 62,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusXl),
            border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
            boxShadow: AppTheme.shadowMd,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusXl),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
              child: Container(
                color: AppTheme.surface.withValues(alpha: 0.88),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: List.generate(_tabs.length, (i) => _NavItem(
                    tab: _tabs[i],
                    isActive: _currentIndex == i,
                    accent: accent,
                    onTap: () => _onTabTap(i),
                  )),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final ({IconData icon, IconData outline, String label}) tab;
  final bool isActive;
  final Color accent;
  final VoidCallback onTap;

  const _NavItem({
    required this.tab,
    required this.isActive,
    required this.accent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Active indicator dot above icon
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutBack,
                height: 3,
                width: isActive ? 18 : 0,
                margin: const EdgeInsets.only(bottom: 4),
                decoration: BoxDecoration(
                  color: accent,
                  borderRadius: BorderRadius.circular(2),
                  boxShadow: isActive
                      ? [BoxShadow(color: accent.withValues(alpha: 0.6), blurRadius: 6)]
                      : [],
                ),
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: Icon(
                  isActive ? tab.icon : tab.outline,
                  key: ValueKey(isActive),
                  color: isActive ? accent : AppTheme.textFaint,
                  size: 22,
                ),
              ),
              const SizedBox(height: 3),
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 200),
                style: TextStyle(
                  color: isActive ? accent : AppTheme.textFaint,
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.normal,
                ),
                child: Text(tab.label, maxLines: 1),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
