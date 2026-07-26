import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Coffee,
  Cookie,
  Edit3,
  Eye,
  Gift,
  Power,
  PowerOff,
  RefreshCw,
  Salad,
  Save,
  Soup,
  Sparkles,
  Utensils,
  Wine,
} from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import {
  RewardImageFrame,
} from "../../../shared/components/RewardImageFrame";
import { DEFAULT_REWARD_IMAGE_CROP, rewardImageCropFromRecord, type RewardImageCrop } from "../../../shared/rewardImageCrop";
import {
  isRewardImageCropMigrationRequiredError,
  loadRewardOffers,
  saveRewardOffer,
  setRewardOfferActive,
  setRewardOfferImage,
  type RewardOffer,
} from "../../rewards/rewardService";
import { useTenant } from "../../tenant/TenantProvider";
import { PremiumOwnerRewardCard } from "../components/PremiumOwnerRewardCard";
import { OwnerRewardImageUploader } from "../components/OwnerRewardImageUploader";
import { OwnerRewardImageEditor } from "../components/OwnerRewardImageEditor";
import { removeOwnerRewardImageUpload, uploadOwnerRewardImage } from "../services/ownerRewardImageService";

type WelcomeGiftMode = "value_limit" | "fixed_product";

type GiftForm = {
  id: string;
  title: string;
  category: string;
  productPrice: string;
  mode: WelcomeGiftMode;
  fixedProductName: string;
  imageUrl: string | null;
  imageCrop: RewardImageCrop;
  imageCropEditing: boolean;
  active: boolean;
  birthdayPoolEnabled: boolean;
};

