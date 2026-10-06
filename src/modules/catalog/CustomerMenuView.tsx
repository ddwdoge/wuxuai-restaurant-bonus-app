import { useEffect, useState } from "react";
import type { CustomerMenuCatalog } from "./menuCatalogService";
import { MenuPageViewer } from "./MenuPageViewer";
import { menuMessage } from "./menuCatalogMessages";
import "./menuCatalog.css";

type Props = { catalog: Extract<CustomerMenuCatalog, { available: true }>; language: string; slug: string; token: string };

export function CustomerMenuView({ catalog, language, slug, token }: Props) {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"text" | "media">(catalog.text_published_at ? "text" : "media");
  useEffect(() => { setSelected(0); setMode(catalog.text_published_at ? "text" : "media"); },
    [catalog.catalog_id, catalog.version, catalog.text_version, catalog.text_published_at, slug, token]);
  const m = (key: Parameters<typeof menuMessage>[1]) => menuMessage(language, key);
  const page = catalog.pages[selected];
  const hasText = catalog.text_published_at !== null && catalog.text !== null;
  const hasMedia = catalog.published_at !== null && catalog.version !== null && catalog.pages.length > 0;
  const activeMode = mode === "text" && hasText ? "text" : hasMedia ? "media" : "text";
  return <article className="customer-menu-pages">
    {hasText && hasMedia ? <div className="menu-media-controls" aria-label={m("displayChoice")} role="group">
      <button aria-pressed={activeMode === "text"} onClick={() => setMode("text")} type="button">{m("overview")}</button>
      <button aria-pressed={activeMode === "media"} onClick={() => setMode("media")} type="button">{m("originalCard")}</button>
    </div> : null}
    {activeMode === "text" && hasText ? <section aria-label={m("overview")}>
      <p>{m("version")} {catalog.text_version} · {m("publishedAt")} {new Date(catalog.text_published_at!).toLocaleString(language)}</p>
      <p className="menu-text-content">{catalog.text}</p>
    </section> : null}
    {activeMode === "media" && hasMedia ? <><p>{m("version")} {catalog.version} · {m("publishedAt")} {new Date(catalog.published_at!).toLocaleString(language)}</p>
    <div className="menu-media-controls">
      <button disabled={selected <= 0} onClick={() => setSelected((value) => value - 1)} type="button">{m("previous")}</button>
      <span aria-live="polite">{m("page")} {selected + 1} / {catalog.pages.length}</span>
      <button disabled={selected >= catalog.pages.length - 1} onClick={() => setSelected((value) => value + 1)} type="button">{m("next")}</button>
    </div>
    {page ? <MenuPageViewer context={{ kind: "customer", slug, token, version: catalog.version! }} language={language} page={page} /> : null}</> : null}
  </article>;
}
