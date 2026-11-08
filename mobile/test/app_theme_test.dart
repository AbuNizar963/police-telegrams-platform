import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/app_theme.dart';

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
      expect(
        _contrastRatio(AppPalette.mutedInk, AppPalette.muted),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        _contrastRatio(AppPalette.success, AppPalette.canvas),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        _contrastRatio(AppPalette.warning, AppPalette.canvas),
        greaterThanOrEqualTo(4.5),
      );
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
      expect(
        _contrastRatio(AppPalette.darkMutedInk, AppPalette.darkMuted),
        greaterThanOrEqualTo(4.5),
      );
    });

    testWidgets('semantic status colors follow the active theme', (
      tester,
    ) async {
      late Color lightSuccess;
      late Color lightWarning;
      late Color lightInfo;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Builder(
            builder: (context) {
              lightSuccess = context.appSuccess;
              lightWarning = context.appWarning;
              lightInfo = context.appInfo;
              return const SizedBox();
            },
          ),
        ),
      );

      expect(lightSuccess, AppPalette.success);
      expect(lightWarning, AppPalette.warning);
      expect(lightInfo, AppPalette.info);

      late Color darkSuccess;
      late Color darkWarning;
      late Color darkInfo;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Theme(
            data: AppTheme.dark,
            child: Builder(
              builder: (context) {
                darkSuccess = context.appSuccess;
                darkWarning = context.appWarning;
                darkInfo = context.appInfo;
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(darkSuccess, AppPalette.darkSuccess);
      expect(darkWarning, AppPalette.darkWarning);
      expect(darkInfo, AppPalette.darkInfo);
    });
  });
}
