export function getPublicAppBaseUrl() {
  const configuredBaseUrl = String(import.meta.env.VITE_APP_BASE_URL ?? "").trim();
  const runtimeBaseUrl = typeof window !== "undefined" ? window.location.origin : "";
  return (configuredBaseUrl || runtimeBaseUrl).replace(/\/+$/, "");
}
