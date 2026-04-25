import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      GOOGLE_CLIENT_ID: "vitest.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "vitest-google-oauth-client-secret",
      SESSION_SECRET: "0".repeat(64),
    },
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
    },
  },
});
