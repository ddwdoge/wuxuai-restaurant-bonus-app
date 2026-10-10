const ACCESS_HEADER = "cf-access-jwt-assertion";
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

const jwksCache = new Map();

function lockedResponse(status = 403, extraHeaders = undefined) {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });

  for (const [name, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(name, value);
  }

  return new Response(null, { status, headers });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function parseJwt(token) {
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error("invalid JWT shape");
  }

  return {
    header: parseJsonSegment(segments[0]),
    payload: parseJsonSegment(segments[1]),
    signedData: new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
    signature: decodeBase64Url(segments[2]),
  };
}

function configuredIssuer(env) {
  const issuer = env.WUXUAI_ACCESS_ISSUER;
  if (typeof issuer !== "string" || !issuer) {
    throw new Error("missing issuer");
  }

  const url = new URL(issuer);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".cloudflareaccess.com") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    issuer !== url.origin
  ) {
    throw new Error("invalid issuer");
  }

  return issuer;
}

function configuredAudience(env) {
  const audience = env.WUXUAI_ACCESS_AUD;
  if (typeof audience !== "string" || !audience.trim()) {
    throw new Error("missing audience");
  }
  return audience.trim();
}

function configuredOrigin(env) {
  const origin = env.WUXUAI_APP_ORIGIN;
  if (typeof origin !== "string" || !origin) {
    throw new Error("missing origin");
  }

  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    origin !== url.origin
  ) {
    throw new Error("invalid origin");
  }

  return origin;
}

async function fetchJwks(jwksUrl, fetchImpl, nowMs) {
  const cached = jwksCache.get(jwksUrl);
  if (cached && cached.expiresAt > nowMs) {
    return cached.value;
  }

  const response = await fetchImpl(jwksUrl, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("JWKS unavailable");
  }

  const value = await response.json();
  if (!value || !Array.isArray(value.keys)) {
    throw new Error("invalid JWKS");
  }

  jwksCache.set(jwksUrl, {
    value,
    expiresAt: nowMs + JWKS_CACHE_TTL_MS,
  });
  return value;
}

function audienceMatches(claim, expected) {
  return typeof claim === "string"
    ? claim === expected
    : Array.isArray(claim) && claim.includes(expected);
}

function validateClaims(payload, issuer, audience, nowSeconds) {
  if (payload.iss !== issuer || !audienceMatches(payload.aud, audience)) {
    throw new Error("foreign token");
  }

  if (!Number.isFinite(payload.exp) || nowSeconds >= payload.exp) {
    throw new Error("expired token");
  }

  if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || nowSeconds + CLOCK_SKEW_SECONDS < payload.nbf)) {
    throw new Error("token not active");
  }

  if (payload.iat !== undefined && (!Number.isFinite(payload.iat) || payload.iat > nowSeconds + CLOCK_SKEW_SECONDS)) {
    throw new Error("invalid issue time");
  }
}

async function verifyAccessJwt(token, env, dependencies) {
  const issuer = configuredIssuer(env);
  const audience = configuredAudience(env);
  const parsed = parseJwt(token);

  if (parsed.header.alg !== "RS256" || typeof parsed.header.kid !== "string" || !parsed.header.kid) {
    throw new Error("unsupported JWT header");
  }

  const nowMs = dependencies.now();
  validateClaims(parsed.payload, issuer, audience, Math.floor(nowMs / 1000));

  const jwksUrl = `${issuer}/cdn-cgi/access/certs`;
  const jwks = dependencies.getJwks
    ? await dependencies.getJwks(jwksUrl)
    : await fetchJwks(jwksUrl, dependencies.fetchImpl, nowMs);
  const jwk = jwks?.keys?.find((candidate) => candidate.kid === parsed.header.kid);

  if (!jwk || jwk.kty !== "RSA" || (jwk.alg && jwk.alg !== "RS256") || (jwk.use && jwk.use !== "sig")) {
    throw new Error("unknown signing key");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    parsed.signature,
    parsed.signedData,
  );

  if (!valid) {
    throw new Error("invalid signature");
  }

  return parsed.payload;
}

function privateAssetResponse(response) {
  const headers = new Headers(response.headers);
  const vary = headers.get("Vary");
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set(
    "Vary",
    [vary, "Cookie", "Cf-Access-Jwt-Assertion"].filter(Boolean).join(", "),
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Referrer-Policy", "no-referrer");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createStagingV2AccessWorker(overrides = {}) {
  const dependencies = {
    fetchImpl: overrides.fetchImpl ?? fetch,
    getJwks: overrides.getJwks,
    now: overrides.now ?? Date.now,
  };

  return {
    async fetch(request, env) {
      try {
        if (new URL(request.url).origin !== configuredOrigin(env)) {
          return lockedResponse();
        }

        const token = request.headers.get(ACCESS_HEADER);
        if (!token) {
          return lockedResponse();
        }

        await verifyAccessJwt(token, env, dependencies);

        if (!ALLOWED_METHODS.has(request.method)) {
          return lockedResponse(405, { Allow: "GET, HEAD" });
        }

        if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
          return lockedResponse(503);
        }

        return privateAssetResponse(await env.ASSETS.fetch(request));
      } catch {
        return lockedResponse();
      }
    },
  };
}

export default createStagingV2AccessWorker();
