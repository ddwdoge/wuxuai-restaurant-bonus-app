import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, useI18n } from "../src/shared/i18n/I18nProvider";
import { BottomNavigation, type CustomerView } from "../src/modules/customer/components/PremiumCustomerUi";
import { menuMessage } from "../src/modules/catalog/menuCatalogMessages";

function Harness() {
  const { language, setLanguage } = useI18n();
  const [activeView, setActiveView] = useState<CustomerView>(() => new URLSearchParams(window.location.search).get("view") === "menu" ? "menu" : "home");
  const [available, setAvailable] = useState(true);
  (window as any).__menuHarness = { setAvailable, setLanguage, setActiveView,
    text: (key: Parameters<typeof menuMessage>[1]) => menuMessage(language, key) };
  return <main style={{ padding: 12, maxWidth: 600, margin: "auto" }}>
    <h1>{menuMessage(language, "title")}</h1>
    {activeView === "menu" && available ? <article data-testid="menu-content">
      <img alt="Synthetische Speisekarte" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
    </article> : null}
    <BottomNavigation activeView={activeView} menuAvailable={available} onChange={setActiveView} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<I18nProvider><Harness /></I18nProvider>);
