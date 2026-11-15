---
applyTo: "**/*"
---

# Security instructions for AI-assisted and human code changes

These rules are mandatory for all code-generation, review, and refactoring work in this repository. Follow `docs/security/SECURE_ENGINEERING_STANDARD.md` as the full control baseline.

## Vibe Security workflow

1. Inspect the complete relevant files, callers, tests, configuration, and data flow before editing. Do not invent missing context.
2. Identify protected assets, attacker-controlled inputs, trust boundaries, authorization rules, and realistic abuse cases before proposing a patch.
3. Treat AI-generated code and dependencies as untrusted. Verify API signatures, framework behavior, and repository conventions.
4. Make the smallest safe change. Preserve existing features, error handling, accessibility, and backward compatibility unless a deliberate change is required.
5. Add regression tests, including negative authorization and malformed-input cases. For multi-tenant data, test cross-tenant access explicitly.
6. Review adjacent endpoints and alternate clients that use the same data or operation.
7. Run the relevant formatter, static analysis, tests, database checks, and production build. Inspect every changed line afterward.
8. Never weaken, skip, mock away, or disable a security check merely to make CI green.
9. Never leave truncated files, compressed one-line source, dead replacement code, debug bypasses, TODO security stubs, or silently disabled functionality.
10. State exactly what was tested and what remains unverified. A cancelled, skipped, or pending check is not a pass.

## OWASP-oriented review

- Authentication: session lifecycle, revocation, recovery, MFA, brute-force protection, secure cookies, and safe credential storage.
- Authorization: server-side object-level checks, least privilege, tenant isolation, IDOR/BOLA, privilege escalation, and deny-by-default behavior.
- API/input: schema validation, canonicalization, injection, XSS, CSRF, SSRF, path traversal, mass assignment, rate limits, resource limits, replay, and safe errors.
- Data/storage: encryption in transit, secret handling, private object storage, short-lived signed URLs, upload signature/size validation, export safety, and sensitive logging.
- Database/Supabase: RLS, tenant predicates, UPDATE USING/WITH CHECK, view security, SECURITY DEFINER grants/search_path, and service-role bypass review.
- Mobile: secure storage, local PIN throttling, deep links, WebViews, platform permissions, cleartext traffic, backups, signing, and client-side secret exposure.
- Supply chain/CI: lockfiles, dependency review, action permissions, third-party action integrity, secret isolation, and branch-specific security checks.

## Repository architecture rules

- Shared functional/security fixes must be implemented on both maintained branches where the corresponding component exists.
- `main` uses web/TypeScript technologies; `flutter-mobile-app` uses Dart/Flutter for mobile code.
- Test and push each branch independently. Do not copy platform-specific implementation code across branches.
- Supabase service-role operations bypass RLS: every server-side privileged operation must independently verify the authenticated user's organization, role, and target object.
- UI visibility is never an authorization boundary. The server and data/storage layer must enforce access.

Do not claim OWASP compliance, certification, or a completed penetration test based only on static review or automated CI.
