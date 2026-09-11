/**
 * Password hashing, token minting and RS256 JWT signing.
 *
 * Everything here uses Web Crypto, which is only available in actions — never
 * import this from a query or mutation.
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A URL-safe random string, used for session tokens, API keys and secrets. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

const PBKDF2_ITERATIONS = 120_000;

export async function hashPassword(
  password: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const theSalt = salt ?? randomToken(16);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(theSalt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return { hash: toHex(new Uint8Array(bits)), salt: theSalt };
}

/** Constant-time-ish comparison so a bad password can't be timed out. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** SHA-256 hex digest. Session tokens and API keys are stored as this, never raw. */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

/** HMAC-SHA256 hex digest — used to sign webhook payloads. */
export async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

/**
 * Signs a short-lived RS256 access token that Convex itself verifies through the
 * JWKS we publish at `/.well-known/jwks.json`.
 */
export async function signAccessToken(args: {
  privateKeyPkcs8Base64: string;
  keyId: string;
  issuer: string;
  subject: string;
  audience: string;
  expiresInSeconds: number;
  claims?: Record<string, string>;
}): Promise<{ token: string; expiresAt: number }> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(args.privateKeyPkcs8Base64).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiry = issuedAt + args.expiresInSeconds;

  const header = { alg: "RS256", typ: "JWT", kid: args.keyId };
  const payload = {
    ...args.claims,
    iss: args.issuer,
    sub: args.subject,
    aud: args.audience,
    iat: issuedAt,
    nbf: issuedAt,
    exp: expiry,
  };

  const signingInput = `${toBase64Url(encoder.encode(JSON.stringify(header)))}.${toBase64Url(
    encoder.encode(JSON.stringify(payload)),
  )}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signingInput),
  );

  return {
    token: `${signingInput}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAt: expiry * 1000,
  };
}
