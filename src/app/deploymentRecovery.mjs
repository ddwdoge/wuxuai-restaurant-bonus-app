export const CHUNK_RECOVERY_STORAGE_KEY = "wuxuai_chunk_recovery_attempt";
export const CHUNK_RECOVERY_GUARD_MS = 30_000;

const staleChunkMessages = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "chunkloaderror",
  "error loading dynamically imported module",
];

function errorText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  return [value.name, value.message, value.reason?.name, value.reason?.message]
    .filter((entry) => typeof entry === "string")
    .join(" ");
}

export function isStaleChunkError(value) {
  const message = errorText(value).toLowerCase();
  return staleChunkMessages.some((candidate) => message.includes(candidate));
}

export function readChunkRecoveryAttempt(storage) {
  try {
    const raw = storage?.getItem(CHUNK_RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.attemptedAt !== "number" || typeof parsed?.buildId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createDeploymentRecoveryController({
  buildId,
  now = () => Date.now(),
  reload,
  renderFallback,
  storage,
}) {
  function clearAttempt() {
    try {
      storage?.removeItem(CHUNK_RECOVERY_STORAGE_KEY);
    } catch {
      // Recovery must still work when browser storage is unavailable.
    }
  }

  function markCurrentBuildInitialized() {
    const attempt = readChunkRecoveryAttempt(storage);
    if (attempt && attempt.buildId !== buildId) clearAttempt();
  }

  function recover(reason, { force = false } = {}) {
    if (!force && !isStaleChunkError(reason)) return "ignored";

    const attemptedAt = now();
    const previousAttempt = readChunkRecoveryAttempt(storage);
    const repeatedCurrentBuildFailure = previousAttempt
      && previousAttempt.buildId === buildId
      && attemptedAt - previousAttempt.attemptedAt < CHUNK_RECOVERY_GUARD_MS;

    if (repeatedCurrentBuildFailure) {
      renderFallback(clearAttempt);
      return "fallback";
    }

    try {
      storage?.setItem(CHUNK_RECOVERY_STORAGE_KEY, JSON.stringify({ attemptedAt, buildId }));
    } catch {
      // A reload is still the safest first recovery attempt without storage.
    }

    reload();
    return "reload";
  }

  return { clearAttempt, markCurrentBuildInitialized, recover };
}

export function currentEntryBuildId(documentObject = globalThis.document) {
  const scripts = [...documentObject.querySelectorAll('script[type="module"][src]')];
  const entry = scripts.find((script) => /\/assets\/index-[^/]+\.js(?:$|\?)/.test(script.src)) ?? scripts[0];
  if (!entry?.src) return "unknown-build";

  try {
    return new globalThis.URL(entry.src, documentObject.baseURI).pathname.split("/").pop() ?? "unknown-build";
  } catch {
    return "unknown-build";
  }
}

export function entryBuildIdFromHtml(html, baseUrl) {
  const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)
    ?? html.match(/<script[^>]+src=["']([^"']+)["'][^>]+type=["']module["']/i);
  if (!match?.[1]) return null;

  try {
    return new globalThis.URL(match[1], baseUrl).pathname.split("/").pop() ?? null;
  } catch {
    return null;
  }
}

function renderUpdateFallback(documentObject, reloadCurrentBuild) {
  const root = documentObject.getElementById("root") ?? documentObject.body;
  root.replaceChildren();

  const main = documentObject.createElement("main");
  main.setAttribute("role", "alert");
  main.style.cssText = "min-height:100dvh;box-sizing:border-box;display:grid;place-items:center;padding:24px;background:#f7f2e8;color:#211d18;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

  const panel = documentObject.createElement("section");
  panel.style.cssText = "width:min(100%,520px);box-sizing:border-box;padding:28px;border:1px solid #e6d8bf;border-radius:8px;background:#fff;box-shadow:0 16px 40px rgba(58,43,20,.10);";

  const heading = documentObject.createElement("h1");
  heading.textContent = "Eine neue Version von WUXUAI Bonus ist verfügbar.";
  heading.style.cssText = "margin:0 0 12px;font-size:clamp(1.35rem,5vw,1.8rem);line-height:1.2;";

  const description = documentObject.createElement("p");
  description.textContent = "Die Anwendung konnte nicht vollständig aktualisiert werden.";
  description.style.cssText = "margin:0 0 22px;color:#665d52;line-height:1.55;";

  const button = documentObject.createElement("button");
  button.type = "button";
  button.textContent = "Jetzt aktualisieren";
  button.style.cssText = "min-height:48px;width:100%;border:0;border-radius:7px;padding:0 18px;background:#a8751f;color:#fff;font:inherit;font-weight:800;cursor:pointer;";
  button.addEventListener("click", reloadCurrentBuild, { once: true });

  panel.append(heading, description, button);
  main.append(panel);
  root.append(main);
}

export function installDeploymentRecovery(windowObject = globalThis.window) {
  const { document: documentObject, sessionStorage } = windowObject;
  const buildId = currentEntryBuildId(documentObject);
  documentObject.documentElement.dataset.wuxuaiBuild = buildId;

  const controller = createDeploymentRecoveryController({
    buildId,
    reload: () => windowObject.location.reload(),
    renderFallback: (clearAttempt) => renderUpdateFallback(documentObject, () => {
      clearAttempt();
      windowObject.location.reload();
    }),
    storage: sessionStorage,
  });
  controller.markCurrentBuildInitialized();

  windowObject.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    controller.recover(event.payload ?? event, { force: true });
  });
  windowObject.addEventListener("error", (event) => {
    controller.recover(event.error ?? event.message);
  });
  windowObject.addEventListener("unhandledrejection", (event) => {
    controller.recover(event.reason);
  });

  windowObject.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;

    void windowObject.fetch(new globalThis.URL("/", windowObject.location.origin), {
      cache: "no-store",
      headers: { Accept: "text/html" },
    }).then(async (response) => {
      if (!response.ok) return;
      const currentBuildId = entryBuildIdFromHtml(await response.text(), windowObject.location.origin);
      if (currentBuildId && currentBuildId !== buildId) {
        controller.recover("BFCache deployment changed", { force: true });
      }
    }).catch(() => {
      // Offline and transient network failures are not stale-deployment proof.
    });
  });

  windowObject.setTimeout(() => {
    const attempt = readChunkRecoveryAttempt(sessionStorage);
    if (attempt?.buildId === buildId) controller.clearAttempt();
  }, CHUNK_RECOVERY_GUARD_MS);

  return controller;
}
