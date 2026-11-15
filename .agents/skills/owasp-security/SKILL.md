---
name: owasp-security
description: Reviews and guides changes against applicable OWASP security standards for this repository. Use for OWASP audits, security reviews, authentication, authorization, APIs, Supabase/RLS, uploads, storage, exports, Flutter/mobile, and CI/CD security.
license: MIT
metadata:
  author: Police Telegrams Platform maintainers
  version: "1.0"
---

# OWASP Security Review Skill

This is a repository-local review workflow that maps project risks to OWASP guidance. It is not an OWASP-published tool, certification, or substitute for independent penetration testing.

## Required references

Read the relevant parts of:
- AGENTS.md
- docs/security/SECURE_ENGINEERING_STANDARD.md
- docs/OWASP_SECURITY_CHECKLIST_AR.md
- .agents/skills/vibe-security/SKILL.md

Use current official references when applicable:
- OWASP Top 10:2025 — https://top10.owasp.org/2025/
- OWASP ASVS 5.0.0 — https://asvs.owasp.org/
- OWASP API Security Top 10 — https://owasp.org/www-project-api-security/
- OWASP MASVS — https://mas.owasp.org/MASVS/
- OWASP MASTG — https://mas.owasp.org/MASTG/
- OWASP Cheat Sheet Series — https://cheatsheetseries.owasp.org/

## Audit workflow

1. Define the scope and trust boundaries: browser, Flutter app, API, server, Supabase, storage, CI/CD, and external providers.
2. Identify assets and attacker classes: unauthenticated user, ordinary user, organization administrator, platform administrator, compromised client, and user from another organization.
3. Trace each sensitive operation from its public entry point to the final database/storage side effect.
4. Verify server-side authentication, object-level authorization, tenant isolation, and least privilege. Treat service-role clients as RLS bypasses.
5. Check input validation, output encoding, injection, CSRF, SSRF, path traversal, mass assignment, replay, abuse limits, and safe failure behavior.
6. Review cryptography, session lifecycle, secure storage, upload/download URLs, export handling, logging, environment configuration, dependencies, and workflow permissions.
7. For Flutter, assess secure storage, local PIN throttling, deep links, Android/iOS configuration, cleartext networking, permissions, backups, and release signing. Never treat local app lock as server authorization.
8. Add regression tests for allowed and denied paths. Include cross-organization tests for records and attachments.
9. Run applicable format/lint, type analysis, unit/integration tests, database tests, and production/platform builds. Inspect Actions on the exact final commit in each affected branch.
10. Review the complete diff for truncated files, one-line/minified replacements, disabled features, weakened tests, secrets, and unrelated changes.

## Findings format

Report findings in descending severity: Critical, High, Medium, Low, Informational.

For each finding include:
- Exact file, function/route, and line range.
- Applicable OWASP category or ASVS requirement identifier where one is actually mapped.
- Preconditions and concrete attack path.
- Security impact and affected tenant/data.
- Minimal complete remediation.
- Regression test proving the attack is blocked.
- Verification state: passed, failed, not run, or not applicable.

Do not invent ASVS requirement IDs. Do not claim an ASVS verification level, OWASP compliance, certification, or completed penetration test without the corresponding evidence.

## Project-specific focus

- Every service-role database operation must perform explicit server-side authorization for the acting user, active organization membership, role, and target object.
- Test BOLA/IDOR by changing telegram, attachment, organization, and user identifiers across tenants.
- Ensure signed storage URLs are short-lived, HTTPS-only in production, scoped to one object/action, and not reusable across tenants.
- Verify actual uploaded file signatures and size limits before recording attachment metadata.
- Verify logout/password-change revocation against old session tokens.
- Review destructive operations, organization lifecycle changes, account role changes, exports, and platform-owner-only procedures.
- Apply shared security behavior to both main and flutter-mobile-app, using each branch's native implementation and independent verification.

A review is not complete while required Actions are pending, cancelled, skipped unexpectedly, or failing. State what was not tested and preserve residual risks explicitly.
