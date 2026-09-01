import { readCustomerScanContext } from "./customerScanContext.mjs";

export function restaurantTargetFromQrValue(rawValue, allowedOrigins) {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;

  let url;
  try {
    url = new globalThis.URL(rawValue.trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const normalizedOrigins = new Set(
    (Array.isArray(allowedOrigins) ? allowedOrigins : [])
      .filter((origin) => typeof origin === "string" && origin.trim())
      .map((origin) => origin.trim().replace(/\/$/, "")),
  );
  if (!normalizedOrigins.has(url.origin)) return null;

  const context = readCustomerScanContext(url.pathname);
  if (!context) return null;

  return {
    restaurantSlug: context.restaurantSlug,
    targetPath: `/w/${encodeURIComponent(context.restaurantSlug)}`,
  };
}
