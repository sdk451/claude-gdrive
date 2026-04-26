#!/usr/bin/env bash
# Run MCP Inspector in CLI mode against a live Streamable HTTP MCP endpoint.
# Prerequisites: server listening (e.g. `pnpm dev`), Node 22+, network to URL.
#
# Usage:
#   MCP_INSPECTOR_URL=https://staging.example.com/mcp bash scripts/mcp-inspector-validate.sh
#
# Default URL: http://127.0.0.1:8080/mcp (matches local dev when PORT=8080).
set -euo pipefail

URL="${MCP_INSPECTOR_URL:-http://127.0.0.1:8080/mcp}"

echo "Running @modelcontextprotocol/inspector CLI: tools/list against ${URL}"
exec npx --yes @modelcontextprotocol/inspector@latest "${URL}" \
  --cli --transport http --method tools/list
