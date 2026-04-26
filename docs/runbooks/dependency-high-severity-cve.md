# Runbook: `dependency_high_severity`

## Trigger

Supply-chain or container scan reports a **new high/critical CVE** in a direct dependency or base image (`docs/observability.md`).

## First checks

1. **Identify the package** — GitHub Dependabot / `pnpm audit` / container scanner output.
2. **Exploitability** — runtime reachable from the MCP HTTP surface vs dev-only path.
3. **Upstream advisory** — patched version available?

## Likely causes

- Routine new CVE disclosure in Node ecosystem or `node:*` base image.

## Mitigation

- Bump dependency or base image; open PR with passing CI.
- If no fix yet, document risk acceptance + compensating controls (WAF, private deploy).

## Rollback

Revert dependency bump if the upgrade breaks the build; prefer forward fix.
