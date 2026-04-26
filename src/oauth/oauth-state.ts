import { createHmac, timingSafeEqual } from "node:crypto";

const STATE_VERSION = 1;

export type OAuthSignedStateV1 = {
  readonly v: typeof STATE_VERSION;
  readonly n: string;
  readonly exp: number;
};

function secretKey(sessionSecretHex: string): Buffer {
  return Buffer.from(sessionSecretHex, "hex");
}

export function signOAuthState(sessionSecretHex: string, payload: OAuthSignedStateV1): string {
  const key = secretKey(sessionSecretHex);
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const mac = createHmac("sha256", key).update(body).digest();
  return `${body.toString("base64url")}.${mac.toString("base64url")}`;
}

export function verifyOAuthState(
  sessionSecretHex: string,
  token: string,
): OAuthSignedStateV1 | null {
  const key = secretKey(sessionSecretHex);
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, macB64] = parts;
  if (!bodyB64 || !macB64) return null;
  let body: Buffer;
  let mac: Buffer;
  try {
    body = Buffer.from(bodyB64, "base64url");
    mac = Buffer.from(macB64, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key).update(body).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== STATE_VERSION || typeof o.n !== "string" || typeof o.exp !== "number") return null;
  if (Date.now() > o.exp) return null;
  return { v: STATE_VERSION, n: o.n, exp: o.exp };
}
