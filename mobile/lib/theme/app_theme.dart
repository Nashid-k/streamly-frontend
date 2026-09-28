import 'package:flutter/material.dart';

class AppTheme {
  // Core surfaces
  static const Color background   = Color(0xFF060608);
  static const Color surface      = Color(0xFF0F0F14);
  static const Color card         = Color(0xFF17171E);
  static const Color cardElevated = Color(0xFF1E1E27);
  static const Color cardBorder   = Color(0x1AFFFFFF);

  // Text hierarchy
  static const Color textPrimary   = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFFA1A1AA);
  static const Color textFaint     = Color(0xFF52525B);

  // Accent palette
  static const Color accentLime    = Color(0xFF95FF50);
  static const Color accentBlue    = Color(0xFF0A84FF);
  static const Color accentCrimson = Color(0xFFFF2A54);
  static const Color accentAmber   = Color(0xFFFFB800);
  static const Color accentPurple  = Color(0xFFBF5AF2);

  // Semantic
  static const Color success = Color(0xFF30D158);
  static const Color warning = Color(0xFFFF9F0A);

  // Glass / blur helpers
  static Color glassWhite(double opacity) => Colors.white.withValues(alpha: opacity);
  static Color glassDark(double opacity)  => Colors.black.withValues(alpha: opacity);

  // Elevation shadows
  static List<BoxShadow> shadowSm = [
    BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 8, offset: const Offset(0, 4)),
  ];
  static List<BoxShadow> shadowMd = [
    BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 20, offset: const Offset(0, 8)),
  ];
  static List<BoxShadow> shadowLg = [
    BoxShadow(color: Colors.black.withValues(alpha: 0.65), blurRadius: 40, offset: const Offset(0, 16)),
  ];
  static List<BoxShadow> glowLime = [
    BoxShadow(color: accentLime.withValues(alpha: 0.35), blurRadius: 20, spreadRadius: -4),
  ];

  // Border radii tokens
  static const double radiusSm  = 8;
  static const double radiusMd  = 12;
  static const double radiusLg  = 16;
  static const double radiusXl  = 24;
  static const double radiusFull = 100;

  static ThemeData getThemeData({Color accent = accentLime}) {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      primaryColor: accent,
      splashFactory: InkSparkle.splashFactory,
      colorScheme: ColorScheme.dark(
        primary: accent,
        secondary: accent,
        surface: surface,
        onSurface: textPrimary,
      ),
      // Global text theme with SF-like tight tracking
      textTheme: const TextTheme(
        displayLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w900, letterSpacing: -1.0),
        displayMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w800, letterSpacing: -0.8),
        headlineLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w800, letterSpacing: -0.5),
        headlineMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.bold, letterSpacing: -0.3),
        titleLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.bold),
        titleMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w600),
        bodyLarge: TextStyle(color: textPrimary, height: 1.5),
        bodyMedium: TextStyle(color: textSecondary, height: 1.5),
        bodySmall: TextStyle(color: textFaint),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 22,
          fontWeight: FontWeight.w900,
          letterSpacing: -0.5,
        ),
      ),
      // Chip theme used in search/filter
      chipTheme: ChipThemeData(
        backgroundColor: card,
        selectedColor: accent,
        checkmarkColor: Colors.black,
        labelStyle: const TextStyle(color: textPrimary, fontWeight: FontWeight.w600, fontSize: 12),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusFull)),
        side: const BorderSide(color: Colors.transparent),
      ),
      // Dialog theme
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusXl)),
        titleTextStyle: const TextStyle(color: textPrimary, fontSize: 18, fontWeight: FontWeight.bold),
        contentTextStyle: const TextStyle(color: textSecondary, fontSize: 14, height: 1.5),
      ),
      // Bottom sheet theme
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: surface,
        modalBackgroundColor: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(radiusXl)),
        ),
      ),
      // Divider
      dividerTheme: const DividerThemeData(color: Color(0x1AFFFFFF), thickness: 1, space: 1),
      // Switch
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? Colors.black : textFaint),
        trackColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? accent : const Color(0xFF2A2A35)),
      ),
      // Snackbar
      snackBarTheme: SnackBarThemeData(
        backgroundColor: cardElevated,
        contentTextStyle: const TextStyle(color: textPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
        behavior: SnackBarBehavior.floating,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.transparent,
        elevation: 0,
        selectedItemColor: accentLime,
        unselectedItemColor: textFaint,
        type: BottomNavigationBarType.fixed,
      ),
    );
  }
}
