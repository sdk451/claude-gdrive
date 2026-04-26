import type { RedactOptions } from "pino";

export function createRedaction(): RedactOptions {
  return {
    censor: "[redacted]",
    remove: false,
    paths: [
      // Common OAuth / session-related fields (top-level)
      "authorization",
      "cookie",
      "access_token",
      "refresh_token",
      "code",
      "id_token",

      // Common nested shapes
      "req.headers.authorization",
      "req.headers.cookie",
      "request.headers.authorization",
      "request.headers.cookie",
      "headers.authorization",
      "headers.cookie",
    ],
  };
}
