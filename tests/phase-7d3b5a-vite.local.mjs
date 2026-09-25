import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const mock = fileURLToPath(new URL("./phase-7d3b5a-browser-mocks.local.tsx", import.meta.url));
export default defineConfig({ optimizeDeps: { entries: ["tests/phase-7d3b5a-browser-harness.local.html"] }, plugins: [
  { name: "redemption-queue-local-mocks", enforce: "pre", resolveId(source, importer) {
    if (importer?.endsWith("/StaffRestaurantRouteGate.tsx")
      && (source === "./staffLoginService" || source === "../../shared/i18n/I18nProvider")) return mock;
    if (importer?.endsWith("/SecureRedemptionQueue.tsx")
      && ["../rewards/secureRedemptionService", "../../shared/i18n/I18nProvider",
        "../../shared/components/RewardImageFrame"].includes(source)) return mock;
    return null;
  } }, react(),
] });
