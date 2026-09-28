import 'package:flutter/material.dart';
import '../theme/player_ui.dart';

/// Settings-sheet row — mirrors the web `DialogRow`: 44px minimum height,
/// animated red check for the selected row, optional sub-label, chevron,
/// dimmed disabled state.
class PlayerDialogRow extends StatelessWidget {
  final String title;
  final String? sub;
  final bool selected;
  final bool disabled;
  final bool hasChevron;
  final Widget? leading;
  final VoidCallback? onTap;

  const PlayerDialogRow({
    super.key,
    required this.title,
    this.sub,
    this.selected = false,
    this.disabled = false,
    this.hasChevron = false,
    this.leading,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: disabled ? 0.45 : 1.0,
      child: InkWell(
        onTap: disabled ? null : onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              SizedBox(
                width: 22,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 160),
                  child: selected
                      ? const Icon(Icons.check_rounded,
                          key: ValueKey('check'), size: 16, color: PlayerUi.red)
                      : leading == null
                          ? const SizedBox(key: ValueKey('empty'))
                          : KeyedSubtree(key: const ValueKey('lead'), child: leading!),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: selected ? Colors.white : PlayerUi.text(0.82),
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                        fontSize: 15,
                      ),
                    ),
                    if (sub != null)
                      Text(
                        sub!,
                        style: TextStyle(color: PlayerUi.text(0.5), fontSize: 12),
                      ),
                  ],
                ),
              ),
              if (hasChevron)
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: PlayerUi.text(0.5)),
            ],
          ),
        ),
      ),
    );
  }
}
