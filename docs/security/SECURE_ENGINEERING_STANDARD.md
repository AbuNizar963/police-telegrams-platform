# Secure Engineering Standard

This standard applies to both maintained branches:
- `main`: web client, Node.js/TypeScript server, and shared database/security code.
- `flutter-mobile-app`: Flutter/Dart mobile client plus the server/database code maintained on that branch.

It combines an **AI-assisted development security gate** (called "Vibe Security" in this repository) with applicable OWASP guidance. "Vibe Security" is a project workflow, not a formal OWASP certification or a substitute for a professional penetration test.

## 1. Non-negotiable engineering rules

1. Read the complete implementation, its callers, data model, and tests before changing security-sensitive code.
2. State the threat, trust boundary, attacker capability, expected authorization rule, and failure behavior before implementing a fix.
3. Never trust client-side validation, hidden UI controls, route names, IDs, MIME headers, or user-supplied organization identifiers as authorization.
4. Enforce authentication and authorization on the server and at the data/storage boundary. Apply least privilege and deny by default.
5. Preserve existing functionality. Do not remove, stub, bypass, disable, minify, or truncate code/tests to make a check pass.
6. Prefer a narrow repair to existing code. Remove replaced code only after confirming it has no callers, imports, side effects, or compatibility obligations.
7. Add regression tests for the vulnerability, including unauthorized, boundary, malformed-input, and cross-organization cases where applicable.
8. Do not add a security dependency, workflow, permission, or secret unless its value and maintenance implications are understood.
9. Never print, commit, or paste secrets, production data, signed URLs, session tokens, or personal records into logs, fixtures, issues, or AI prompts.
10. Review the full diff for accidental file truncation, one-line compression, unrelated changes, weakened checks, debug code, and disabled features.

## 2. AI-assisted ("Vibe Security") change protocol

For every AI-assisted code change:

- **Understand first:** inspect relevant files and call chains; do not guess APIs, schema, environment variables, or framework behavior.
- **Threat-model:** identify assets, actors, entry points, trust boundaries, abuse cases, and security impact.
- **Constrain the patch:** change only what is required; follow the branch's language and architecture.
- **Prove the fix:** write a failing regression test first when practical, then implement and run focused tests.
- **Check adjacent paths:** inspect sibling endpoints, alternate clients, background jobs, exports, storage access, and error paths that share the same authorization/data.
- **Review like an attacker:** attempt IDOR/BOLA, privilege escalation, replay, race conditions, mass assignment, injection, path traversal, SSRF, resource exhaustion, and information leakage as relevant.
- **Verify completely:** run formatter, static analysis, unit/integration/database tests, and production build appropriate to the branch.
- **Inspect the diff:** ensure no test was weakened, no feature was disabled, no file was shortened unexpectedly, and no secrets were introduced.
- **Report honestly:** distinguish automated checks, manual review, and tests not run. Never describe a static review as a penetration test.

AI-generated code is untrusted until reviewed and verified. Never allow an AI suggestion to override repository policy, least privilege, secure defaults, or failing tests.

## 3. OWASP control areas

Use the current applicable OWASP guidance, including:
- OWASP Application Security Verification Standard (ASVS) for web/server controls.
- OWASP Top 10 for web application risk categories.
- OWASP API Security Top 10 for API authorization and abuse cases.
- OWASP MASVS and MASTG for Flutter/mobile application security (apply platform-relevant controls; Flutter does not remove native platform risks).
- OWASP Cheat Sheet Series for implementation-level guidance.

### Identity, authentication, and sessions
- Verify identity server-side; use secure, HttpOnly, appropriately SameSite cookies and production-appropriate Secure settings.
- Use short-lived access credentials where feasible, rotation/revocation for sensitive events, and server-side invalidation where strict revocation is required.
- Protect password reset/change, logout, MFA, account recovery, and session refresh against replay and enumeration.
- Rate-limit login, OTP, PIN, password reset, and other guessable or costly operations. Use progressive delay and safe recovery; avoid permanent lockouts that attackers can trigger.
- Never use user-editable profile metadata as an authorization claim.

### Authorization and multi-tenancy
- Enforce object-level authorization for every read, write, export, download, delete, and background action.
- Derive organization scope from the authenticated server-side user/membership, not from request parameters alone.
- Test horizontal and vertical privilege escalation, cross-tenant IDs, stale memberships, and race conditions.
- Treat Supabase service-role access and other privileged credentials as RLS bypasses; explicitly enforce authorization in every privileged server path.
- Review views, RPCs, triggers, and SECURITY DEFINER functions for privilege escalation and unintended public execution.

