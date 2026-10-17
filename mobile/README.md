# police_telegrams

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Dart formatting and verification

Use the repository's canonical formatter from the `mobile` directory before
committing Dart changes:

```bash
./tool/format_dart.sh --fix
./tool/format_dart.sh --check
flutter analyze
flutter test
```

The formatter is pinned through the Flutter version configured in GitHub
Actions. Direct pushes to `flutter-mobile-app` are formatted before analysis and
tests; if formatting changes files, CI commits only those formatted Dart files
after the checks pass. Pull requests are never rewritten by CI: an unformatted
pull request reports the affected files and the exact command to fix them.
Formatting changes whitespace only; it does not minify or rewrite application
logic.
