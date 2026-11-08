import 'package:flutter/material.dart';

double _contrastRatio(Color first, Color second) {
  final firstLuminance = first.computeLuminance();
  final secondLuminance = second.computeLuminance();
  final lighter = firstLuminance > secondLuminance
      ? firstLuminance
      : secondLuminance;
  final darker = firstLuminance > secondLuminance
      ? secondLuminance
      : firstLuminance;
  return (lighter + 0.05) / (darker + 0.05);
}

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/app_theme.dart';

void main() {
  group('AppTheme', () {
    test('light theme uses the shared brand palette and Cairo typography', () {
      final theme = AppTheme.light;

      expect(theme.useMaterial3, isTrue);
      expect(theme.colorScheme.primary, AppPalette.navy);
      expect(theme.scaffoldBackgroundColor, AppPalette.canvas);
      expect(theme.iconTheme.color, AppPalette.navy);
      expect(theme.textTheme.bodyMedium?.fontFamily, 'Cairo');
      expect(theme.cardTheme.color, AppPalette.surface);
      expect(_contrastRatio(AppPalette.mutedInk, AppPalette.muted), greaterThanOrEqualTo(4.5));
      expect(_contrastRatio(AppPalette.success, AppPalette.canvas), greaterThanOrEqualTo(4.5));
      expect(_contrastRatio(AppPalette.warning, AppPalette.canvas), greaterThanOrEqualTo(4.5));
    });

    test('dark theme uses readable dark surfaces and Cairo typography', () {
      final theme = AppTheme.dark;

      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.dark);
      expect(theme.colorScheme.primary, AppPalette.gold);
      expect(theme.scaffoldBackgroundColor, AppPalette.darkCanvas);
      expect(theme.iconTheme.color, AppPalette.darkInk);
      expect(theme.textTheme.bodyMedium?.fontFamily, 'Cairo');
      expect(theme.cardTheme.color, AppPalette.darkSurface);
      expect(_contrastRatio(AppPalette.darkMutedInk, AppPalette.darkMuted), greaterThanOrEqualTo(4.5));
    });
  });
}
