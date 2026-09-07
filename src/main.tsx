import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { AuthProvider } from "./modules/auth/AuthProvider";
import { TenantProvider } from "./modules/tenant/TenantProvider";
import { installDeploymentRecovery } from "./app/deploymentRecovery.mjs";
import { I18nProvider } from "./shared/i18n/I18nProvider";
import "./styles.css";
import "./shared/ui/ui-system.css";

installDeploymentRecovery();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Push remains optional; the in-app reminder drawer is the fallback.
    });
  });
}
