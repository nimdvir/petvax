import { createHash, randomBytes } from "node:crypto";

/** Random URL-safe token for a public form link. Only its hash is stored. */
export function newLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashLinkToken(token: string): string {
  return sha256Hex(`petvax-form-link:${token}`);
}

export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(token);
}
