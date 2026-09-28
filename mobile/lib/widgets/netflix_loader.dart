import 'dart:math';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class NetflixLoader extends StatefulWidget {
  final double size;
  final Color color;

  const NetflixLoader({
    super.key,
    this.size = 50.0,
    this.color = AppTheme.accentLime,
  });

  @override
  State<NetflixLoader> createState() => _NetflixLoaderState();
}

class _NetflixLoaderState extends State<NetflixLoader> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) {
        return Transform.rotate(
          angle: _controller.value * 2 * pi,
          child: CustomPaint(
            size: Size(widget.size, widget.size),
            painter: _ArcPainter(color: widget.color, progress: _controller.value),
          ),
        );
      },
    );
  }
}

class _ArcPainter extends CustomPainter {
  final Color color;
  final double progress;

  _ArcPainter({required this.color, required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 4.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - paint.strokeWidth / 2;

    // Easing for the arc length
    final sweepAngle = sin(progress * pi) * pi * 1.5 + 0.1;
    final startAngle = progress * pi * 2;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant _ArcPainter oldDelegate) => oldDelegate.progress != progress;
}
