import 'package:flutter/material.dart';
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
    });
  });
}
