import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../src/modules/auth/AuthProvider";
import { TenantProvider } from "../src/modules/tenant/TenantProvider";
import { I18nProvider } from "../src/shared/i18n/I18nProvider";
import { RestaurantMenuPage } from "../src/modules/admin/pages/RestaurantMenuPage";
import "../src/modules/customer/customer-premium.css";

// The production auth provider hydrates only on owner routes. This harness
// mounts the real owner page without unrelated Kassa/onboarding gates.
history.replaceState(null, "", "/admin/menu");

createRoot(document.getElementById("root")!).render(
  <BrowserRouter><AuthProvider><TenantProvider><I18nProvider>
    <RestaurantMenuPage />
  </I18nProvider></TenantProvider></AuthProvider></BrowserRouter>,
);
