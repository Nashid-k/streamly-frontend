import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/video_source_adapter.dart';
import '../providers/user_data_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_nav_spacer.dart';
import '../widgets/page_header.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final userData = Provider.of<UserDataProvider>(context);
    final accent   = Theme.of(context).colorScheme.primary;

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: ListView(
        padding: EdgeInsets.zero,
        physics: const BouncingScrollPhysics(),
        children: [
          PageHeader(title: 'Settings'),

          const SizedBox(height: 4),

          // ── Streaming ──
          _Section(title: 'STREAMING'),
          _Card(
            children: [
              _TappableTile(
                icon: Icons.dns_rounded,
                label: 'Default Server',
                accent: accent,
                value: VideoSourceAdapter.servers[userData.defaultServerIndex].shortName,
                onTap: () => _showServerModal(context, userData),
              ),
              const _Divider(),
              _SwitchTile(
                icon: Icons.playlist_play_rounded,
                label: 'Auto-Play Next Episode',
                subtitle: 'Automatically start the next episode when finished',
                accent: accent,
                value: userData.autoPlayNext,
                onChanged: userData.setAutoPlayNext,
              ),
              const _Divider(),
              _SwitchTile(
                icon: Icons.skip_next_rounded,
                label: 'Auto-Skip Intro',
                subtitle: 'Skip TV show intro sequences automatically',
                accent: accent,
                value: userData.autoSkipIntro,
                onChanged: userData.setAutoSkipIntro,
              ),
              const _Divider(),
              _TappableTile(
                icon: Icons.touch_app_rounded,
                label: 'Double-Tap Seek',
                accent: accent,
                value: '${userData.seekStepSeconds}s',
                onTap: () => _showSeekStepModal(context, userData, accent),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // ── Appearance ──
          _Section(title: 'APPEARANCE'),
          _Card(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Accent Color',
                        style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _AccentSwatch(
                          color: AppTheme.accentLime,
                          name: 'Lime',
                          selected: userData.accentColor == AppTheme.accentLime,
                          onTap: () => userData.setAccentColor(AppTheme.accentLime),
                        ),
                        _AccentSwatch(
                          color: AppTheme.accentBlue,
                          name: 'Ocean',
                          selected: userData.accentColor == AppTheme.accentBlue,
                          onTap: () => userData.setAccentColor(AppTheme.accentBlue),
                        ),
                        _AccentSwatch(
                          color: AppTheme.accentCrimson,
                          name: 'Crimson',
                          selected: userData.accentColor == AppTheme.accentCrimson,
                          onTap: () => userData.setAccentColor(AppTheme.accentCrimson),
                        ),
                        _AccentSwatch(
                          color: AppTheme.accentAmber,
                          name: 'Amber',
                          selected: userData.accentColor == AppTheme.accentAmber,
                          onTap: () => userData.setAccentColor(AppTheme.accentAmber),
                        ),
                        _AccentSwatch(
                          color: AppTheme.accentPurple,
                          name: 'Purple',
                          selected: userData.accentColor == AppTheme.accentPurple,
                          onTap: () => userData.setAccentColor(AppTheme.accentPurple),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // ── Storage ──
          _Section(title: 'STORAGE & RESET'),
          _Card(
            children: [
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppTheme.accentCrimson.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                  child: const Icon(Icons.delete_outline_rounded,
                      color: AppTheme.accentCrimson, size: 20),
                ),
                title: const Text('Clear All Data',
                    style: TextStyle(color: AppTheme.accentCrimson, fontWeight: FontWeight.w600, fontSize: 15)),
                subtitle: const Text('Watchlist, history, and settings',
                    style: TextStyle(color: AppTheme.textFaint, fontSize: 12)),
                onTap: () => _showResetDialog(context, userData),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // ── About ──
          _Section(title: 'ABOUT'),
          _Card(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: accent.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                          ),
                          child: Icon(Icons.play_circle_filled_rounded, color: accent, size: 26),
                        ),
                        const SizedBox(width: 12),
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Streamly Mobile',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                            Text('Version 1.0.0',
                                style: TextStyle(color: AppTheme.textFaint, fontSize: 12)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'An all-in-one streaming companion. Content metadata and artwork provided by TMDB.',
                      style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.55),
                    ),
                  ],
                ),
              ),
            ],
          ),

          BottomNavSpacer(height: 60),
        ],
      ),
    );
  }

  void _showServerModal(BuildContext context, UserDataProvider userData) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Default Server',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            const Divider(height: 1),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: VideoSourceAdapter.servers.length,
                itemBuilder: (_, i) {
                  final server = VideoSourceAdapter.servers[i];
                  final sel    = i == userData.defaultServerIndex;
                  return ListTile(
                    leading: Icon(
                      server.usesNativePlayer ? Icons.play_circle_rounded : Icons.language_rounded,
                      color: sel ? AppTheme.accentLime : AppTheme.textFaint,
                    ),
                    title: Text(server.name,
                        style: TextStyle(
                          color: sel ? AppTheme.accentLime : Colors.white,
                          fontWeight: sel ? FontWeight.bold : FontWeight.normal,
                        )),
                    subtitle: Text(
                      server.usesNativePlayer ? 'Native • quality & audio tracks' : 'Web embed',
                      style: const TextStyle(color: AppTheme.textFaint, fontSize: 11),
                    ),
                    trailing: sel ? const Icon(Icons.check_circle_rounded, color: AppTheme.accentLime) : null,
                    onTap: () { userData.setDefaultServer(i); Navigator.pop(ctx); },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showSeekStepModal(BuildContext context, UserDataProvider userData, Color accent) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Double-Tap Seek Step',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            const Divider(height: 1),
            ...[5, 10, 15, 20, 30].map((s) {
              final sel = s == userData.seekStepSeconds;
              return ListTile(
                leading: Icon(Icons.fast_forward_rounded,
                    color: sel ? accent : AppTheme.textFaint),
                title: Text('$s seconds',
                    style: TextStyle(color: sel ? accent : Colors.white,
                        fontWeight: sel ? FontWeight.bold : FontWeight.normal)),
                trailing: sel ? Icon(Icons.check_circle_rounded, color: accent) : null,
                onTap: () { userData.setSeekStep(s); Navigator.pop(ctx); },
              );
            }),
          ],
        ),
      ),
    );
  }

  void _showResetDialog(BuildContext context, UserDataProvider userData) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset All Data?'),
        content: const Text(
          'This permanently deletes your watchlist, collections, and watch history. Cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
          ),
          FilledButton(
            onPressed: () {
              userData.clearAllData();
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('All data cleared')),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: AppTheme.accentCrimson),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
  }
}

