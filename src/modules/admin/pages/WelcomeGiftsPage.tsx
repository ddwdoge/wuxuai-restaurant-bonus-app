import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import {
  Coffee,
  Cookie,
  Edit3,
  Eye,
  Gift,
  ImagePlus,
  Power,
  PowerOff,
  RefreshCw,
  Salad,
  Save,
  Soup,
  Sparkles,
  Trash2,
  Utensils,
  Wine,
} from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { supabase } from "../../../shared/lib/supabase";
import {
  loadRewardOffers,
  saveRewardOffer,
  setRewardOfferActive,
  type RewardOffer,
} from "../../rewards/rewardService";
import { useTenant } from "../../tenant/TenantProvider";
import { PremiumOwnerRewardCard } from "../components/PremiumOwnerRewardCard";

type WelcomeGiftMode = "value_limit" | "fixed_product";

type GiftForm = {
  id: string;
  title: string;
  category: string;
  productPrice: string;
  mode: WelcomeGiftMode;
  fixedProductName: string;
  imageUrl: string | null;
  active: boolean;
  birthdayPoolEnabled: boolean;
};

const giftCategoryOptions = ["Kaffee", "Getränk", "Dessert", "Vorspeise", "Menü", "Hauptspeise", "Sushi", "Eigene Überraschung"];
const defaultDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function formatEuro(value: number | null | undefined) {
  if (!value) return "Noch nicht gesetzt";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
}

