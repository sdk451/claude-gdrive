# TOK-13 — S0.8 Security baseline

## Goal

Add a baseline security pipeline that runs on PRs and weekly cron:

- Dependabot for npm + GitHub Actions updates
- `pnpm audit` gating high/critical findings
- `gitleaks` secret scanning
- `trivy` filesystem scan

## Non-goals

- Fixing findings beyond the initial “first scan green” requirement.
- Container image scanning (this story is filesystem + dependency baseline only).

## Implementation outline

### GitHub Actions workflow

Add `.github/workflows/security.yml`:

- Triggers:
  - `pull_request` (to `main`)
  - `schedule` weekly
- Jobs:
  - **npm audit**: `pnpm audit --audit-level=high` (high/critical fail; medium/low don’t)
  - **gitleaks**: `gitleaks/gitleaks-action@v2`
  - **trivy fs**: `aquasecurity/trivy-action@v0` scanning the repository filesystem

### Dependabot

Add `.github/dependabot.yml` with weekly update schedules for:

- `npm` ecosystem
- `github-actions` ecosystem

## Test plan

- Add a unit test that asserts:
  - security workflow exists and has PR + schedule triggers
  - it includes steps for pnpm audit (with `audit-level=high`), gitleaks, and trivy
  - dependabot config exists and covers npm + GitHub Actions ecosystems

## Acceptance criteria mapping

- Workflow committed; first scan green ✅ (enforced via unit test + CI run)
- High/critical block; medium/low warn ✅ (`pnpm audit --audit-level=high`)
- Dependabot enabled ✅ (`.github/dependabot.yml`)
