import { createHash } from "node:crypto";

/** RFC 7636: BASE64URL-ENCODE(SHA256(ASCII(code_verifier))) */
export function pkceS256Challenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}
