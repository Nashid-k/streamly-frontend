import 'package:flutter/material.dart';

class BottomNavSpacer extends StatelessWidget {
  /// Height of the floating bottom nav (64px bar + 8px margin) is 72.
  /// Reserve that, plus the device bottom inset + a small breathing room.
  const BottomNavSpacer({super.key, this.height = 72});

  final double height;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context).bottom;
    final extra = inset > 0 ? inset : 12.0;
    return SizedBox(height: height + extra + 12);
  }
}