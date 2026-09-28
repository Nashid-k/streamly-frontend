import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'dart:async';

class DynamicIsland {
  static OverlayEntry? _overlayEntry;
  static bool _isVisible = false;
  static String _message = '';
  static IconData _icon = Icons.info_rounded;
  static Timer? _timer;

  static void show(BuildContext context, String message, {IconData icon = Icons.info_rounded, Duration duration = const Duration(seconds: 3)}) {
    _message = message;
    _icon = icon;

    if (_isVisible) {
      _overlayEntry?.markNeedsBuild();
      _startTimer(duration);
      return;
    }

    _isVisible = true;
    _overlayEntry = OverlayEntry(
      builder: (context) => _DynamicIslandWidget(
        message: _message,
        icon: _icon,
        onDismiss: () => hide(),
      ),
    );

    Overlay.of(context).insert(_overlayEntry!);
    _startTimer(duration);
  }

  static void _startTimer(Duration duration) {
    _timer?.cancel();
    _timer = Timer(duration, () {
      hide();
    });
  }

  static void hide() {
    _timer?.cancel();
    if (_isVisible) {
      _isVisible = false;
      _overlayEntry?.remove();
      _overlayEntry = null;
    }
  }
}

class _DynamicIslandWidget extends StatefulWidget {
  final String message;
  final IconData icon;
  final VoidCallback onDismiss;

  const _DynamicIslandWidget({
    required this.message,
    required this.icon,
    required this.onDismiss,
  });

  @override
  State<_DynamicIslandWidget> createState() => _DynamicIslandWidgetState();
}

class _DynamicIslandWidgetState extends State<_DynamicIslandWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnim;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
    _scaleAnim = CurvedAnimation(parent: _controller, curve: Curves.elasticOut);
    _fadeAnim = CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.of(context).padding.top + 10,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: Material(
            color: Colors.transparent,
            child: ScaleTransition(
              scale: _scaleAnim,
              child: FadeTransition(
                opacity: _fadeAnim,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(40),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.accentLime.withValues(alpha: 0.15),
                        blurRadius: 16,
                        spreadRadius: 2,
                      ),
                    ],
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(widget.icon, color: AppTheme.accentLime, size: 18),
                      const SizedBox(width: 10),
                      Text(
                        widget.message,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
