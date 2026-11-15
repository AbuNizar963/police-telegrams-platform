# SonarQube Cloud setup

The SonarQube Cloud workflow is included but remains safely skipped until the repository is connected to a SonarQube Cloud project.

## One-time repository setup

1. Sign in to SonarQube Cloud and import this GitHub repository.
2. Set the SonarQube Cloud project key to `AbuNizar963_police-telegrams-platform`, matching `sonar-project.properties`.
3. In GitHub, open **Settings → Secrets and variables → Actions**.
4. Add the repository secret `SONAR_TOKEN` using a token created in SonarQube Cloud.
5. Add the repository variable `SONAR_ORGANIZATION` using the organization key shown by SonarQube Cloud.
6. Run **SonarQube Cloud Analysis** from the Actions tab or push a new commit.

The workflow does not contain credentials. It runs only after both the secret and organization variable exist. Do not put the token in source files, workflow YAML, or commit history.

## Scope

The initial analysis covers the web application source in `client/src`, `server`, and `shared`. Flutter is checked independently by the existing Flutter workflow using `flutter analyze` and `flutter test`.
