# gdrive-cowork-connector

Self-hosted remote MCP server plus Cowork/Claude plugin for reliable Google Drive access where Anthropic's bundled connector fails.

## Operator guide — server setup & Cowork install

End-to-end path for **operators** who deploy this MCP server and distribute a **Cowork / Claude plugin bundle** (see **P-07** in [`docs/prd.md`](docs/prd.md)). Canonical infrastructure tables, WIF, Redis, and Epic 0 checklists live in **[`docs/environments.md`](docs/environments.md)** — this section ties them to concrete steps.

### 1. Google Cloud OAuth client

1. In a **GCP project**, enable the **Google Drive API** (`APIs & Services → Library`).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Under **Authorized redirect URIs**, add at least **`https://claude.ai/api/mcp/auth_callback`** so **hosted Claude / Cowork** can complete OAuth ([`docs/architecture.md`](docs/architecture.md) OAuth section). If you support **Claude Code**, also register the loopback redirect URIs your MCP client registration flow uses (see [`docs/ux.md`](docs/ux.md) and [`docs/brief.md`](docs/brief.md)).
4. Record **Client ID** and **Client secret** — they map to **`GOOGLE_CLIENT_ID`** and **`GOOGLE_CLIENT_SECRET`** in [`env.example`](env.example). Store real values only in **Secret Manager** or a locked secret store, never in git.

### 2. Secrets, issuer URL, and Cloud Run

- Mirror every **required** variable from [`env.example`](env.example) into **Google Secret Manager** using the **same secret id as env var name**, then reference each secret on the Cloud Run service (see **[`docs/environments.md#secret-manager-staging`](docs/environments.md#secret-manager-staging)**).
- Set **`PUBLIC_ISSUER_URL`** to the **HTTPS origin** clients use to reach this service (e.g. `https://gdrive-mcp-staging-xxxxx.run.app`), **no path** — OAuth discovery (`/.well-known/oauth-authorization-server`) is derived from that issuer.
- **`SESSION_SECRET`**: generate with `openssl rand -hex 32` per environment.
- **Default deployment** is **Cloud Run** in the project/region you chose; follow **[Bootstrapping checklist (Epic 0)](docs/environments.md#bootstrapping-checklist-epic-0)** for Artifact Registry, Memorystore + VPC connector (staging/prod sessions), and Workload Identity Federation for GitHub Actions.

**Build & deploy (summary):** from the repo root, `docker build` using the **`Dockerfile`**, push to Artifact Registry, then `gcloud run deploy` (or rely on CI: when repository secrets `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, and `GCP_ARTIFACT_REGISTRY` are set, **`ci.yml`** builds and can push images — see **CI — Artifact Registry push** below). Map secrets to env vars on the revision.

### 3. Smoke-check the running service

Replace `$ORIGIN` with your public **HTTPS origin** (same value you used for `PUBLIC_ISSUER_URL`):

```bash
curl -fsS "$ORIGIN/healthz"
curl -fsS "$ORIGIN/.well-known/oauth-authorization-server" | head
```

After deploy, **`release.yml`** also exercises **`/__smoke/mcp-tools-list`** against prod when you cut a tag (see **Prod release** below).

### Latency SLO (NF-02 / S5.2)

- **Dashboard:** import **`infra/observability/latency-dashboard.json`** into Cloud Monitoring (steps in **`infra/observability/README.md`**).
- **Staging load gate:** with the service reachable, run `node scripts/synthetic-mcp-latency.mjs` (defaults: 100 RPS for 30 s, `LOAD_TEST_BASE_URL` override). Exit code **1** means client-side **p95 > 3 s** — investigate before promoting.

### 4. Plugin bundle for Cowork (P-05)

The expected **file-only** layout (`.claude-plugin/plugin.json`, **`.mcp.json`**, `skills/`, optional `commands/`) is documented under **Expected plugin bundle layout** in [`docs/architecture.md`](docs/architecture.md).

1. Ensure **`.mcp.json`** points `mcpServers.*.url` at your live **`https://<host>/mcp`** endpoint (Streamable HTTP MCP path).
2. Zip the bundle (repository root is fine once those files are present) and install via **Cowork plugin UI** (ZIP upload) or your internal distribution channel.

### 5. Hand off to end users

Users connect the connector in Cowork / Claude, complete **Google consent** for their own account, and should see Drive tools via **`tools/list`**. If tools are empty, re-check issuer URL, OAuth redirect URIs, and that Anthropic egress can reach your region (see **NF-01** in [`docs/prd.md`](docs/prd.md)).

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
