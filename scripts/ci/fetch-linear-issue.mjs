#!/usr/bin/env node
/**
 * Fetch Linear issue metadata (URL + description) for a story identifier (e.g. TOK-9)
 * and write reports/linear-issue.json for downstream acceptance-criteria extraction.
 *
 * This is optional in CI. If LINEAR_API_KEY is missing, exit 0 and do nothing.
 *
 * Env:
 *   STORY_ID (e.g. TOK-9)
 *   LINEAR_API_KEY (secret)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storyId = (process.env.STORY_ID || "").trim();
const apiKey = (process.env.LINEAR_API_KEY || "").trim();

if (!apiKey) {
  process.stdout.write("fetch-linear-issue: LINEAR_API_KEY not set; skipping\n");
  process.exit(0);
}
if (!storyId) {
  process.stdout.write("fetch-linear-issue: STORY_ID not set; skipping\n");
  process.exit(0);
}

const endpoint = "https://api.linear.app/graphql";

// Linear GraphQL: issue(identifier: String!)
const query = `
  query IssueByIdentifier($identifier: String!) {
    issue(identifier: $identifier) {
      identifier
      url
      description
    }
  }
`;

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: apiKey,
  },
  body: JSON.stringify({
    query,
    variables: { identifier: storyId },
  }),
});

if (!res.ok) {
  process.stderr.write(
    `fetch-linear-issue: HTTP ${res.status} ${res.statusText}; skipping\n`,
  );
  process.exit(0);
}

const json = await res.json();
if (json?.errors?.length) {
  process.stderr.write("fetch-linear-issue: GraphQL errors; skipping\n");
  process.exit(0);
}

const issue = json?.data?.issue;
if (!issue || !issue.url) {
  process.stderr.write("fetch-linear-issue: issue not found; skipping\n");
  process.exit(0);
}

const reportsDir = join(process.cwd(), "reports");
if (!existsSync(reportsDir)) {
  mkdirSync(reportsDir, { recursive: true });
}

const outPath = join(reportsDir, "linear-issue.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      schema: "gdrive.linearIssue.v1",
      fetchedAt: new Date().toISOString(),
      identifier: issue.identifier,
      url: issue.url,
      description: issue.description || "",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

process.stdout.write(`fetch-linear-issue: wrote ${outPath}\n`);

