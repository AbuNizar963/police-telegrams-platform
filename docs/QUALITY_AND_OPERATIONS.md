# Quality, Security, and Operations Guide

This guide describes the minimum verification expected for changes to Police Telegrams Platform. It complements the repository CI workflows; it does not replace running the checks or verifying production configuration.

## Change verification

### Web and server

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm test
pnpm build
```

For database changes, use the local Supabase workflow in `.github/workflows/ci.yml` to reset a disposable local database, apply migrations, and run database tests. Never point destructive test commands at production.

### Flutter

Run from `mobile/`:

```bash
flutter pub get
./tool/format_dart.sh --check
flutter analyze
flutter test
flutter build apk --debug
```

The release workflow separately validates the signed APK and verifies an unsigned iOS release build. iOS signing and publishing require the appropriate Apple signing setup and are not implied by a successful no-codesign build.

## Regression test matrix

For relevant changes, add tests for the applicable cases below.

- Authentication: missing, expired, malformed, and insufficiently privileged credentials.
- Organization isolation: a user cannot read, change, export, or delete another organization's records by guessing identifiers or calling APIs directly.
- Telegram records: create, view, update, delete, and any linked-record behavior remain consistent.
- Import/export: valid workbook, missing required columns, empty workbook, invalid values, duplicate rows, partial failures, and large files.
- Dates and times: Excel serial dates, ISO date/time strings, date-only values, time-only values, midnight, and timezone boundaries. A time-only hour such as `17` should be normalized to `17:00:00` when that is the agreed import contract.
- Organization branding: configured logo appears in settings, welcome surfaces, and telegram preview; missing or inaccessible logos have a deliberate fallback.
- Mobile layout: small screens, Arabic RTL, keyboard-open composer, rotation, and loading/error states.
- Data safety: destructive operations are scoped, validated, and tested; failures do not silently leave partial writes.

Do not create tests that depend on real production data, production credentials, or an external live service unless the test is explicitly isolated and approved.

## Security and secrets

- Enforce access control on the server/database, not only in the UI.
- Store secrets in GitHub Actions secrets or the approved deployment secret store. Never add secret values to source files or logs.
- Keep GitHub Actions permissions minimal. Third-party actions should be reviewed and pinned according to the repository's supply-chain policy.
- Review CodeQL and dependency-review findings before merging.
- Check uploaded files for allowed types and sizes, validate their contents, and scope file access to the correct organization.
- Do not log authentication headers, access tokens, private storage URLs, or full telegram records.
- Rotate any credential suspected of exposure and review its access logs.

## Backups and recovery

A backup is only useful if restoration is tested. Before a production schema migration or risky data operation:

1. Confirm a recent successful backup exists and identify its recovery point.
2. Test restoration into an isolated non-production environment.
3. Review migration ordering and backward compatibility.
4. Define the rollback or forward-fix plan.
5. Verify record counts and key relationships after the operation.

The repository alone cannot prove that a production backup schedule, retention policy, or restore procedure is configured. Confirm those in the database and hosting provider dashboards.

## Monitoring and incident response

Monitor service health, API error rates, latency, failed jobs, database availability, storage access, and mobile release failures through the hosting/provider monitoring available to the deployment.

If adding an error-reporting vendor, first approve the provider and configure its DSN/credentials in the deployment environment. Configure scrubbing so tokens, personal information, and telegram contents are not collected. Do not hard-code production monitoring credentials in the repository.

For an incident: contain access or disable the affected credential, preserve sanitized logs, identify the impacted scope, restore service/data safely, verify the fix, and document follow-up work.

## Release checklist

- [ ] The change is narrowly scoped and reviewed.
- [ ] Relevant tests cover success, validation failures, authorization failures, and edge cases.
- [ ] Formatting, lint, type analysis, tests, and relevant builds pass on the exact commit.
- [ ] Database migrations and data effects are reviewed.
- [ ] No secret, private record, debug code, or accidental file truncation is present in the diff.
- [ ] GitHub Actions security and dependency findings are reviewed.
- [ ] Required deployment variables and secrets are configured outside source control.
- [ ] Rollback and post-deployment verification steps are known.
- [ ] Production behavior is not claimed verified until it has actually been checked.
