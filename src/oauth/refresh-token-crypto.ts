import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_BYTES = 32;
const BLOB_PREFIX = "v1.";

/** 32-byte AES-256 key from the boot `SESSION_SECRET` hex string. */
export function aesKeyFromSessionSecretHex(sessionSecretHex: string): Buffer {
  const key = Buffer.from(sessionSecretHex, "hex");
  if (key.length !== KEY_BYTES) {
    throw new TypeError(
      `session secret must decode to ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex characters)`,
    );
  }
  return key;
}

export function encryptGoogleRefreshToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, ciphertext]);
  return `${BLOB_PREFIX}${combined.toString("base64url")}`;
}

export function decryptGoogleRefreshToken(blob: string, key: Buffer): string {
  if (!blob.startsWith(BLOB_PREFIX)) {
    throw new Error("unsupported encrypted refresh token format");
  }
  const combined = Buffer.from(blob.slice(BLOB_PREFIX.length), "base64url");
  if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("truncated encrypted refresh token");
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}
