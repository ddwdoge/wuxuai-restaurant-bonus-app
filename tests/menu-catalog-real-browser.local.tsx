import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadCustomerMenuCatalog, type CustomerMenuCatalog } from "../src/modules/catalog/menuCatalogService";
import { CustomerMenuView } from "../src/modules/catalog/CustomerMenuView";
import { BottomNavigation, type CustomerView } from "../src/modules/customer/components/PremiumCustomerUi";
import { I18nProvider, useI18n } from "../src/shared/i18n/I18nProvider";
import { menuMessage } from "../src/modules/catalog/menuCatalogMessages";
import "../src/modules/customer/customer-premium.css";

function Harness() {
  const { language } = useI18n();
  const [view, setView] = useState<CustomerView>("home");
  const [catalog, setCatalog] = useState<CustomerMenuCatalog | null>(null);
  const [error, setError] = useState(false);
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug") ?? "";
  const token = params.get("token") ?? "";
  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      void loadCustomerMenuCatalog(slug, token).then((value) => {
        if (cancelled) return;
        setCatalog(value); setError(false); if (!value.available) setView("home");
      }).catch(() => { if (!cancelled) setError(true); });
    };
    reload();
    window.addEventListener("focus", reload);
    return () => { cancelled = true; window.removeEventListener("focus", reload); };
  }, [slug, token]);
  return <main className="premium-customer-app" style={{ margin: "auto", maxWidth: 900, minHeight: "100vh", padding: 12 }}>
    <h1>{menuMessage(language, "title")}</h1>
    {error ? <p role="alert">{menuMessage(language, "error")}</p> : null}
    {view === "menu" && catalog?.available ? <CustomerMenuView catalog={catalog} language={language} slug={slug} token={token} /> : null}
    <BottomNavigation activeView={view} menuAvailable={catalog?.available === true} onChange={setView} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<I18nProvider><Harness /></I18nProvider>);
