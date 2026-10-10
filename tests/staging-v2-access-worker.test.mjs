import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const { createStagingV2AccessWorker } = await import("../worker/staging-v2-access.mjs");

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const DIST = join(ROOT, "dist");
const ORIGIN = "https://staging-v2.bonus.wuxuaisbi.com";
const ISSUER = "https://wuxuai-test.cloudflareaccess.com";
const AUDIENCE = "staging-v2-test-audience";
const NOW_SECONDS = 1_800_000_000;

let signingKey;
let foreignSigningKey;
let publicJwk;
let builtFiles;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes).toString("base64url");
}

async function signJwt(payload, options = {}) {
  const key = options.key ?? signingKey;
  const header = {
    alg: "RS256",
    kid: options.kid ?? "staging-v2-test-key",
    typ: "JWT",
  };
  const protectedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signedData = new TextEncoder().encode(`${protectedHeader}.${encodedPayload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signedData);
  return `${protectedHeader}.${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function claims(overrides = {}) {
  return {
    iss: ISSUER,
    aud: [AUDIENCE],
    sub: "synthetic-tester",
    email: "tester@example.invalid",
    iat: NOW_SECONDS - 60,
    exp: NOW_SECONDS + 3_600,
    ...overrides,
  };
}

function makeEnvironment(assetCalls) {
  const filesByPath = new Map(
    builtFiles.map((path) => [`/${relative(DIST, path).split("\\").join("/")}`, path]),
  );
  return {
    WUXUAI_APP_ORIGIN: ORIGIN,
    WUXUAI_ACCESS_ISSUER: ISSUER,
    WUXUAI_ACCESS_AUD: AUDIENCE,
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        assetCalls.push({ method: request.method, pathname });
        const file = filesByPath.get(pathname) ?? (
          pathname.startsWith("/assets/") ? undefined : join(DIST, "index.html")
        );
        if (!file) return new Response(null, { status: 404 });
        const bytes = await readFile(file);
        return new Response(request.method === "HEAD" ? null : bytes);
      },
    },
  };
}

function makeWorker() {
  return createStagingV2AccessWorker({
    now: () => NOW_SECONDS * 1_000,
    getJwks: async () => ({ keys: [publicJwk] }),
  });
}

async function request(worker, env, path, token, method = "GET") {
  const headers = token ? { "Cf-Access-Jwt-Assertion": token } : undefined;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers }), env);
}

test.before(async () => {
  builtFiles = await listFiles(DIST);
  assert.ok(builtFiles.some((path) => path.endsWith("index.html")), "run the real app build before this test");
  assert.ok(builtFiles.some((path) => path.includes(`${join("dist", "assets")}`)), "real hashed assets missing");

  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const foreignPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );

  signingKey = pair.privateKey;
  foreignSigningKey = foreignPair.privateKey;
  publicJwk = {
    ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
    alg: "RS256",
    kid: "staging-v2-test-key",
    use: "sig",
  };
});

test("valid Access JWT serves byte-identical real build files, SPA routes and reloads", async () => {
  const worker = makeWorker();
  const assetCalls = [];
  const env = makeEnvironment(assetCalls);
  const token = await signJwt(claims());

  for (const file of builtFiles) {
    const path = `/${relative(DIST, file).split("\\").join("/")}`;
    const response = await request(worker, env, path, token);
    assert.equal(response.status, 200, path);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(file), path);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
    assert.match(response.headers.get("Vary"), /Cf-Access-Jwt-Assertion/);
  }

  const indexBytes = await readFile(join(DIST, "index.html"));
  for (const path of ["/", "/owner/dashboard", "/owner/dashboard", "/"]) {
    const response = await request(worker, env, path, token);
    assert.equal(response.status, 200, path);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), indexBytes, path);
  }

  assert.equal(assetCalls.length, builtFiles.length + 4);
});

test("the Worker denies every real asset before ASSETS when Access is missing or unbound", async () => {
  const worker = makeWorker();
  const assetCalls = [];
  const env = makeEnvironment(assetCalls);

  for (const file of builtFiles) {
    const path = `/${relative(DIST, file).split("\\").join("/")}`;
    assert.equal((await request(worker, env, path, undefined)).status, 403, path);
    assert.equal((await request(worker, { ...env, WUXUAI_ACCESS_AUD: "" }, path, "not-a-jwt")).status, 403, path);
  }

  assert.equal(assetCalls.length, 0);
});

test("expired and foreign authorization fail closed on root, SPA and a real hashed asset", async () => {
  const hashedAsset = builtFiles.find((path) => path.includes(`${join("dist", "assets")}`));
  const assetPath = `/${relative(DIST, hashedAsset).split("\\").join("/")}`;
  const cases = [
    ["expired", await signJwt(claims({ exp: NOW_SECONDS }))],
    ["foreign audience", await signJwt(claims({ aud: ["another-application"] }))],
    ["foreign issuer", await signJwt(claims({ iss: "https://foreign.cloudflareaccess.com" }))],
    ["foreign key", await signJwt(claims(), { key: foreignSigningKey })],
  ];

  for (const [label, token] of cases) {
    const worker = makeWorker();
    const assetCalls = [];
    const env = makeEnvironment(assetCalls);
    for (const path of ["/", "/owner/dashboard", assetPath]) {
      const response = await request(worker, env, path, token);
      assert.equal(response.status, 403, `${label}: ${path}`);
      assert.equal(await response.text(), "");
    }
    assert.equal(assetCalls.length, 0, label);
  }
});

test("authorization precedes methods; only authenticated GET and HEAD can reach ASSETS", async () => {
  const worker = makeWorker();
  const assetCalls = [];
  const env = makeEnvironment(assetCalls);
  const token = await signJwt(claims());

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const validResponse = await request(worker, env, "/owner/dashboard", token, method);
    assert.equal(validResponse.status, 405, method);
    assert.equal(validResponse.headers.get("Allow"), "GET, HEAD");
    assert.equal((await request(worker, env, "/owner/dashboard", undefined, method)).status, 403);
  }

  assert.equal((await request(worker, env, "/assets/not-present.js", token, "HEAD")).status, 404);
  assert.equal(assetCalls.length, 1);
});

test("foreign hosts and a missing ASSETS binding remain closed", async () => {
  const worker = makeWorker();
  const assetCalls = [];
  const env = makeEnvironment(assetCalls);
  const token = await signJwt(claims());

  for (const host of ["preview.example.invalid", "worker.example.workers.dev"]) {
    const response = await worker.fetch(new Request(`https://${host}/`, {
      headers: { "Cf-Access-Jwt-Assertion": token },
    }), env);
    assert.equal(response.status, 403, host);
  }

  const { ASSETS: _assets, ...withoutAssets } = env;
  assert.equal((await request(worker, withoutAssets, "/", token)).status, 503);
  assert.equal(assetCalls.length, 0);
});
