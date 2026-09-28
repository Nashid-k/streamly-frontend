import 'package:flutter/material.dart';
import '../theme/player_ui.dart';

/// Transient overlay pills — mirrors the web `Netflix*HUD` set. All
/// pointer-transparent; the parent owns the 1100ms fade and mounts this
/// persistently (opacity-animated) so exits fade instead of popping.
class PlayerHud extends StatelessWidget {
  /// volume | aspect | seek | play | pause | hold2x
  final String kind;
  /// volume/aspect: display text (`72%`, `Fill`); seek: signed (`-10s`);
  /// play/pause/hold2x: ignored.
  final String value;
  final double volume;
  final bool muted;

  const PlayerHud({
    super.key,
    required this.kind,
    required this.value,
    this.volume = 1.0,
    this.muted = false,
  });

  @override
  Widget build(BuildContext context) {
    switch (kind) {
      case 'volume':
        return _topPill(_volumeRow());
      case 'aspect':
        return _topPill(_aspectRow());
      case 'seek':
        return _seekBadge(value.startsWith('-'));
      case 'play':
        return _centerFlash(Icons.play_arrow_rounded);
      case 'pause':
        return _centerFlash(Icons.pause_rounded);
      case 'hold2x':
        return _holdPill();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _topPill(Widget child) {
    return Positioned.fill(
      child: IgnorePointer(
        child: Align(
          alignment: Alignment.topCenter,
          child: Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: PlayerUi.pillDecoration(),
              child: child,
            ),
          ),
        ),
      ),
    );
  }

  Widget _volumeRow() {
    final pct = (volume.clamp(0.0, 1.0) * 100).round();
    final icon = muted || pct == 0
        ? Icons.volume_off_rounded
        : pct < 40
            ? Icons.volume_down_rounded
            : Icons.volume_up_rounded;
    final iconColor = muted || pct == 0 ? PlayerUi.red : Colors.white;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: iconColor, size: 20),
        const SizedBox(width: 10),
        Container(
          width: 96,
          height: 4,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(2),
          ),
          child: Align(
            alignment: Alignment.centerLeft,
            child: FractionallySizedBox(
              widthFactor: pct / 100,
              child: Container(
                decoration: BoxDecoration(
                  color: PlayerUi.red,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 44,
          child: Text(
            '$pct%',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w700,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }

  Widget _aspectRow() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 46,
          height: 26,
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.88),
            border: Border.all(color: PlayerUi.red, width: 2),
            borderRadius: BorderRadius.circular(6),
            boxShadow: const [
              BoxShadow(color: Color(0x80250914), blurRadius: 18),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.88),
            borderRadius: BorderRadius.circular(8),
            border:
                Border.all(color: Colors.white.withValues(alpha: 0.1)),
          ),
          child: Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  Widget _seekBadge(bool back) {
    final label = value.replaceFirst('-', '');
    final chevron = Icon(
      back ? Icons.chevron_left_rounded : Icons.chevron_right_rounded,
      color: Colors.white,
      size: 30,
      shadows: const [Shadow(color: Color(0xCC000000), blurRadius: 4)],
    );
    final text = Text(
      label,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        shadows: [
          Shadow(color: Color(0xCC000000), blurRadius: 4),
          Shadow(color: Color(0x23000000), blurRadius: 14),
        ],
      ),
    );
    return Positioned.fill(
      child: IgnorePointer(
        child: Align(
          alignment: back ? Alignment.centerLeft : Alignment.centerRight,
          child: Padding(
            padding: EdgeInsets.only(
              left: back ? 24 : 0,
              right: back ? 0 : 24,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: back ? [chevron, text] : [text, chevron],
            ),
          ),
        ),
      ),
    );
  }

  Widget _centerFlash(IconData icon) {
    return Positioned.fill(
      child: IgnorePointer(
        child: Center(
          child: Icon(
            icon,
            color: Colors.white,
            size: 68,
            shadows: const [Shadow(color: Color(0xBF000000), blurRadius: 10)],
          ),
        ),
      ),
    );
  }

  Widget _holdPill() {
    return Positioned.fill(
      child: IgnorePointer(
        child: Align(
          alignment: Alignment.topRight,
          child: Padding(
            padding: const EdgeInsets.only(top: 14, right: 24),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.78),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                    color: Colors.white.withValues(alpha: 0.22)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '2x',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(width: 2),
                  Icon(Icons.chevron_right_rounded,
                      color: Colors.white, size: 20),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
