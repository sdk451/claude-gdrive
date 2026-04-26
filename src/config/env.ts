/**
 * Boot-time environment validation (S0.4 / TOK-9).
 * `createApp()` stays env-free; `src/index.ts` calls `parseBootEnv()` before bind.
 */

export const ENV_EXAMPLE_FILE = "env.example";

const REQUIRED_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"] as const;

/** 32 random bytes expressed as 64 hex digits (see `openssl rand -hex 32`). */
const SESSION_SECRET_HEX = /^[0-9a-fA-F]{64}$/;

export type BootEnv = {
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  /** Normalized to lowercase hex. */
  readonly sessionSecretHex: string;
};

export type ParseBootEnvResult =
  | { readonly ok: true; readonly value: BootEnv }
  | { readonly ok: false; readonly message: string };

function trimOrEmpty(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Validates secrets required before the HTTP server starts.
 * Returns a single-line `message` on failure (suitable for stderr + `env.example` pointer).
 */
export function parseBootEnv(env: NodeJS.ProcessEnv = process.env): ParseBootEnvResult {
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!trimOrEmpty(env[key])) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    missing.sort();
    return {
      ok: false,
      message: `Required environment variable(s) missing: ${missing.join(", ")}. See ${ENV_EXAMPLE_FILE}.`,
    };
  }

  const googleClientId = trimOrEmpty(env.GOOGLE_CLIENT_ID);
  const googleClientSecret = trimOrEmpty(env.GOOGLE_CLIENT_SECRET);
  const sessionRaw = trimOrEmpty(env.SESSION_SECRET);

  if (!SESSION_SECRET_HEX.test(sessionRaw)) {
    return {
      ok: false,
      message: `SESSION_SECRET must be 64 hexadecimal characters (32 bytes; use openssl rand -hex 32). See ${ENV_EXAMPLE_FILE}.`,
    };
  }

  return {
    ok: true,
    value: {
      googleClientId,
      googleClientSecret,
      sessionSecretHex: sessionRaw.toLowerCase(),
    },
  };
}