function parseEuro(value: string) {
  const parsed = Number(value.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function priceInput(value: number | null) {
  return value ? String(value).replace(".", ",") : "";
}

function defaultGiftValue(category: string | null) {
  if (category === "Getränk" || category === "Kaffee") return 4;
  if (category === "Dessert" || category === "Vorspeise") return 6;
  if (category === "Hauptspeise" || category === "Sushi") return 20;
  if (category === "Menü") return 16;
  return 15;
}

function starterRewardKeyForCategory(category: string) {
  if (category === "Kaffee") return "kaffee";
  if (category === "Getränk") return "getränk";
  if (category === "Dessert") return "dessert";
  if (category === "Vorspeise") return "vorspeise";
  if (category === "Hauptspeise") return "hauptspeise";
  if (category === "Sushi") return "sushi";
  if (category === "Menü") return "menü";
  return "eigene-belohnung";
}

function fileExtension(file: File) {
  const fromName = file.name.toLowerCase().split(".").pop();
  if (fromName && ["png", "jpg", "jpeg", "svg"].includes(fromName)) return fromName;
  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function iconForCategory(category: string | null | undefined) {
  if (category === "Kaffee") return Coffee;
  if (category === "Getränk") return Wine;
  if (category === "Dessert") return Cookie;
  if (category === "Vorspeise") return Salad;
  if (category === "Hauptspeise" || category === "Menü") return Utensils;
  if (category === "Sushi") return Soup;
  return Gift;
}

function categoryIcon(category: string | null | undefined, size: number) {
  const Icon = iconForCategory(category);
  return <Icon aria-hidden="true" size={size} />;
}

function formFromGift(gift: RewardOffer): GiftForm {
  const category = gift.category === "Belohnung" || gift.category === "Eigene Belohnung" ? "Eigene Überraschung" : gift.category ?? "Eigene Überraschung";
  return {
    id: gift.id,
    title: gift.title,
    category,
    productPrice: priceInput(gift.product_price ?? defaultGiftValue(gift.category)),
    mode: gift.welcome_gift_mode,
    fixedProductName: gift.fixed_product_name ?? gift.available_products[0] ?? "",
    imageUrl: gift.image_url,
    active: gift.active,
    birthdayPoolEnabled: gift.birthday_pool_enabled,
  };
}

function newGiftForm(): GiftForm {
  return {
    id: "",
    title: "",
    category: "Kaffee",
    productPrice: "4",
    mode: "value_limit",
    fixedProductName: "",
    imageUrl: null,
    active: true,
    birthdayPoolEnabled: false,
  };
}

function giftStatus(gift: RewardOffer) {
  const expired = Boolean(gift.expires_at && new Date(gift.expires_at).getTime() <= Date.now());
  if (expired) return { label: "Abgelaufen", tone: "expired" as const };
  return gift.active ? { label: "Aktiv", tone: "active" as const } : { label: "Inaktiv", tone: "inactive" as const };
}

export function WelcomeGiftsPage() {
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const [gifts, setGifts] = useState<RewardOffer[]>([]);
  const [editing, setEditing] = useState<GiftForm | null>(null);
  const [previewGift, setPreviewGift] = useState<RewardOffer | null>(null);
  const [pendingStatusGift, setPendingStatusGift] = useState<RewardOffer | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    loadRewardOffers(restaurantId)
      .then((offers) => {
        if (!cancelled) setGifts(offers.filter((offer) => offer.source === "reward" && offer.is_starter_reward));
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Willkommensgeschenke konnten nicht geladen werden.", error);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [restaurantId, reloadKey]);

  const reloadGifts = useCallback(() => setReloadKey((current) => current + 1), []);

  function startCreate() {
    setEditing(newGiftForm());
    setPhotoFile(null);
    setStatus(null);
  }

  function startEdit(gift: RewardOffer) {
    setEditing(formFromGift(gift));
    setPhotoFile(null);
    setStatus(null);
  }

  function closeEditor() {
    if (editing?.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(editing.imageUrl);
    setEditing(null);
    setPhotoFile(null);
    setStatus(null);
  }

  async function uploadPhoto(file: File) {
    if (!supabase || !restaurantId) return null;
    const path = `${restaurantId}/starter-rewards/reward-${Date.now()}.${fileExtension(file)}`;
    const { error } = await supabase.storage.from("restaurant-media").upload(path, file, { cacheControl: "3600", upsert: true });
    if (error) throw error;
    return supabase.storage.from("restaurant-media").getPublicUrl(path).data.publicUrl;
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editing) return;
    if (!["image/png", "image/jpeg", "image/jpg", "image/svg+xml"].includes(file.type)) {
      setStatus("Bitte wähle PNG, JPG, JPEG oder SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus("Das Bild darf maximal 5 MB groß sein.");
      return;
    }
    if (editing.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(editing.imageUrl);
    setEditing({ ...editing, imageUrl: URL.createObjectURL(file) });
    setPhotoFile(file);
  }

  function removePhoto() {
    if (!editing) return;
    if (editing.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(editing.imageUrl);
    setEditing({ ...editing, imageUrl: null });
    setPhotoFile(null);
    setStatus("Das Standardbild wird nach dem Speichern verwendet.");
  }

  async function saveGift(event: FormEvent) {
    event.preventDefault();
    if (!editing || !restaurantId || !editing.title.trim()) return;
    const original = gifts.find((gift) => gift.id === editing.id);
    setSaving(true);
    setStatus(null);
    try {
      const uploadedUrl = photoFile ? await uploadPhoto(photoFile) : null;
      const fixedProductName = editing.mode === "fixed_product" ? editing.fixedProductName.trim() : null;
      const valueLimit = Math.max(0, parseEuro(editing.productPrice));
      const category = editing.category.trim() || original?.category || "Eigene Überraschung";
      const saved = await saveRewardOffer({
        id: original?.id,
        source: "reward",
        restaurant_id: restaurantId,
        title: editing.title.trim(),
        description: "Willkommensgeschenk für neue Gäste. Unabhängig von Punkteeinlösungen.",
        reward_type: "reward",
        required_points: 0,
        required_stamps: 0,
        category,
        product_group: category,
        product_price: valueLimit || null,
        welcome_gift_mode: editing.mode,
        fixed_product_name: fixedProductName,
        image_url: uploadedUrl ?? (editing.imageUrl?.startsWith("blob:") ? original?.image_url ?? null : editing.imageUrl),
        active_days: original?.active_days?.length ? original.active_days : defaultDays,
        available_products: fixedProductName ? [fixedProductName] : [category],
        is_starter_reward: true,
        birthday_pool_enabled: editing.birthdayPoolEnabled,
        starter_reward_key: starterRewardKeyForCategory(category),
        starter_reward_order: original?.starter_reward_order ?? gifts.length,
        active: editing.active,
        expires_at: original?.expires_at ?? null,
      });
      setGifts((current) => current.some((gift) => gift.id === saved.id)
        ? current.map((gift) => gift.id === saved.id ? saved : gift)
        : [...current, saved]);
      setEditing(null);
      setPhotoFile(null);
      setStatus(original ? "Willkommensgeschenk aktualisiert." : "Willkommensgeschenk erstellt.");
    } catch (error) {
      console.error("Willkommensgeschenk konnte nicht gespeichert werden.", error);
      setStatus("Willkommensgeschenk konnte gerade nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleGift(gift: RewardOffer) {
    setSaving(true);
    try {
      const updated = await setRewardOfferActive(gift, !gift.active);
      setGifts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setStatus(updated.active ? "Willkommensgeschenk aktiviert." : "Willkommensgeschenk deaktiviert.");
      setPendingStatusGift(null);
    } catch (error) {
      console.error("Willkommensgeschenk-Status konnte nicht geändert werden.", error);
      setStatus("Status konnte gerade nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="premium-owner-management-page">
      <header className="page-header premium-owner-management-header">
        <div><span className="premium-owner-kicker">Begrüßung für neue Gäste</span><h1>Willkommensgeschenke</h1><p>Verwalte den Geschenkpool für zukünftige normale Erstanmeldungen.</p></div>
        <button className="button premium-owner-primary-action" onClick={startCreate} type="button"><Gift size={18} />Willkommensgeschenk erstellen</button>
      </header>

      <section className="premium-owner-info-strip"><span><Sparkles size={20} /></span><p><strong>Ein eigener Geschenkpool.</strong> Aktive Willkommensgeschenke werden einmalig vergeben und kosten keine Punkte.</p></section>

      {loading ? (
        <section aria-busy="true" aria-label="Willkommensgeschenke werden geladen" className="premium-owner-reward-grid">
          {[1, 2, 3].map((item) => <article className="premium-owner-reward-card premium-owner-reward-skeleton" key={item}><span className="premium-skeleton premium-owner-skeleton-media" /><div><span className="premium-skeleton premium-owner-skeleton-line short" /><span className="premium-skeleton premium-owner-skeleton-line" /><span className="premium-skeleton premium-owner-skeleton-line medium" /></div></article>)}
        </section>
      ) : loadError ? (
        <section className="card premium-owner-management-state" role="alert"><span><RefreshCw size={24} /></span><div><h2>Willkommensgeschenke konnten nicht geladen werden</h2><p>Die aktuellen Daten konnten nicht abgerufen werden. Bitte versuche es erneut.</p></div><button className="button" onClick={reloadGifts} type="button">Erneut versuchen</button></section>
      ) : gifts.length === 0 ? (
        <section className="card premium-owner-management-empty"><span><Gift size={30} /></span><h2>Noch kein Willkommensgeschenk</h2><p>Begrüße neue Gäste mit einem besonderen Vorteil.</p><button className="button" onClick={startCreate} type="button">Willkommensgeschenk erstellen</button></section>
      ) : (
        <section className="premium-owner-reward-grid" aria-label="Gespeicherte Willkommensgeschenke">
          {gifts.map((gift) => {
            const currentStatus = giftStatus(gift);
            const PlaceholderIcon = iconForCategory(gift.category);
            const condition = gift.welcome_gift_mode === "fixed_product" && gift.fixed_product_name ? gift.fixed_product_name : `Wert bis ${formatEuro(gift.product_price ?? defaultGiftValue(gift.category))}`;
            return (
              <PremiumOwnerRewardCard
                actions={<><button className="button secondary icon-text-button" onClick={() => setPreviewGift(gift)} type="button"><Eye size={17} />Vorschau</button><button className="button secondary icon-text-button" onClick={() => startEdit(gift)} type="button"><Edit3 size={17} />Bearbeiten</button><button className="button secondary icon-text-button" onClick={() => setPendingStatusGift(gift)} type="button">{gift.active ? <PowerOff size={17} /> : <Power size={17} />}{gift.active ? "Deaktivieren" : "Aktivieren"}</button></>}
                badgeLabel={currentStatus.label}
                badgeTone={currentStatus.tone}
                category={gift.category ?? "Eigene Überraschung"}
                className={`${gift.active ? "" : "inactive"}${editing?.id === gift.id ? " drawer-active" : ""}`}
                description="Einmalig für neue Gäste nach der Anmeldung."
                imageUrl={gift.image_url}
                key={gift.id}
                meta={[{ label: "Bedingung", value: condition }, { label: "Geburtstagspool", value: gift.birthday_pool_enabled ? "Dabei" : "Nicht dabei" }]}
                PlaceholderIcon={PlaceholderIcon}
                title={gift.title}
              />
            );
          })}
        </section>
      )}

      <AppDrawer description="Name, Wert, Foto und Status des Geschenks." footer={editing ? <><button className="button secondary" onClick={closeEditor} type="button">Abbrechen</button><button className="button" disabled={saving || !editing.title.trim()} form="welcome-gift-editor-form" type="submit"><Save size={18} />{editing.id ? "Änderungen speichern" : "Willkommensgeschenk erstellen"}</button></> : null} onClose={closeEditor} open={Boolean(editing)} title={editing?.id ? "Willkommensgeschenk bearbeiten" : "Willkommensgeschenk erstellen"}>
        {editing ? (
          <form className="form premium-owner-editor welcome-gift-drawer-form" id="welcome-gift-editor-form" onSubmit={saveGift}>
            <section className="premium-owner-editor-section">
              <div><p className="premium-owner-kicker">Grundlagen</p><h3>Geschenk beschreiben</h3><p>Diese Angaben sehen Gäste im Kundenportal.</p></div>
              <label className="field" htmlFor="gift-title"><span>Name</span><input className="input" data-drawer-autofocus="true" id="gift-title" required value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
              <div className="grid two">
                <label className="field" htmlFor="gift-category"><span>Kategorie</span><select className="input" id="gift-category" value={editing.category} onChange={(event) => { const category = event.target.value; setEditing({ ...editing, category, productPrice: editing.productPrice || priceInput(defaultGiftValue(category)) }); }}>{giftCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                <label className="field" htmlFor="gift-value"><span>Preisgrenze / Wert bis €</span><input className="input" id="gift-value" inputMode="decimal" value={editing.productPrice} onChange={(event) => setEditing({ ...editing, productPrice: event.target.value })} /></label>
              </div>
            </section>

            <section className="premium-owner-editor-section">
              <div><p className="premium-owner-kicker">Bedingung</p><h3>Wie wird das Geschenk beschrieben?</h3></div>
              <div className="gift-mode-grid">
                <button className={`gift-mode-card${editing.mode === "value_limit" ? " selected" : ""}`} onClick={() => setEditing({ ...editing, mode: "value_limit" })} type="button"><strong>Wertgrenze</strong><span>Gast wählt im Restaurant bis zur Grenze.</span></button>
                <button className={`gift-mode-card${editing.mode === "fixed_product" ? " selected" : ""}`} onClick={() => setEditing({ ...editing, mode: "fixed_product" })} type="button"><strong>Festes Produkt</strong><span>Gast sieht genau dieses Produkt.</span></button>
              </div>
              {editing.mode === "fixed_product" ? <label className="field" htmlFor="fixed-product"><span>Produktname</span><input className="input" id="fixed-product" value={editing.fixedProductName} onChange={(event) => setEditing({ ...editing, fixedProductName: event.target.value })} /></label> : null}
            </section>

            <section className="premium-owner-editor-section">
              <div><p className="premium-owner-kicker">Darstellung</p><h3>Bild und Sichtbarkeit</h3></div>
              <div className="reward-photo-row"><div className="reward-standard-image">{editing.imageUrl ? <img alt={editing.title || "Willkommensgeschenk"} src={editing.imageUrl} /> : categoryIcon(editing.category, 44)}</div><div className="premium-owner-photo-actions"><input accept="image/png,image/jpeg,image/jpg,image/svg+xml" className="visually-hidden" id="welcome-gift-photo" onChange={handlePhoto} type="file" /><button className="button secondary" onClick={() => document.getElementById("welcome-gift-photo")?.click()} type="button"><ImagePlus size={18} />Foto auswählen</button>{editing.imageUrl ? <button className="button secondary" onClick={removePhoto} type="button"><Trash2 size={18} />Bild entfernen</button> : null}<p>Du kannst den Standardplatzhalter behalten.</p></div></div>
              <label className="premium-owner-toggle"><input checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} type="checkbox" /><span><strong>Im Kundenportal aktiv</strong><small>Aktive Geschenke gehören zum Pool für neue Gäste.</small></span></label>
              <label className="premium-owner-toggle"><input checked={editing.birthdayPoolEnabled} onChange={(event) => setEditing({ ...editing, birthdayPoolEnabled: event.target.checked })} type="checkbox" /><span><strong>Für Geburtstagsüberraschungen verwenden</strong><small>Nur aktive Geschenke in diesem Pool können zufällig ausgelost werden.</small></span></label>
            </section>
            {status && editing ? <p className="status-message" role="status">{status}</p> : null}
          </form>
        ) : null}
      </AppDrawer>

      <AppDrawer description="So sehen Gäste das Geschenk im Kundenportal." footer={<button className="button" onClick={() => setPreviewGift(null)} type="button">Vorschau schließen</button>} onClose={() => setPreviewGift(null)} open={Boolean(previewGift)} title="Vorschau im Kundenportal">
        {previewGift ? (() => { const Icon = iconForCategory(previewGift.category); return <div className="premium-owner-preview-shell"><article className="premium-customer-reward-preview large welcome"><div>{previewGift.image_url ? <img alt={previewGift.title} src={previewGift.image_url} /> : <Icon aria-hidden="true" size={54} />}</div><section><span>Dein Willkommensgeschenk</span><h3>{previewGift.title}</h3><strong>{previewGift.welcome_gift_mode === "fixed_product" && previewGift.fixed_product_name ? previewGift.fixed_product_name : `bis ${formatEuro(previewGift.product_price)}`}</strong><p>Wird nach der ersten Punktebuchung freigeschaltet.</p></section></article><p className="premium-owner-preview-note"><Eye size={18} />Diese Vorschau vergibt oder verbraucht kein Geschenk.</p></div>; })() : null}
      </AppDrawer>

      <AppDrawer description={pendingStatusGift?.active ? "Neue Kunden erhalten dieses Geschenk danach nicht mehr." : "Es wird danach wieder Teil des Geschenk-Pools."} footer={pendingStatusGift ? <><button className="button secondary" onClick={() => setPendingStatusGift(null)} type="button">Abbrechen</button><button className="button" disabled={saving} onClick={() => toggleGift(pendingStatusGift)} type="button">{pendingStatusGift.active ? "Deaktivieren" : "Aktivieren"}</button></> : null} onClose={() => setPendingStatusGift(null)} open={Boolean(pendingStatusGift)} title={pendingStatusGift?.active ? "Belohnung deaktivieren?" : "Belohnung aktivieren?"}>
        {pendingStatusGift ? <div className="premium-owner-confirmation"><span><Gift size={26} /></span><h3>{pendingStatusGift.title}</h3><p>Bereits zugeteilte und eingelöste Geschenke bleiben unverändert.</p></div> : null}
      </AppDrawer>

      {status && !editing ? <p className="status-message" role="status">{status}</p> : null}
    </div>
  );
}
