# CI security tooling and data privacy

This repository runs security tools in GitHub-hosted runners. The workflows are configured to avoid sending repository source code, telegram content, user data, or repository secrets to scanning vendors.

## Privacy controls applied

- **Semgrep CLI:** runs with `--metrics off` and `SEMGREP_SEND_METRICS=off`. The scanner downloads public rules from the Semgrep Registry, but does not log in to Semgrep AppSec Platform or upload scan findings there. Findings are uploaded only to this repository's GitHub Code Scanning.
- **OSV-Scanner:** downloads the public vulnerability database, then scans with `--offline`. The offline scan does not send package or project information to OSV.dev or deps.dev. The database download itself is an outbound request for public advisory data.
- **Trivy:** telemetry and version checks are disabled, and `TRIVY_OFFLINE_SCAN=true` prevents remote package metadata lookups. Trivy still downloads its public vulnerability database. SARIF results are uploaded to GitHub Security.
- **OpenSSF Scorecard:** `publish_results: false`; the workflow does not publish repository results to the public Scorecard API. SARIF results remain within GitHub Code Scanning.
- **Playwright:** the browser smoke test blocks every request except the local Vite preview at `127.0.0.1:4173`. Browser downloads come from the official Playwright distribution infrastructure.
- **zizmor and actionlint:** inspect workflow files locally in the runner. They do not upload repository files to a vendor service.
- **SonarQube Cloud:** removed from automated workflows because cloud analysis sends source code and analysis data to SonarQube Cloud.

## Remaining external network traffic

GitHub-hosted runners must download tools, language packages, browser binaries, and public vulnerability databases from their official distribution endpoints. GitHub also receives workflow logs, artifacts, and SARIF reports as part of Actions and Code Scanning. Package managers may contact their configured registries to install locked project dependencies.

These downloads are not the same as uploading the repository source to a scanning SaaS, but they do disclose ordinary network metadata such as IP address and requested package or database URLs to the relevant hosting providers.

## Scope and limitations

This configuration reduces outbound disclosure by the added scanners. It is not a mathematical guarantee against a compromised upstream release, compromised GitHub runner, malicious dependency install script, or a vulnerability in an action. Third-party Actions remain pinned to immutable commit SHAs wherever introduced by this tooling.

For environments requiring zero outbound connections from the build runner, use a controlled self-hosted runner with preloaded and verified tool binaries, cached advisory databases, and internal package mirrors. GitHub-hosted runners cannot provide a zero-network guarantee.


## OSV-Scanner exception: SheetJS CDN release

The project pins `xlsx@0.20.2` from the official `cdn.sheetjs.com` tarball, with the package integrity recorded in `pnpm-lock.yaml`. The GitHub-reviewed advisories describe the prototype-pollution issue as affecting versions before 0.19.3 and the ReDoS issue as affecting versions before 0.20.2. OSV currently reports the CDN-pinned 0.20.2 package against npm advisory metadata without applying those fixed-version boundaries (see [OSV-Scanner issue #3073](https://github.com/google/osv-scanner/issues/3073)).

The root `osv-scanner.toml` therefore contains a narrowly scoped `PackageOverrides` entry for **only** `xlsx@0.20.2` in the npm ecosystem. It expires on **2026-12-16** and must be reviewed before expiry. Do not widen the exception to other versions or packages. Remove it when OSV correctly recognizes the CDN release or if the pinned SheetJS artifact changes. This is a scanner false-positive exception, not a claim that all versions of SheetJS are safe.
