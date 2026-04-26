# gdrive-cowork-connector

Self-hosted remote MCP server plus Cowork/Claude plugin for reliable Google Drive access where Anthropic's bundled connector fails.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm lint:md
pnpm test
pnpm dev
```

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` first (see [`env.example`](env.example)). The process exits on boot with a one-line error if any are missing or `SESSION_SECRET` is not 64 hex digits.

See [`AGENTS.md`](AGENTS.md) and [`docs/`](docs/) for architecture, constitution, and workflow.

## Configuration & secrets

- **Local:** copy `env.example` to `.env` and load into your environment (this repo does not bundle `dotenv` in the runtime — see `docs/designs/TOK-6.md`).
- **Staging / prod:** store the same variable names in **Google Secret Manager** and map them into Cloud Run; see [`docs/environments.md`](docs/environments.md#secret-manager-staging).
- **Leak detection:** [`.gitleaks.toml`](.gitleaks.toml) extends the default ruleset with allowlists for the documented template and unit-test placeholders.

## CI — required status checks

Pull requests to `main` run [`.github/workflows/pr-validation.yml`](.github/workflows/pr-validation.yml). The job is named **`validate`**.

In GitHub: **Settings → Branches → Branch protection rules** for `main`, enable **Require status checks to pass before merging** and select:

- **`validate`** (workflow _pr-validation_)

Until this rule is enabled, merges are not gated by CI in the GitHub UI; the workflow still runs on every PR.

## CI — viewing test results (PR + main)

Each **PR** workflow uploads an artifact named like `test-results-pr-<PR#>-<STORY>` containing:

- `STORY_TEST_SUMMARY.md` — human-readable table (PR, branch, resolved story id, each Vitest case, targeted runner log)
- `vitest-unit.json` / `vitest-unit-junit.xml` — machine-readable outputs

Each push to **`main`** runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml): regression job uploads `regression-main-<sha>` (`MAIN_REGRESSION_SUMMARY.md` + logs); the **container** job builds the production `Dockerfile` and, when the GCP repository secrets in the next section are set, pushes `:$GITHUB_SHA` to Artifact Registry.

See [`docs/test-strategy.md`](docs/test-strategy.md) and [`docs/testing-artifacts-and-regression.md`](docs/testing-artifacts-and-regression.md).

## CI — Artifact Registry push (optional)

To satisfy **S0.3** push acceptance in a real GCP project, add these **repository secrets** (Workload Identity Federation — no JSON key in the repo):

| Secret                           | Example / meaning                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full WIF provider resource name (`projects/…/locations/global/workloadIdentityPools/…/providers/…`).                                           |
| `GCP_SERVICE_ACCOUNT`            | Deployer service account email (`…@….iam.gserviceaccount.com`).                                                                                |
| `GCP_ARTIFACT_REGISTRY`          | Image repository **without tag**: `REGION-docker.pkg.dev/PROJECT/gdrive-mcp/IMAGE` (same project as `docs/environments.md` repo `gdrive-mcp`). |

The `ci.yml` **container** job always runs `docker build`; push steps run only when all three secrets are non-empty.

## Prod release (tag) & rollback

When **`main`** has already pushed `GCP_ARTIFACT_REGISTRY:${GITHUB_SHA}` for the commit you are releasing, push a **SemVer tag** (including pre-releases, e.g. `v0.1.0-rc1`). That triggers [`.github/workflows/release.yml`](.github/workflows/release.yml): resolve the image **digest** for `:${GITHUB_SHA}`, deploy to **prod** Cloud Run, then hit `/healthz`, `/.well-known/oauth-authorization-server`, and `/__smoke/mcp-tools-list`.

Optional repository secret **`CLOUD_RUN_SERVICE_PROD`** overrides the default prod service name `gdrive-mcp`. Same WIF + `GCP_*` secrets as `ci.yml`.

**Single-command rollback** (shift 100% traffic to the previous revision after a bad deploy):

```bash
gcloud run services update-traffic gdrive-mcp --region "$GCP_REGION" --project "$GCP_PROJECT_ID" --to-revisions=PREVIOUS_REVISION_NAME=100
```

Replace `PREVIOUS_REVISION_NAME` with the last known-good revision from **Cloud Run → Revisions** (one row above the current broken revision).

## License

UNLICENSED (private).
