import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SKILL_PATH = path.join(ROOT, "skills", "gdrive-usage.md");

describe("TOK-38 plugin bundle skills (P-03)", () => {
  it("ships skills/gdrive-usage.md with Drive q guidance and official search doc link", () => {
    const body = readFileSync(SKILL_PATH, "utf8");
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/search_files|files\.list/);
    expect(body.toLowerCase()).toContain("mimetype");
    expect(body.toLowerCase()).toContain("name");
    expect(body).toContain("https://developers.google.com/drive/api/guides/search-files");
  });
});
