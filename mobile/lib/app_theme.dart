import 'package:flutter/material.dart';

/// Semantic brand tokens mirrored by client/src/index.css and
/// docs/DESIGN_SYSTEM_WEB_MOBILE_AR.md. Keep platform layouts native while
/// keeping the shared visual identity stable.
abstract final class AppPalette {
  static const navy = Color(0xFF10233F);
  static const gold = Color(0xFFD8C38E);
  static const canvas = Color(0xFFF8F7F2);
  static const surface = Color(0xFFFFFEFC);
  static const ink = Color(0xFF202B3A);
  static const muted = Color(0xFFF1F2F4);
  static const mutedInk = Color(0xFF687385);
  static const border = Color(0xFFE1E5EB);
  static const danger = Color(0xFFB42332);
  static const success = Color(0xFF16836B);
  static const warning = Color(0xFFB7791F);
  static const info = Color(0xFF356AC3);
  static const sidebarAccent = Color(0xFF263A55);

  static const darkCanvas = Color(0xFF101925);
  static const darkSurface = Color(0xFF182538);
  static const darkInk = Color(0xFFF5F6F8);
  static const darkMuted = Color(0xFF26364B);
  static const darkMutedInk = Color(0xFFCBD4E1);
  static const darkBorder = Color(0xFF2A384B);
  static const darkOutline = Color(0xFF34445B);
  static const darkSidebarAccent = Color(0xFF263A55);

  static const lightScheme = ColorScheme.light(
    primary: navy,
    onPrimary: surface,
    secondary: gold,
    onSecondary: navy,
    surface: surface,
    onSurface: ink,
    error: danger,
    onError: surface,
    outline: border,
    outlineVariant: border,
    surfaceContainerLowest: surface,
    surfaceContainerLow: canvas,
    surfaceContainer: muted,
    surfaceContainerHigh: muted,
    surfaceContainerHighest: muted,
  );

  static const darkScheme = ColorScheme.dark(
    primary: gold,
    onPrimary: navy,
    secondary: gold,
    onSecondary: navy,
    surface: darkSurface,
    onSurface: darkInk,
    error: Color(0xFFF97066),
    onError: Color(0xFF341118),
    outline: darkOutline,
    outlineVariant: darkBorder,
    surfaceContainerLowest: darkCanvas,
    surfaceContainerLow: darkSurface,
    surfaceContainer: darkMuted,
    surfaceContainerHigh: darkMuted,
    surfaceContainerHighest: darkMuted,
  );
}
