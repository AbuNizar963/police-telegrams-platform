# Contributing

Thank you for helping improve Police Telegrams Platform. Changes should be small, reviewable, tested, and safe for existing data and workflows.

## Before changing code

1. Read the relevant module and its tests before editing.
2. Preserve existing behavior unless the change explicitly requires changing it.
3. Never commit credentials, access tokens, signing keys, private URLs, production data, or local environment files.
4. For database changes, add a forward migration and appropriate database tests. Do not edit an already-applied migration to change production schema history.
5. For imports, exports, and destructive operations, validate input, scope the operation, and test error and partial-failure cases.

## Web and server checks

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm test
pnpm build
```

For database changes, also run the local Supabase migration and database test workflow documented in `.github/workflows/ci.yml`.

## Flutter mobile checks

Run from `mobile/`:

```bash
flutter pub get
dart format lib test
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build apk --debug
```

Use the formatter bundled with the Flutter/Dart SDK configured by the project. Do not use a different formatter or manually adjust whitespace to work around a formatting failure.

## Pull requests and Actions

- Keep changes focused and explain the reason and user-visible impact.
- Include or update tests for behavior changes and bug fixes.
- Review the complete diff for accidental truncation, one-line file compression, debug code, disabled features, and unrelated edits.
- Wait for required GitHub Actions checks to pass before merging.
- Do not claim a build or device behavior is verified unless the corresponding check or manual test actually ran.
- Never weaken, skip, or bypass a failing check just to obtain a green status.

## Security and privacy

- Treat authorization as server-enforced; hiding UI controls is not access control.
- Avoid logging credentials, tokens, personal information, or full imported records.
- Validate uploads and imports on the server, enforce size/type limits, and use organization-scoped access checks.
- For changes to authentication, organization membership, storage URLs, or deletion flows, add regression tests covering unauthorized and cross-organization access.
