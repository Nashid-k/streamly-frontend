import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Bottom settings sheet — mirrors the web touch sheet: full-width,
/// 85%-capped, 16px top radius, near-black surface, back-arrow header.
Future<T?> showPlayerSheet<T>({
  required BuildContext context,
  required String title,
  required Widget child,
  bool showBack = false,
  VoidCallback? onBack,
}) {
  return showModalBottomSheet<T>(
    context: context,
    backgroundColor: const Color(0xF5000000),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    constraints: BoxConstraints(
      maxWidth: 480,
      maxHeight: MediaQuery.of(context).size.height * 0.85,
    ),
    builder: (ctx) => SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
            child: Row(
              children: [
                if (showBack)
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded,
                        color: Colors.white, size: 20),
                    onPressed: () {
                      Navigator.pop(ctx);
                      onBack?.call();
                    },
                  )
                else
                  const SizedBox(width: 48),
                Expanded(
                  child: Text(
                    title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded,
                      color: Colors.white, size: 18),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
          ),
          const Divider(color: Colors.white10, height: 1),
          Flexible(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                16,
                0,
                16,
                12 + MediaQuery.of(ctx).padding.bottom,
              ),
              child: child,
            ),
          ),
        ],
      ),
    ),
  );
}

/// Section eyebrow label inside sheets (uppercase micro-label).
class PlayerSheetSection extends StatelessWidget {
  final String label;
  const PlayerSheetSection(this.label, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 4),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
          color: AppTheme.textFaint,
        ),
      ),
    );
  }
}
