# Flutter and Native Mobile Security

Apply these controls to Flutter/Dart applications. Flutter code is not a security boundary: assume the client can be reverse-engineered, instrumented, modified, and run on a compromised device.

## Credentials and local data

- Never embed service-role keys, private API keys, signing credentials, or server secrets in Dart source, assets, build-time defines, or app bundles.
- Store session credentials only in platform-backed secure storage (Android Keystore / iOS Keychain) through a maintained secure-storage package.
- Avoid storing sensitive telegram content or attachment bytes in unencrypted preferences, logs, caches, backups, or temporary files.
- Treat local PIN/app-lock as a privacy convenience, not server authentication or authorization.
- Rate-limit local PIN attempts with persistent, bounded backoff; reset failures only after successful verification. Avoid permanent lockouts that enable denial of service.
- Never store a PIN in plaintext or use a fast unsalted hash as password storage.

## Network and API

- Use HTTPS for production API and upload/download endpoints; reject cleartext traffic in production platform configuration.
- Do not disable certificate validation or accept all certificates in production.
- Validate deep links and app links; never let untrusted parameters directly authorize a sensitive operation.
- The server must independently authenticate and authorize every operation. Never trust client-provided user IDs, organization IDs, roles, prices, or ownership.
- Apply timeouts, bounded retries, and safe error handling. Do not log authorization headers, tokens, signed URLs, PINs, or message contents.

## Platform configuration

- Review Android manifest permissions, exported activities/providers/receivers, intent filters, backup rules, network security config, and cleartext traffic.
- Review iOS entitlements, URL schemes/universal links, ATS settings, Keychain accessibility, and backup behavior.
- Request only permissions required for a feature and explain sensitive permission use.
- Protect release signing keys outside source control; never expose them to pull-request workflows.
- Ensure debug flags, verbose network logging, and development endpoints are disabled in release builds.

## Verification

- Add tests for authentication failures, unauthorized API calls, deep-link validation, PIN throttling, and local data cleanup where relevant.
- Run `dart format --output=none --set-exit-if-changed lib test`, `flutter analyze`, `flutter test`, and an Android debug build.
- For platform configuration or release-signing changes, inspect the generated Android/iOS configuration and run the corresponding platform build when available.