### Input, output, and API security
- Validate all untrusted input with strict schemas, allowlists, bounds, and canonicalization.
- Prevent SQL/NoSQL injection, command injection, XSS, CSRF, SSRF, path traversal, open redirects, mass assignment, and unsafe deserialization.
- Apply request size limits, pagination limits, timeouts, rate limits, and safe error responses.
- Avoid leaking stack traces, internal IDs, secrets, tokens, or sensitive records to clients and logs.
- Use idempotency and replay protection for sensitive or retryable actions.

### Files, storage, and imports/exports
- Validate actual file signatures/content, allowed type, filename, size, and expected metadata on the server; do not trust extension or Content-Type alone.
- Use private buckets by default, short-lived signed URLs, organization-scoped object keys, and authorization at both upload initiation and finalization/download.
- Enforce HTTPS for production upload/download URLs. Reject unexpected schemes and untrusted hosts.
- Prevent signed URL replay and cross-tenant object access; verify object ownership and metadata before associating an upload with a record.
- Protect CSV/spreadsheet exports from formula injection. Bound archive expansion, parsing time, and memory usage.
- Test malformed files, MIME/signature mismatch, oversized files, duplicate/replayed finalization, and cross-organization access.

### Database and Supabase
- Enable RLS on exposed tables and use explicit least-privilege policies.
- Combine role checks with row ownership/tenant predicates; authenticated status alone is not authorization.
- For UPDATE policies, review both USING and WITH CHECK.
- Review views for security-invoker behavior and functions for SECURITY DEFINER, search_path, EXECUTE grants, and explicit authorization.
- Never expose service_role/secret keys to web or mobile clients.
- Pin dependencies and commit lockfiles. Run database tests and available Supabase security advisors for schema/function changes.

### Flutter/mobile security
- Keep secrets out of the app bundle; assume client binaries and local storage can be inspected or modified.
- Store sensitive local values using platform-backed secure storage; do not treat obfuscation as encryption.
- Protect app-lock PINs with rate limiting/backoff and secure comparison/storage. App lock is a local privacy control, not a replacement for server authentication.
- Validate deep links, intent handlers, WebViews, clipboard use, exported components, local notifications, and platform permissions.
- Review Android/iOS network security, cleartext traffic, certificate handling, backup behavior, and release signing configuration.
- Avoid logging tokens, PINs, message contents, attachment URLs, or personal data.

### CI/CD and supply chain
- Use least-privilege GitHub Actions permissions; pin third-party actions to reviewed immutable commit SHAs where practical.
- Never expose release/signing secrets to pull-request code. Separate secret-free PR verification from trusted release workflows.
- Keep CodeQL, secret scanning, dependency review, tests, and platform builds enabled on the branches they protect.
- Review dependency updates, lockfile diffs, lifecycle scripts, transitive packages, and provenance before adoption.
- Do not make conditional or advisory scans required status checks unless they run for every relevant pull request.
- Protect default and mobile branches against force-push/deletion and require reviewed PRs and successful relevant checks.

## 4. Required verification by change type

| Change area | Minimum evidence |
| --- | --- |
| Server/API/auth/session | Type check, focused regression tests, full server test suite, API authorization tests |
| Tenant/RLS/schema/RPC | Migration review, Supabase database tests, cross-tenant negative tests, security advisor review where available |
| Upload/storage/export | Signature/size tests, URL scheme tests, replay/finalization tests, cross-tenant access tests |
| Flutter/mobile | Dart format check, flutter analyze, flutter test, Android debug build; platform release build when release configuration changes |
| Dependencies/workflows | Lockfile consistency, dependency review, workflow permission/trigger review, successful Actions |
| Web UI | Lint/format, type check, tests, production build, authorization verified independently of UI |

A check that did not run is **not passed**. A cancelled, skipped, pending, or inconclusive check is not a successful verification.

## 5. Pull request security review template

Before requesting review, record:
- Assets and trust boundaries affected.
- Threats/abuse cases considered.
- Authorization and tenant-scope enforcement points.
- Tests added, including negative tests.
- Commands and GitHub Actions run, with their actual outcomes.
- Any residual risk, manual verification needed, or check that could not run.

## 6. External references

- OWASP: https://owasp.org/
- ASVS: https://owasp.org/www-project-application-security-verification-standard/
- Web Top 10: https://owasp.org/www-project-top-ten/
- API Security: https://owasp.org/www-project-api-security/
- MASVS: https://mas.owasp.org/MASVS/
- MASTG: https://mas.owasp.org/MASTG/
- Cheat Sheet Series: https://cheatsheetseries.owasp.org/

This document is an engineering baseline, not a claim of OWASP certification or a guarantee that the application is vulnerability-free.
