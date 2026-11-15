# Secure Engineering Instructions

These instructions apply to every contributor and automated coding agent working in this repository.

## Required security workflow

1. Read `SECURITY.md`, this file, and `docs/OWASP_SECURITY_CHECKLIST_AR.md` before changing authentication, authorization, tenant data, uploads, exports, storage, database policies, secrets, or CI workflows.
2. For security audits and security-sensitive code changes, load `.agents/skills/vibe-security/SKILL.md` and only the technology references that match this codebase. Treat examples as audit patterns, not copy-paste fixes; verify against current official documentation and this repository's architecture.
3. Define the trust boundary and threat before coding: actor, resource, organization/tenant, operation, entry point, privileged dependencies, and expected denial behavior.
4. Trace authorization from the public route to the final database/storage operation. A hidden UI control is never authorization.
5. Prefer the smallest complete patch to existing code. Preserve existing behavior and features unless the change explicitly requires removal. Remove obsolete code cleanly after replacement; never leave dead or commented-out security bypasses.
6. Validate all untrusted input on the server. Treat client-supplied user IDs, organization IDs, roles, file names, MIME types, URLs, and object keys as untrusted.
7. Keep privileged credentials server-only. Never log tokens, cookies, passwords, signed URLs, secret values, or sensitive personal/telegram content.
8. Add regression tests for both the allowed path and the denied/abuse path. Include cross-tenant access tests for tenant-owned records and files.
9. Review the complete diff for accidental deletions, truncated files, one-line/minified replacements, disabled features, debug bypasses, and unrelated changes.
10. Run the relevant formatter, lint, type checks, unit/integration tests, database tests, and production build. Inspect every GitHub Actions workflow on the exact commit in each affected branch.
11. Do not claim a check passed unless its run completed successfully. Do not merge while required checks are pending, cancelled, skipped unexpectedly, or failing.

## Authorization and tenant isolation

- Enforce authentication and object-level authorization server-side on every read, write, export, download, upload, and destructive action.
- Derive the acting user and tenant membership from the verified server session/database state, not request payloads or editable user metadata.
- Verify the resource belongs to the caller's active organization for every operation; never trust a resource ID as proof of access.
- Apply least privilege to database roles, service-role clients, storage policies, RPCs, and administrative routes.
- For Supabase, review RLS on every exposed table, views and functions that may bypass RLS, both USING and WITH CHECK on updates, and grants/EXECUTE permissions. Service-role operations must perform explicit tenant authorization before use.
- Avoid IDOR/BOLA by testing a user from organization A against IDs and object keys belonging to organization B.

## Authentication and sessions

- Use secure, HttpOnly, appropriately SameSite cookies and production HTTPS; review CSRF protection for cookie-authenticated state changes.
- Rate-limit login, password reset/change, OTP, PIN, and other credential-guessing surfaces with bounded backoff and safe recovery.
- Revoke or rotate sessions/tokens after password changes, account compromise, role changes, and logout where the architecture supports revocation. Verify the server rejects old credentials.
- Never store plaintext passwords or PINs. Use a suitable password hashing/KDF for locally verified secrets and protect device-local secrets using platform secure storage.
- Do not rely on a local app lock as a substitute for server authentication or authorization.

## Input, uploads, exports, and outbound requests

- Validate schemas, lengths, ranges, encodings, and business invariants at trust boundaries.
- For uploads, enforce allowlisted formats, size limits, content/signature inspection, safe generated object keys, ownership/tenant scope, and safe download headers. Do not trust filename extensions or Content-Type alone.
- Require HTTPS for production external upload/download destinations. Reject unexpected schemes, hosts, redirects, and private/internal network destinations where the server fetches URLs (SSRF protection).
- Use short-lived signed URLs and bind them to a single object/action. Test replay, cross-tenant access, replacement, and post-expiry behavior.
- Prevent stored/reflected XSS, HTML injection, path traversal, CSV/formula injection, unsafe deserialization, and unsafe document rendering.
- Avoid leaking private data in exports, previews, notifications, caches, analytics, and error messages.

## Web, API, and platform controls

- Apply secure response headers and an appropriate Content Security Policy; avoid unsafe inline script allowances where practical.
- Protect cookie-authenticated mutations against CSRF; configure CORS narrowly and never treat CORS as authorization.
- Use explicit request/body limits, timeouts, pagination limits, and rate limits to reduce abuse and resource exhaustion.
- Treat user-controlled outbound URLs and webhook destinations as SSRF-sensitive.
- Ensure private responses are not cached by shared caches or service workers.
- Return generic client errors; log a correlation ID and safe diagnostic context server-side.

## Dependencies and CI/CD supply chain

- Pin dependencies through committed lockfiles; review dependency updates and known vulnerabilities.
- Pin GitHub Actions to immutable commit SHAs where practical, grant minimum workflow permissions, and avoid executing untrusted PR code with secrets or write tokens.
- Never expose deployment secrets to forked pull requests. Scope environment secrets and deployment permissions narrowly.
- Review changes to workflows, build scripts, package lifecycle scripts, release automation, and artifact provenance as security-sensitive.
- Keep CodeQL, secret scanning, dependency review (when dependency files change), and platform-specific analysis enabled.

## OWASP verification baseline

Use the current OWASP Top 10 and OWASP ASVS as review references. At minimum, assess:
- Broken Access Control (including BOLA/IDOR and tenant isolation)
- Cryptographic Failures and secret exposure
- Injection (SQL/NoSQL/command/template/HTML)
- Insecure Design and missing abuse controls
- Security Misconfiguration (headers, CORS, cookies, storage, RLS)
- Vulnerable and Outdated Components
- Authentication and Session Management Failures
- Software and Data Integrity Failures (CI/CD, dependencies, imports)
- Security Logging and Monitoring Failures
- SSRF and unsafe outbound requests

Do not claim OWASP certification or full compliance from checklist completion. Record residual risks and untested areas in the security review report.

## Cross-platform repository rule

This repository has separate web/server and Flutter branches. When a feature or security behavior has a meaningful counterpart in both, implement and verify each branch independently using its native technology. Do not copy web implementation code into Flutter or vice versa. Server-side enforcement remains authoritative.
