# TOK-13 — S0.8 Security baseline — test plan

## Target behaviors

- `security.yml` runs on PRs to `main` and on a weekly schedule.
- Security tooling is present:
  - `pnpm audit` is configured to fail on high/critical only.
  - `gitleaks` runs and fails on detected leaks.
  - `trivy` filesystem scan runs and fails on configured severities.
- Dependabot is enabled for `npm` and `github-actions`.

## Approach

This story is CI/config oriented, so we validate via unit tests that read the workflow/config YAML and assert required patterns.
