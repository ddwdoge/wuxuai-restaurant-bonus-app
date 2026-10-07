import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../../shared/i18n/I18nProvider";
import { useTenant } from "../../tenant/TenantProvider";
import { loadOwnerMenuCatalog, manageOwnerMenuCatalog, removeOwnerMenuDraftPage, uploadMenuPage, type MenuPage, type OwnerMenuCatalog } from "../../catalog/menuCatalogService";
import { MenuPageViewer } from "../../catalog/MenuPageViewer";
import { menuMessage, type MenuMessageKey } from "../../catalog/menuCatalogMessages";
import "../../catalog/menuCatalog.css";

export function RestaurantMenuPage() {
  const { language } = useI18n();
  const m = (key: MenuMessageKey) => menuMessage(language, key);
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id;
  const [catalog, setCatalog] = useState<OwnerMenuCatalog | null>(null);
  const [pages, setPages] = useState<MenuPage[]>([]);
  const [textDraft, setTextDraft] = useState("");
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MenuMessageKey | null>(null);
  const [notice, setNotice] = useState<MenuMessageKey | null>(null);
  const pendingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const next = await loadOwnerMenuCatalog(restaurantId);
      setCatalog(next);
      setPages(next.draft_pages);
      setTextDraft(next.draft_text);
      setSelected((value) => Math.min(value, Math.max(0, next.draft_pages.length - 1)));
      setError(null);
    } catch { setError("ownerError"); }
    finally { setLoading(false); }
  }, [restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function upload(file: File | undefined) {
    if (!file || !restaurantId || !catalog || pendingRef.current) return;
    if (file.size > 10 * 1024 * 1024 || file.size === 0 || !["image/jpeg", "application/pdf"].includes(file.type)) {
      setError("fileInvalid"); return;
    }
    pendingRef.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      await uploadMenuPage(restaurantId, catalog.branch_id, file);
      await refresh();
      setNotice("saved");
    } catch { setError("ownerError"); }
    finally { pendingRef.current = false; setSaving(false); }
  }

  async function act(action: "SAVE_ORDER" | "PUBLISH" | "UNPUBLISH" | "SAVE_TEXT" | "PUBLISH_TEXT" | "UNPUBLISH_TEXT") {
    if (!restaurantId || !catalog || pendingRef.current) return;
    if (action === "PUBLISH" && pages.length === 0) { setError("required"); return; }
    pendingRef.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      let next = catalog;
      if (action === "PUBLISH" && pages.some((page, index) => page.id !== catalog.draft_pages[index]?.id)) {
        next = await manageOwnerMenuCatalog(restaurantId, catalog.branch_id, "SAVE_ORDER", pages.map((page) => page.id), catalog.draft_revision, catalog.published_version);
      }
      next = await manageOwnerMenuCatalog(restaurantId, catalog.branch_id, action,
        action === "SAVE_ORDER" ? pages.map((page) => page.id) : null,
        next.draft_revision, next.published_version,
        action === "SAVE_TEXT" ? textDraft : null, next.text_version);
      setCatalog(next); setPages(next.draft_pages);
      setNotice(action.startsWith("UNPUBLISH") ? "unpublish" : action.startsWith("PUBLISH") ? "published" : "saved");
    } catch (caught) {
      setError(String(caught).includes("MENU_PAGE_CAPACITY_EXCEEDED") ? "capacityExceeded" : "ownerError");
      void refresh();
    }
    finally { pendingRef.current = false; setSaving(false); }
  }

  function move(index: number, step: number) {
    const target = index + step;
    if (target < 0 || target >= pages.length) return;
    setPages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelected(target);
  }

  async function remove(pageId: string) {
    if (!restaurantId || !catalog || pendingRef.current) return;
    pendingRef.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      const next = await removeOwnerMenuDraftPage(restaurantId, catalog.branch_id, pageId, catalog.draft_revision);
      setCatalog(next); setPages(next.draft_pages);
      setSelected((value) => Math.min(value, Math.max(0, next.draft_pages.length - 1)));
      setNotice("saved");
    } catch { setError("ownerError"); void refresh(); }
    finally { pendingRef.current = false; setSaving(false); }
  }

  return <main className="restaurant-menu-editor">
    <h1>{m("title")}</h1>
    {loading ? <p role="status">{m("loading")}</p> : null}
    {error ? <p role="alert">{m(error)}</p> : null}
    {notice ? <p role="status">{m(notice)}</p> : null}
    {catalog && !loading ? <>
      <p>{m("originalCard")}: {catalog.published ? `${m("published")} · ${m("version")} ${catalog.published_version} · ${new Date(catalog.published_at!).toLocaleString(language)}` : m("draft")}</p>
      <p>{m("overview")}: {catalog.text_published ? `${m("published")} · ${m("version")} ${catalog.text_version} · ${new Date(catalog.text_published_at!).toLocaleString(language)}` : m("draft")}</p>
      {!catalog.entitled ? <p role="status">{m("noEntitlement")}</p> : null}
      <p role="status">{m("pageCapacity")}: {catalog.draft_page_count ?? "–"} / {catalog.page_limit}</p>
      {catalog.entitled && catalog.draft_page_count !== null && catalog.draft_page_count > catalog.page_limit
        ? <p role="alert">{m("capacityExceeded")}</p> : null}
      <section aria-label={m("overview")}>
        <label htmlFor="menu-text">{m("textDraft")}</label>
        <textarea id="menu-text" maxLength={20000} rows={10} value={textDraft} onChange={(event) => setTextDraft(event.target.value)} />
        <div className="restaurant-menu-actions">
          <button disabled={saving || textDraft === catalog.draft_text} onClick={() => void act("SAVE_TEXT")} type="button">{m("saveText")}</button>
          <button disabled={saving || !catalog.entitled || !catalog.draft_text.trim() || textDraft !== catalog.draft_text} onClick={() => void act("PUBLISH_TEXT")} type="button">{m("publishText")}</button>
          {catalog.text_published ? <button disabled={saving} onClick={() => void act("UNPUBLISH_TEXT")} type="button">{m("unpublishText")}</button> : null}
        </div>
      </section>
      <section aria-label={m("originalCard")}>
      <label htmlFor="menu-upload">{m("upload")}</label>
      <input accept="image/jpeg,application/pdf" disabled={saving} id="menu-upload" onChange={(event) => {
        void upload(event.target.files?.[0]); event.target.value = "";
      }} type="file" />
      <ol className="menu-page-order">
        {pages.map((page, index) => <li key={page.id}>
          <button aria-current={selected === index ? "true" : undefined} onClick={() => setSelected(index)} type="button">{m("page")} {index + 1}: {page.filename} ({page.page_count ?? "–"})</button>
          <button aria-label={`${m("previous")}: ${page.filename}`} disabled={saving || index === 0} onClick={() => move(index, -1)} type="button">↑</button>
          <button aria-label={`${m("next")}: ${page.filename}`} disabled={saving || index === pages.length - 1} onClick={() => move(index, 1)} type="button">↓</button>
          <button aria-label={`${m("removePage")}: ${page.filename}`} disabled={saving} onClick={() => void remove(page.id)} type="button">{m("removePage")}</button>
        </li>)}
      </ol>
      {pages[selected] && restaurantId ? <section aria-label={m("preview")}>
        <MenuPageViewer context={{ kind: "owner", restaurantId }} language={language} page={pages[selected]} />
      </section> : null}
      <div className="restaurant-menu-actions">
        <button disabled={saving || pages.length === 0} onClick={() => void act("SAVE_ORDER")} type="button">{m("order")}</button>
        <button disabled={saving || !catalog.entitled || pages.length === 0
          || catalog.draft_page_count === null || catalog.draft_page_count > catalog.page_limit}
          onClick={() => void act("PUBLISH")} type="button">{m("publish")}</button>
        {catalog.published ? <button disabled={saving} onClick={() => void act("UNPUBLISH")} type="button">{m("unpublish")}</button> : null}
      </div>
      </section>
    </> : null}
  </main>;
}