// ── Section header ──
class _Section extends StatelessWidget {
  final String title;
  const _Section({required this.title});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 16, 8),
    child: Text(title,
      style: const TextStyle(
        color: AppTheme.textFaint,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.0,
      ),
    ),
  );
}

// ── Card container ──
class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 16),
    decoration: BoxDecoration(
      color: AppTheme.card,
      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
    ),
    child: Column(children: children),
  );
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) =>
      const Divider(height: 1, indent: 58, endIndent: 0);
}

// ── Tappable setting row ──
class _TappableTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color accent;
  final VoidCallback onTap;
  const _TappableTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.accent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
    leading: _IconBox(icon: icon, accent: accent),
    title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 15)),
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(value, style: TextStyle(color: accent, fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        const Icon(Icons.chevron_right_rounded, color: Colors.white38, size: 20),
      ],
    ),
    onTap: onTap,
  );
}

// ── Switch setting row ──
class _SwitchTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color accent;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _SwitchTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.accent,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => SwitchListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
    secondary: _IconBox(icon: icon, accent: accent),
    title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 15)),
    subtitle: Text(subtitle, style: const TextStyle(color: AppTheme.textFaint, fontSize: 12)),
    value: value,
    onChanged: onChanged,
  );
}

class _IconBox extends StatelessWidget {
  final IconData icon;
  final Color accent;
  const _IconBox({required this.icon, required this.accent});
  @override
  Widget build(BuildContext context) => Container(
    width: 36,
    height: 36,
    decoration: BoxDecoration(
      color: accent.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
    ),
    child: Icon(icon, color: accent, size: 18),
  );
}

// ── Accent color swatch ──
class _AccentSwatch extends StatelessWidget {
  final Color color;
  final String name;
  final bool selected;
  final VoidCallback onTap;
  const _AccentSwatch({
    required this.color,
    required this.name,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Column(
      children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            boxShadow: selected
                ? [BoxShadow(color: color.withValues(alpha: 0.5), blurRadius: 12, spreadRadius: 1)]
                : [],
            border: selected
                ? Border.all(color: Colors.white, width: 2.5)
                : null,
          ),
          child: selected
              ? const Icon(Icons.check_rounded, color: Colors.black, size: 22)
              : null,
        ),
        const SizedBox(height: 6),
        Text(
          name,
          style: TextStyle(
            color: selected ? Colors.white : AppTheme.textFaint,
            fontSize: 11,
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ],
    ),
  );
}
