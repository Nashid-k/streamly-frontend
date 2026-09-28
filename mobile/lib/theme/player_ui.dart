import 'package:flutter/material.dart';

/// Web-player design tokens, translated 1:1 from
/// `src/constants/playerUi.js` + `NativePlayerView.jsx`.
///
/// The player chrome is Netflix-red on near-black, independent of the app's
/// lime accent — an exact-clone requirement, not a theme override.
class PlayerUi {
  PlayerUi._();

  /// Netflix red — played bar, knob, active states, spinner.
  static const Color red = Color(0xFFE50914);

  // Chrome text hierarchy (white alphas from the web build).
  static Color text(double opacity) => Colors.white.withValues(alpha: opacity);

  // Track / buffered fills.
  static Color get trackBase => Colors.white.withValues(alpha: 0.30);
  static Color get trackBuffered => Colors.white.withValues(alpha: 0.50);

  // Pills + cards.
  static Color get pillBg => Colors.black.withValues(alpha: 0.88);
  static Color get cardBg => const Color(0xF5141414);
  static const double cardRadius = 4;

  // Transport sizing (touch-first; the web desktop 40px variant is N/A).
  static const double btnSize = 44;
  static const double playPauseIcon = 28;
  static const double railIcon = 24;
  static const double centerSideIcon = 34;
  static const double centerPlayIcon = 40;
  static const double centerPlayCircle = 92;
  static const double centerGap = 20;

  // Scrubber.
  static const double scrubHitHeight = 44;
  static const double trackHeightIdle = 3;
  static const double trackHeightActive = 5;
  static const double knobIdle = 13;
  static const double knobActive = 17;

  // Timers (mirror the web constants).
  static const Duration hideDelay = Duration(seconds: 3);
  static const Duration hudFade = Duration(milliseconds: 1100);
  static const Duration chromeFade = Duration(milliseconds: 220);
  static const Duration cueFade = Duration(milliseconds: 140);
  static const double hold2xDelayMs = 420;
  static const double edgeDoubleTapMs = 350;
  static const double pinchHysteresis = 0.15;

  // Motion curves approximating the web springs.
  static const Curve snappy = Curves.easeOutBack;
  static const Curve chromeCurve = Curves.easeOut;

  /// Frame-relative HUD scale — mirrors `hudMetrics(w,h)`: sub-linear in the
  /// smallest edge, clamped so phones and tablets both land sanely.
  static double scaleFor(Size frame) {
    final basis = (frame.width < frame.height ? frame.width : frame.height);
    if (basis <= 0) return 1.0;
    final s = (basis / 720);
    final sub = s <= 0 ? 1.0 : _sqrt(s);
    return sub.clamp(0.62, 1.5);
  }

  static double _sqrt(double v) {
    var x = v > 1 ? v : 1.0;
    for (var i = 0; i < 8; i++) {
      x = 0.5 * (x + v / x);
    }
    return x;
  }

  /// Shared pill decoration (volume / aspect / hold-2x).
  static BoxDecoration pillDecoration() {
    return BoxDecoration(
      color: pillBg,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      boxShadow: const [
        BoxShadow(color: Color(0xB3000000), blurRadius: 48, offset: Offset(0, 16)),
      ],
    );
  }

  /// Top / bottom chrome gradients (painted by the chrome itself, no scrims).
  static const LinearGradient topGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0x8C000000), Color(0x38000000), Color(0x00000000)],
  );
  static const LinearGradient bottomGradient = LinearGradient(
    begin: Alignment.bottomCenter,
    end: Alignment.topCenter,
    colors: [Color(0xD9000000), Color(0x73000000), Color(0x00000000)],
  );
}
