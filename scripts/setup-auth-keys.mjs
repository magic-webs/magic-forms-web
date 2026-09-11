#!/usr/bin/env node
/**
 * Generates the RS256 keypair Magic Forms signs its access tokens with and
 * stores it on the Convex deployment.
 *
 *   node scripts/setup-auth-keys.mjs           # dev, refuse to clobber good keys
 *   node scripts/setup-auth-keys.mjs --prod    # production deployment
 *   node scripts/setup-auth-keys.mjs --force   # rotate (signs everyone out)
 *
 * Each deployment needs its own keypair — dev and prod are separate databases,
 * so a token signed by one is meaningless to the other.
 *
 * The private key never touches the repo or your clipboard — it goes straight
 * from generation into `convex env set`.
 */
import { execFileSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY_ID = "magic-forms-key-1";
const force = process.argv.includes("--force");

// Deployment selectors are passed straight through to the Convex CLI, so the
// same script can target dev, prod or a named preview.
const TARGET_FLAGS = ["--prod", "--preview-name", "--deployment-name", "--url"];
const target = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (!TARGET_FLAGS.includes(arg)) continue;
  target.push(arg);
  if (arg !== "--prod" && process.argv[i + 1]) target.push(process.argv[++i]);
}
const targetLabel = target.includes("--prod") ? "production" : target.length ? target.join(" ") : "dev";

// Run the CLI's entrypoint with this same Node binary: no shell, so the base64
// key is passed as one argv entry and can never be mangled by shell quoting.
function findConvexCli() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "node_modules", "convex", "bin", "main.js");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("Could not find the convex CLI — run your package manager's install first.");
}

const convexCli = findConvexCli();

function convex(args) {
  return execFileSync(process.execPath, [convexCli, ...args, ...target], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function readEnv(name) {
  try {
    return convex(["env", "get", name]);
  } catch {
    return "";
  }
}

// --- don't silently destroy a working deployment
const existing = readEnv("JWT_PRIVATE_KEY");
const looksValid = existing.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(existing);

console.log("Target deployment: " + targetLabel);

if (looksValid && !force) {
  console.log("JWT_PRIVATE_KEY is already set and looks valid — nothing to do.");
  console.log("Re-run with --force to rotate (this signs every user out).");
  process.exit(0);
}
if (existing && !looksValid) {
  console.log("JWT_PRIVATE_KEY is set but is not valid base64 — replacing it.");
}

// --- generate
const { privateKey, publicKey } = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);

const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");

const jwk = await crypto.subtle.exportKey("jwk", publicKey);
delete jwk.key_ops;
delete jwk.ext;
const jwks = JSON.stringify({
  keys: [{ ...jwk, kid: KEY_ID, use: "sig", alg: "RS256" }],
});

// --- store
convex(["env", "set", "JWT_PRIVATE_KEY", pkcs8]);
convex(["env", "set", "JWKS", jwks]);
convex(["env", "set", "JWT_KID", KEY_ID]);

// --- prove it took
const storedKey = readEnv("JWT_PRIVATE_KEY");
const storedJwks = readEnv("JWKS");
if (storedKey !== pkcs8 || storedJwks !== jwks) {
  console.error("Verification failed: the deployment did not store the keys as written.");
  process.exit(1);
}

console.log("Signing keys installed on " + targetLabel + ":");
console.log("  JWT_PRIVATE_KEY  " + pkcs8.length + " base64 chars");
console.log("  JWKS             " + jwks.length + " chars");
console.log("  JWT_KID          " + KEY_ID);
const runSuffix = target.length ? " " + target.join(" ") : "";
console.log(
  "\nNext, create an administrator on this deployment:\n" +
    "  npx convex run auth:createAdmin " +
    "'{\"email\":\"you@example.com\",\"name\":\"You\",\"password\":\"a-strong-password\"}'" +
    runSuffix,
);
