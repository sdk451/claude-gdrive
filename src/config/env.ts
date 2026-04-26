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
  /**
   * Issuer origin for `/.well-known/oauth-authorization-server` (RFC 8414).
   * From `PUBLIC_ISSUER_URL` or `http://127.0.0.1:${PORT}` when unset.
   */
  readonly publicIssuerOrigin: string;
};

export type ParseBootEnvResult =
  | { readonly ok: true; readonly value: BootEnv }
  | { readonly ok: false; readonly message: string };

function trimOrEmpty(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function resolvePublicIssuerOrigin(
  env: NodeJS.ProcessEnv,
): { ok: true; value: string } | { ok: false } {
  const explicit = trimOrEmpty(env.PUBLIC_ISSUER_URL);
  const port = trimOrEmpty(env.PORT) || "3000";
  const raw = explicit || `http://127.0.0.1:${port}`;
  try {
    const u = new URL(raw);
    const normalized = u.href.replace(/\/+$/, "");
    return { ok: true, value: normalized };
  } catch {
    return { ok: false };
  }
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

  const issuer = resolvePublicIssuerOrigin(env);
  if (!issuer.ok) {
    return {
      ok: false,
      message: `PUBLIC_ISSUER_URL (or derived fallback from PORT) must be a valid URL. See ${ENV_EXAMPLE_FILE}.`,
    };
  }

  return {
    ok: true,
    value: {
      googleClientId,
      googleClientSecret,
      sessionSecretHex: sessionRaw.toLowerCase(),
      publicIssuerOrigin: issuer.value,
    },
  };
}
