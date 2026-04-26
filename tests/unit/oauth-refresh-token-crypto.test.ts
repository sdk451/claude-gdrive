import { describe, expect, it } from "vitest";

import {
  aesKeyFromSessionSecretHex,
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
} from "../../src/oauth/refresh-token-crypto.js";

const SESSION_HEX = "0".repeat(64);

describe("refresh-token-crypto (NF-03)", () => {
  it("rejects non-32-byte hex keys", () => {
    expect(() => aesKeyFromSessionSecretHex("abcd")).toThrow(TypeError);
  });

  it("round-trips a Google refresh string with AES-256-GCM", () => {
    const key = aesKeyFromSessionSecretHex(SESSION_HEX);
    const plain = "1//0eXaMpLeGoOgLeReFrEsHtOkEn";
    const blob = encryptGoogleRefreshToken(plain, key);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(decryptGoogleRefreshToken(blob, key)).toBe(plain);
  });

  it("fails decrypt on tampered ciphertext", () => {
    const key = aesKeyFromSessionSecretHex(SESSION_HEX);
    const blob = encryptGoogleRefreshToken("secret-refresh", key);
    const raw = Buffer.from(blob.slice(3), "base64url");
    const last = raw.length - 1;
    raw[last] = (raw[last] ?? 0) ^ 0xff;
    const tampered = `v1.${raw.toString("base64url")}`;
    expect(() => decryptGoogleRefreshToken(tampered, key)).toThrow();
  });
});
