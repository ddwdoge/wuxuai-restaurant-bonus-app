const allowedTokenHashTypes = new Set(["email", "signup"]);

function parameters(locationLike) {
  return {
    hash: new globalThis.URLSearchParams((locationLike?.hash ?? "").replace(/^#/, "")),
    search: new globalThis.URLSearchParams(locationLike?.search ?? ""),
  };
}

export function readEmailConfirmationPayload(locationLike) {
  const { hash, search } = parameters(locationLike);
  const callbackError = search.get("error_code")
    ?? search.get("error")
    ?? hash.get("error_code")
    ?? hash.get("error");

  if (callbackError) {
    return { kind: "invalid", reason: "callback_error" };
  }

  const tokenHash = search.get("token_hash") ?? hash.get("token_hash");
  if (tokenHash) {
    const type = search.get("type") ?? hash.get("type");
    if (!type || !allowedTokenHashTypes.has(type)) {
      return { kind: "invalid", reason: "invalid_type" };
    }
    return { kind: "token_hash", tokenHash, type };
  }

  const code = search.get("code");
  if (code) return { kind: "pkce", code };

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) {
      return { kind: "invalid", reason: "incomplete_session" };
    }
    return { kind: "legacy_session", accessToken, refreshToken };
  }

  return { kind: "invalid", reason: "missing_payload" };
}

export function emailConfirmationPayloadKey(payload) {
  if (payload.kind === "token_hash") return `token_hash:${payload.tokenHash}`;
  if (payload.kind === "pkce") return `pkce:${payload.code}`;
  if (payload.kind === "legacy_session") return `legacy:${payload.accessToken}:${payload.refreshToken}`;
  return `invalid:${payload.reason}`;
}

export function createEmailConfirmationSingleFlight() {
  let activeKey = null;
  let activePromise = null;
  let completedKey = null;
  let completedValue;

  return {
    run(key, operation) {
      if (completedKey === key) return Promise.resolve(completedValue);
      if (activePromise) {
        return activeKey === key
          ? activePromise
          : Promise.reject(new Error("confirmation_in_progress"));
      }

      activeKey = key;
      activePromise = Promise.resolve()
        .then(operation)
        .then((value) => {
          completedKey = key;
          completedValue = value;
          return value;
        })
        .finally(() => {
          activeKey = null;
          activePromise = null;
        });
      return activePromise;
    },
  };
}