type PendingQuickPhoto = {
  crop: RewardImageCrop;
  file: File | null;
  gift: RewardOffer;
  previewUrl: string;
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
    imageCrop: rewardImageCropFromRecord(gift),
    imageCropEditing: false,
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
    imageCrop: DEFAULT_REWARD_IMAGE_CROP,
    imageCropEditing: false,
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
  const [pendingQuickPhoto, setPendingQuickPhoto] = useState<PendingQuickPhoto | null>(null);
  const [quickPhotoSaving, setQuickPhotoSaving] = useState(false);
  const [quickPhotoError, setQuickPhotoError] = useState<string | null>(null);
  const [quickPhotoUnavailable, setQuickPhotoUnavailable] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
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

  useEffect(() => () => {
    if (editing?.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(editing.imageUrl);
  }, [editing?.imageUrl]);

  useEffect(() => () => {
    if (pendingQuickPhoto?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(pendingQuickPhoto.previewUrl);
  }, [pendingQuickPhoto]);

  const reloadGifts = useCallback(() => setReloadKey((current) => current + 1), []);

  function startCreate() {
    setEditing(newGiftForm());
    setPhotoFile(null);
    setPhotoError(null);
    setStatus(null);
  }

  function startEdit(gift: RewardOffer) {
    setEditing(formFromGift(gift));
    setPhotoFile(null);
    setPhotoError(null);
    setStatus(null);
  }

  function closeEditor() {
    if (editing?.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(editing.imageUrl);
    setEditing(null);
    setPhotoFile(null);
    setPhotoError(null);
    setStatus(null);
  }

  function handlePhoto(file: File) {
    if (!editing) return;
    setEditing({ ...editing, imageUrl: URL.createObjectURL(file), imageCrop: DEFAULT_REWARD_IMAGE_CROP, imageCropEditing: true });
    setPhotoFile(file);
    setPhotoError(null);
    setStatus(null);
  }

  function removePhoto() {
    if (!editing) return;
    if (editing.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(editing.imageUrl);
    setEditing({ ...editing, imageUrl: null, imageCrop: DEFAULT_REWARD_IMAGE_CROP, imageCropEditing: false });
    setPhotoFile(null);
    setPhotoError(null);
    setStatus("Das Standardbild wird nach dem Speichern verwendet.");
  }

  async function saveGift(event: FormEvent) {
    event.preventDefault();
    if (saving || !editing || !restaurantId || !editing.title.trim()) return;
    const original = gifts.find((gift) => gift.id === editing.id);
    setSaving(true);
    setStatus(null);
    setPhotoError(null);
    let uploadedObjectPath: string | null = null;
    try {
      const upload = photoFile ? await uploadOwnerRewardImage({
        restaurantId,
        folder: "starter-rewards",
        entityId: original?.id,
        file: photoFile,
      }) : null;
      uploadedObjectPath = upload?.objectPath ?? null;
      const uploadedUrl = upload?.publicUrl ?? null;
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
        image_zoom: editing.imageCrop.zoom,
        image_position_x: editing.imageCrop.positionX,
        image_position_y: editing.imageCrop.positionY,
        image_aspect_ratio: "16:9",
        image_crop_version: 1,
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
      if (uploadedObjectPath) await removeOwnerRewardImageUpload(uploadedObjectPath);
      console.error("Willkommensgeschenk konnte nicht gespeichert werden.", error);
      if (photoFile) setPhotoError("Das Foto konnte nicht gespeichert werden. Das bisherige Bild bleibt erhalten.");
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

  function selectQuickPhoto(gift: RewardOffer, file: File) {
    setPendingQuickPhoto({ crop: DEFAULT_REWARD_IMAGE_CROP, file, gift, previewUrl: URL.createObjectURL(file) });
    setQuickPhotoError(null);
    setQuickPhotoUnavailable(false);
    setStatus(null);
  }

  function editQuickPhoto(gift: RewardOffer) {
    if (!gift.image_url) return;
    setPendingQuickPhoto({ crop: rewardImageCropFromRecord(gift), file: null, gift, previewUrl: gift.image_url });
    setQuickPhotoError(null);
    setQuickPhotoUnavailable(false);
    setStatus(null);
  }

  function closeQuickPhoto() {
    setPendingQuickPhoto(null);
    setQuickPhotoError(null);
    setQuickPhotoUnavailable(false);
  }

  async function saveQuickPhoto() {
    if (!pendingQuickPhoto || quickPhotoSaving || pendingQuickPhoto.gift.restaurant_id !== restaurantId) return;
    setQuickPhotoSaving(true);
    setQuickPhotoError(null);
    setStatus(null);
    let uploadedObjectPath: string | null = null;
    try {
      let imageUrl = pendingQuickPhoto.gift.image_url;
      if (pendingQuickPhoto.file) {
        const upload = await uploadOwnerRewardImage({
          restaurantId,
          folder: "starter-rewards",
          entityId: pendingQuickPhoto.gift.id,
          file: pendingQuickPhoto.file,
        });
        uploadedObjectPath = upload.objectPath;
        imageUrl = upload.publicUrl;
      }
      const updated = await setRewardOfferImage(pendingQuickPhoto.gift, imageUrl, pendingQuickPhoto.crop);
      setGifts((current) => current.map((gift) => gift.id === updated.id ? updated : gift));
      setPendingQuickPhoto(null);
      setStatus("Foto gespeichert.");
    } catch (error) {
      if (uploadedObjectPath) await removeOwnerRewardImageUpload(uploadedObjectPath);
      console.error("Foto des Willkommensgeschenks konnte nicht gespeichert werden.", error);
      const migrationRequired = isRewardImageCropMigrationRequiredError(error);
      setQuickPhotoUnavailable(migrationRequired);
      setQuickPhotoError(migrationRequired
        ? "Der Bildausschnitt konnte noch nicht gespeichert werden. Bitte versuche es später erneut."
        : "Foto konnte nicht gespeichert werden. Das bisherige Foto bleibt erhalten.");
    } finally {
      setQuickPhotoSaving(false);
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
                imageCrop={rewardImageCropFromRecord(gift)}
                key={gift.id}
                media={(
                  <OwnerRewardImageUploader
                    ariaLabel={gift.image_url ? "Geschenkbild ändern" : "Geschenkbild hinzufügen"}
                    categoryIcon={<PlaceholderIcon aria-hidden="true" size={42} strokeWidth={1.5} />}
                    compact
                    disabled={quickPhotoSaving}
                    crop={rewardImageCropFromRecord(gift)}
                    imageUrl={gift.image_url}
                    label={gift.title}
                    onFileSelected={(file) => selectQuickPhoto(gift, file)}
                    onEdit={() => editQuickPhoto(gift)}
                    showMessage={false}
                  />
                )}
                meta={[{ label: "Bedingung", value: condition }, { label: "Geburtstagspool", value: gift.birthday_pool_enabled ? "Dabei" : "Nicht dabei" }]}
                PlaceholderIcon={PlaceholderIcon}
                title={gift.title}
              />
            );
          })}
        </section>
      )}

      <AppDrawer description="Name, Wert, Foto und Status des Geschenks." dismissOnOverlay={false} footer={editing ? <><button className="button secondary" disabled={saving} onClick={closeEditor} type="button">Abbrechen</button><button className="button" disabled={saving || !editing.title.trim()} form="welcome-gift-editor-form" type="submit"><Save size={18} />{saving && photoFile ? "Foto wird hochgeladen …" : editing.id ? "Änderungen speichern" : "Willkommensgeschenk erstellen"}</button></> : null} onClose={closeEditor} open={Boolean(editing)} size="large" title={editing?.id ? "Willkommensgeschenk bearbeiten" : "Willkommensgeschenk erstellen"}>
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
              <div className="reward-photo-row">
                <OwnerRewardImageUploader
                  categoryIcon={categoryIcon(editing.category, 46)}
                  disabled={saving}
                  error={photoError}
                  crop={editing.imageCrop}
                  imageUrl={gifts.find((gift) => gift.id === editing.id)?.image_url}
                  label={editing.title || "Willkommensgeschenk"}
                  loading={saving && Boolean(photoFile)}
                  onFileSelected={handlePhoto}
                  onEdit={() => setEditing({ ...editing, imageCropEditing: true })}
                  onRemove={removePhoto}
                  previewUrl={editing.imageUrl}
                />
                {editing.imageUrl && editing.imageCropEditing ? (
                  <OwnerRewardImageEditor
                    crop={editing.imageCrop}
                    disabled={saving}
                    imageUrl={editing.imageUrl}
                    label={editing.title || "Willkommensgeschenk"}
                    onCropChange={(imageCrop) => setEditing({ ...editing, imageCrop })}
                    onFileSelected={handlePhoto}
                  />
                ) : null}
              </div>
              <label className="premium-owner-toggle"><input checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} type="checkbox" /><span><strong>Im Kundenportal aktiv</strong><small>Aktive Geschenke gehören zum Pool für neue Gäste.</small></span></label>
              <label className="premium-owner-toggle"><input checked={editing.birthdayPoolEnabled} onChange={(event) => setEditing({ ...editing, birthdayPoolEnabled: event.target.checked })} type="checkbox" /><span><strong>Für Geburtstagsüberraschungen verwenden</strong><small>Nur aktive Geschenke in diesem Pool können zufällig ausgelost werden.</small></span></label>
            </section>
            {status && editing ? <p className="status-message" role="status">{status}</p> : null}
          </form>
        ) : null}
      </AppDrawer>

      <AppDrawer description="So sehen Gäste das Geschenk im Kundenportal." footer={<button className="button" onClick={() => setPreviewGift(null)} type="button">Vorschau schließen</button>} onClose={() => setPreviewGift(null)} open={Boolean(previewGift)} title="Vorschau im Kundenportal">
        {previewGift ? (() => { const Icon = iconForCategory(previewGift.category); return <div className="premium-owner-preview-shell"><article className="premium-customer-reward-preview large welcome"><div>{previewGift.image_url ? <RewardImageFrame alt={previewGift.title} crop={rewardImageCropFromRecord(previewGift)} imageUrl={previewGift.image_url} /> : <Icon aria-hidden="true" size={54} />}</div><section><span>Dein Willkommensgeschenk</span><h3>{previewGift.title}</h3><strong>{previewGift.welcome_gift_mode === "fixed_product" && previewGift.fixed_product_name ? previewGift.fixed_product_name : `bis ${formatEuro(previewGift.product_price)}`}</strong><p>Wird nach der ersten Punktebuchung freigeschaltet.</p></section></article><p className="premium-owner-preview-note"><Eye size={18} />Diese Vorschau vergibt oder verbraucht kein Geschenk.</p></div>; })() : null}
      </AppDrawer>

      <AppDrawer description={pendingStatusGift?.active ? "Neue Kunden erhalten dieses Geschenk danach nicht mehr." : "Es wird danach wieder Teil des Geschenk-Pools."} footer={pendingStatusGift ? <><button className="button secondary" onClick={() => setPendingStatusGift(null)} type="button">Abbrechen</button><button className="button" disabled={saving} onClick={() => toggleGift(pendingStatusGift)} type="button">{pendingStatusGift.active ? "Deaktivieren" : "Aktivieren"}</button></> : null} onClose={() => setPendingStatusGift(null)} open={Boolean(pendingStatusGift)} size="compact" title={pendingStatusGift?.active ? "Belohnung deaktivieren?" : "Belohnung aktivieren?"}>
        {pendingStatusGift ? <div className="premium-owner-confirmation"><span><Gift size={26} /></span><h3>{pendingStatusGift.title}</h3><p>Bereits zugeteilte und eingelöste Geschenke bleiben unverändert.</p></div> : null}
      </AppDrawer>

      <AppDrawer description="Nur Foto und Ausschnitt werden geändert. Wert, Status und Bedingungen bleiben unverändert." dismissOnOverlay={false} footer={pendingQuickPhoto ? <><button className="button secondary" disabled={quickPhotoSaving} onClick={closeQuickPhoto} type="button">Abbrechen</button><button className="button" disabled={quickPhotoSaving || quickPhotoUnavailable} onClick={saveQuickPhoto} type="button">{quickPhotoSaving ? "Foto wird gespeichert …" : "Foto speichern"}</button></> : null} onClose={closeQuickPhoto} open={Boolean(pendingQuickPhoto)} size="compact" title="Bildausschnitt bearbeiten">
        {pendingQuickPhoto ? <div className="premium-owner-quick-photo"><OwnerRewardImageEditor crop={pendingQuickPhoto.crop} disabled={quickPhotoSaving || quickPhotoUnavailable} imageUrl={pendingQuickPhoto.previewUrl} label={pendingQuickPhoto.gift.title} onCropChange={(crop) => setPendingQuickPhoto((current) => current ? { ...current, crop } : current)} onFileSelected={(file) => selectQuickPhoto(pendingQuickPhoto.gift, file)} /><h3>{pendingQuickPhoto.gift.title}</h3><p>Nach dem Speichern erscheint derselbe Ausschnitt in Übersicht und Kundenportal.</p>{quickPhotoError ? <p className="status-message error" role="alert">{quickPhotoError}</p> : null}</div> : null}
      </AppDrawer>

      {status && !editing ? <p className="status-message" role="status">{status}</p> : null}
    </div>
  );
}
