# Security Policy

## Reporting a vulnerability

Please do not report exploitable security issues in public issues or pull requests.

Use GitHub's private vulnerability reporting feature for this repository when available. Include:
- A concise description and impact.
- Steps to reproduce in a non-production environment.
- Affected branch, commit, component, and configuration.
- Any suggested mitigation.

Do not include real user data, production tokens, credentials, private keys, or sensitive records in a report.

## Security expectations for changes

- Enforce authentication and authorization on the server; client-side visibility is not access control.
- Keep secrets in approved secret stores and never commit them to source control.
- Validate uploads and imported data, enforce size/type limits, and scope access by organization.
- Use organization-scoped tests for data access, exports, storage, and destructive operations.
- Avoid logging tokens, credentials, or full personal records.
- Review dependency and GitHub Actions changes for supply-chain risk.
- Do not merge while required security, test, or build checks are failing.
- Treat AI-generated changes as untrusted until the complete diff, threat model, and regression tests have been reviewed.
- Apply the repository's Vibe Security and OWASP engineering controls in [the Secure Engineering Standard](docs/security/SECURE_ENGINEERING_STANDARD.md).

## Security verification

A pending, cancelled, skipped, or inconclusive check is not a pass. Report checks that could not run and residual risks explicitly. This repository's security baseline is an engineering process; it is not an OWASP certification or a guarantee that no vulnerabilities exist.
