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
