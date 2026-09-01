import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Coffee,
  Cookie,
  Edit3,
  Eye,
  Gift,
  Power,
  PowerOff,
  RefreshCw,
  Salad,
  Sparkles,
  Soup,
  Star,
  Utensils,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";
import {
  RewardImageFrame,
} from "../../../shared/components/RewardImageFrame";
import { DEFAULT_REWARD_IMAGE_CROP, rewardImageCropFromRecord, type RewardImageCrop } from "../../../shared/rewardImageCrop";
import { loadLoyaltySettings } from "../../loyalty/loyaltyService";
import {
  DEFAULT_REDEMPTION_RATE_PERCENT,
  calculateRewardEconomics,
  isAllowedRedemptionRatePercent,
  parseRewardRedemptionRate,
  redemptionRateToPercent,
} from "../../loyalty/redemptionRate.mjs";
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
import { RedemptionRateSelect } from "../components/RedemptionRateSelect";
import { removeOwnerRewardImageUpload, uploadOwnerRewardImage } from "../services/ownerRewardImageService";
import { useOwnerSmartSetupContinuation } from "../useOwnerSmartSetupContinuation";

type WizardStep = 1 | 2 | 3 | 4 | 5;
type RewardCalculationSettings = {
  loyalty_mode: "amount_based" | "stamp_based" | "menu_points";
  amount_per_point: number;
  redemption_return_rate?: number;
  stamps_required: number;
  active: boolean;
};

type PendingQuickPhoto = {
  crop: RewardImageCrop;
  file: File | null;
  offer: RewardOffer;
  previewUrl: string;
};

type RewardTemplate = {
  key: string;
  label: string;
  Icon: LucideIcon;
  category: string;
  defaultTitle: string;
};

const rewardTemplates: RewardTemplate[] = [
  { key: "dessert", label: "Dessert", Icon: Cookie, category: "Dessert", defaultTitle: "Gratis Dessert" },
  { key: "drink", label: "Getränk", Icon: Wine, category: "Getränk", defaultTitle: "Gratis Getränk" },
  { key: "coffee", label: "Kaffee", Icon: Coffee, category: "Kaffee", defaultTitle: "Gratis Kaffee" },
  { key: "appetizer", label: "Vorspeise", Icon: Salad, category: "Vorspeise", defaultTitle: "Gratis Vorspeise" },
  { key: "main", label: "Hauptspeise", Icon: Utensils, category: "Hauptspeise", defaultTitle: "Gratis Hauptspeise" },
  { key: "sushi", label: "Sushi", Icon: Soup, category: "Sushi", defaultTitle: "Gratis Sushi" },
  { key: "menu", label: "Menü", Icon: Utensils, category: "Menü", defaultTitle: "Gratis Menü" },
  { key: "custom", label: "Eigenes Produkt", Icon: Gift, category: "Eigenes Produkt", defaultTitle: "Eigenes Produkt" },
];

const fallbackSettings: RewardCalculationSettings = {
  loyalty_mode: "amount_based",
  amount_per_point: 1,
  redemption_return_rate: 0.03,
  stamps_required: 10,
  active: true,
};

const defaultActiveDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function parseEuro(value: string) {
  const normalized = value.replace(",", ".").replace(/[^0-9.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatPriceInput(value: number | null | undefined) {
  return value ? String(value).replace(".", ",") : "";
}

function extractProductPrice(description: string) {
  const match = description.match(/Produktwert:\s*([0-9]+(?:[,.][0-9]+)?)/);
  return match ? parseEuro(match[1]) : null;
}

function calculateReward(price: number, settings: RewardCalculationSettings, redemptionRatePercent: number | null) {
  const amountPerPoint = Math.max(0.01, Number(settings.amount_per_point) || 1);
  const economics = calculateRewardEconomics({
    productPrice: price,
    redemptionRatePercent,
    pointsPerEuro: 1 / amountPerPoint,
  });
  return { ...economics, quotePercent: redemptionRatePercent };
}

function iconForCategory(category: string | null | undefined) {
  return rewardTemplates.find((template) => template.category === category)?.Icon ?? Gift;
}

function rewardStatus(offer: RewardOffer) {
  const expired = Boolean(offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now());
  if (expired) return { label: "Abgelaufen", tone: "expired" as const };
  return offer.active
    ? { label: "Aktiv", tone: "active" as const }
    : { label: "Inaktiv", tone: "inactive" as const };
}

function formatValidity(expiresAt: string | null) {
  if (!expiresAt) return "Ohne Ablaufdatum";
  return `Bis ${new Intl.DateTimeFormat("de-AT").format(new Date(expiresAt))}`;
}

export function RewardsPage() {
  const smartSetup = useOwnerSmartSetupContinuation();
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const [offers, setOffers] = useState<RewardOffer[]>([]);
  const [settings, setSettings] = useState<RewardCalculationSettings>(fallbackSettings);
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<RewardTemplate | null>(null);
  const [rewardName, setRewardName] = useState("");
  const [rewardCategory, setRewardCategory] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [redemptionRatePercent, setRedemptionRatePercent] = useState<number | null>(DEFAULT_REDEMPTION_RATE_PERCENT);
  const [legacyRedemptionRatePercent, setLegacyRedemptionRatePercent] = useState<number | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCrop, setPhotoCrop] = useState<RewardImageCrop>(DEFAULT_REWARD_IMAGE_CROP);
  const [photoCropEditing, setPhotoCropEditing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<RewardOffer | null>(null);
  const [previewOffer, setPreviewOffer] = useState<RewardOffer | null>(null);
  const [pendingStatusOffer, setPendingStatusOffer] = useState<RewardOffer | null>(null);
  const [pendingQuickPhoto, setPendingQuickPhoto] = useState<PendingQuickPhoto | null>(null);
  const [quickPhotoSaving, setQuickPhotoSaving] = useState(false);
  const [quickPhotoError, setQuickPhotoError] = useState<string | null>(null);
  const [quickPhotoUnavailable, setQuickPhotoUnavailable] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
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

    Promise.all([loadRewardOffers(restaurantId), loadLoyaltySettings(restaurantId)])
      .then(([nextOffers, nextSettings]) => {
        if (cancelled) return;
        setOffers(nextOffers.filter((offer) => offer.source === "reward" && !offer.is_starter_reward));
        setSettings({
          loyalty_mode: nextSettings.loyalty_mode,
          amount_per_point: nextSettings.amount_per_point,
          redemption_return_rate: nextSettings.redemption_return_rate ?? 0.03,
          stamps_required: nextSettings.stamps_required,
          active: nextSettings.active,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Punkteeinlösungen konnten nicht geladen werden.", error);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [restaurantId, reloadKey]);

  useEffect(() => () => {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  useEffect(() => () => {
    if (pendingQuickPhoto?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(pendingQuickPhoto.previewUrl);
  }, [pendingQuickPhoto]);

  const reloadRewards = useCallback(() => setReloadKey((current) => current + 1), []);
  const productPrice = parseEuro(priceInput);
  const calculation = useMemo(
    () => calculateReward(productPrice, settings, redemptionRatePercent),
    [productPrice, redemptionRatePercent, settings],
  );
  const rewardTitle = rewardName.trim() || selectedTemplate?.defaultTitle || "Neue Punkteeinlösung";
  const currentCategory = rewardCategory.trim() || selectedTemplate?.category || "Eigenes Produkt";

  function resetWizard() {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setStep(1);
    setSelectedTemplate(null);
    setRewardName("");
    setRewardCategory("");
    setPriceInput("");
    const settingsPercent = redemptionRateToPercent(settings.redemption_return_rate);
    setRedemptionRatePercent(settingsPercent !== null && isAllowedRedemptionRatePercent(settingsPercent)
      ? settingsPercent
      : null);
    setLegacyRedemptionRatePercent(settingsPercent);
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoCrop(DEFAULT_REWARD_IMAGE_CROP);
    setPhotoCropEditing(false);
    setPhotoError(null);
    setEditingOffer(null);
  }

  function startCreate() {
    resetWizard();
    setStatus(null);
    setEditorOpen(true);
  }

  function editOffer(offer: RewardOffer) {
    const template = rewardTemplates.find((item) => item.category === offer.category) ?? rewardTemplates[rewardTemplates.length - 1];
    setEditingOffer(offer);
    setSelectedTemplate(template);
    setRewardName(offer.title);
    setRewardCategory(offer.category ?? template.category);
    setPriceInput(formatPriceInput(offer.product_price ?? extractProductPrice(offer.description)));
    const savedPercent = parseRewardRedemptionRate(offer.description);
    const settingsPercent = redemptionRateToPercent(settings.redemption_return_rate);
    const effectivePercent = savedPercent ?? settingsPercent;
    setRedemptionRatePercent(effectivePercent !== null && isAllowedRedemptionRatePercent(effectivePercent)
      ? effectivePercent
      : null);
    setLegacyRedemptionRatePercent(effectivePercent);
    setPhotoPreview(offer.image_url);
    setPhotoFile(null);
    setPhotoCrop(rewardImageCropFromRecord(offer));
    setPhotoCropEditing(false);
    setPhotoError(null);
    setStep(2);
    setStatus(null);
    setEditorOpen(true);
  }

  function closeRewardEditor() {
    setEditorOpen(false);
    resetWizard();
    setStatus(null);
  }

  function handlePhoto(file: File) {
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoFile(file);
    setPhotoCrop(DEFAULT_REWARD_IMAGE_CROP);
    setPhotoCropEditing(true);
    setPhotoError(null);
    setStatus(null);
  }

  async function saveReward() {
    if (saving || !restaurantId || !selectedTemplate || productPrice <= 0 || redemptionRatePercent === null) return;
    const wasEditing = Boolean(editingOffer);
    setSaving(true);
    setStatus(null);
    setPhotoError(null);
    let uploadedObjectPath: string | null = null;
    try {
      let imageUrl: string | null = null;
      if (photoFile) {
        const upload = await uploadOwnerRewardImage({
          restaurantId,
          folder: "rewards",
          entityId: editingOffer?.id,
          file: photoFile,
        });
        uploadedObjectPath = upload.objectPath;
        imageUrl = upload.publicUrl;
      }
      const saved = await saveRewardOffer({
        id: editingOffer?.id,
        source: "reward",
        restaurant_id: restaurantId,
        title: rewardTitle,
        description: `Produktwert: ${formatEuro(productPrice)}. Einlösequote: ${calculation.quotePercent} %. Geschätzte Konsumation: ${formatEuro(calculation.estimatedConsumption)}.`,
        reward_type: "reward",
        required_points: calculation.requiredPoints,
        required_stamps: 0,
        category: currentCategory,
        product_group: currentCategory,
        image_url: imageUrl ?? editingOffer?.image_url ?? null,
        image_zoom: photoCrop.zoom,
        image_position_x: photoCrop.positionX,
        image_position_y: photoCrop.positionY,
        image_aspect_ratio: "16:9",
        image_crop_version: 1,
        product_price: productPrice,
        active_days: editingOffer?.active_days?.length ? editingOffer.active_days : defaultActiveDays,
        available_products: [currentCategory],
        is_starter_reward: false,
        active: editingOffer?.active ?? true,
        expires_at: editingOffer?.expires_at ?? null,
      });
      setOffers((current) => current.some((offer) => offer.id === saved.id)
        ? current.map((offer) => offer.id === saved.id ? saved : offer)
        : [...current, saved]);
      setEditorOpen(false);
      resetWizard();
      setStatus(wasEditing ? "Punkteeinlösung aktualisiert." : "Punkteeinlösung erstellt.");
      smartSetup.complete("reward_saved");
    } catch (error) {
      if (uploadedObjectPath) await removeOwnerRewardImageUpload(uploadedObjectPath);
      console.error("Punkteeinlösung konnte nicht gespeichert werden.", error);
      if (photoFile) setPhotoError("Das Foto konnte nicht gespeichert werden. Das bisherige Bild bleibt erhalten.");
      setStatus("Punkteeinlösung konnte gerade nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOffer(offer: RewardOffer) {
    setSaving(true);
    try {
      const updated = await setRewardOfferActive(offer, !offer.active);
      setOffers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setStatus(updated.active ? "Punkteeinlösung aktiviert." : "Punkteeinlösung deaktiviert.");
      setPendingStatusOffer(null);
    } catch (error) {
      console.error("Status der Punkteeinlösung konnte nicht geändert werden.", error);
      setStatus("Status konnte gerade nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  }

  function selectQuickPhoto(offer: RewardOffer, file: File) {
    setPendingQuickPhoto({ crop: DEFAULT_REWARD_IMAGE_CROP, file, offer, previewUrl: URL.createObjectURL(file) });
    setQuickPhotoError(null);
    setQuickPhotoUnavailable(false);
    setStatus(null);
  }

  function editQuickPhoto(offer: RewardOffer) {
    if (!offer.image_url) return;
    setPendingQuickPhoto({ crop: rewardImageCropFromRecord(offer), file: null, offer, previewUrl: offer.image_url });
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
    if (!pendingQuickPhoto || quickPhotoSaving || pendingQuickPhoto.offer.restaurant_id !== restaurantId) return;
    setQuickPhotoSaving(true);
    setQuickPhotoError(null);
    setStatus(null);
    let uploadedObjectPath: string | null = null;
    try {
      let imageUrl = pendingQuickPhoto.offer.image_url;
      if (pendingQuickPhoto.file) {
        const upload = await uploadOwnerRewardImage({
          restaurantId,
          folder: "rewards",
          entityId: pendingQuickPhoto.offer.id,
          file: pendingQuickPhoto.file,
        });
        uploadedObjectPath = upload.objectPath;
        imageUrl = upload.publicUrl;
      }
      const updated = await setRewardOfferImage(pendingQuickPhoto.offer, imageUrl, pendingQuickPhoto.crop);
      setOffers((current) => current.map((offer) => offer.id === updated.id ? updated : offer));
      setPendingQuickPhoto(null);
      setStatus("Foto gespeichert.");
    } catch (error) {
      if (uploadedObjectPath) await removeOwnerRewardImageUpload(uploadedObjectPath);
      console.error("Foto der Punkteeinlösung konnte nicht gespeichert werden.", error);
      const migrationRequired = isRewardImageCropMigrationRequiredError(error);
      setQuickPhotoUnavailable(migrationRequired);
      setQuickPhotoError(migrationRequired
        ? "Der Bildausschnitt konnte noch nicht gespeichert werden. Bitte versuche es später erneut."
        : "Foto konnte nicht gespeichert werden. Das bisherige Foto bleibt erhalten.");
    } finally {
      setQuickPhotoSaving(false);
    }
  }

  const SelectedIcon = selectedTemplate?.Icon ?? Gift;
  const wizardContent = (
    <div className="premium-owner-editor">
      <RequiredFieldsNote />
      <div className="premium-owner-editor-progress">
        <span>Schritt {step} von 5</span>
        <div><span style={{ width: `${step * 20}%` }} /></div>
      </div>
      {step === 1 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Produkt</p><h3>Was soll mit Punkten einlösbar sein?</h3></div>
          <div className="reward-template-grid">
            {rewardTemplates.map((template) => {
              const Icon = template.Icon;
              return (
                <button className={`reward-template-card${selectedTemplate?.key === template.key ? " selected" : ""}`} key={template.key} onClick={() => {
                  setSelectedTemplate(template);
                  setRewardName(template.defaultTitle);
                  setRewardCategory(template.category);
                }} type="button">
                  {selectedTemplate?.key === template.key ? <CheckCircle2 className="reward-template-check" size={20} /> : null}
                  <span className="reward-template-icon"><Icon aria-hidden="true" size={30} /></span>
                  <strong>{template.label}</strong>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {step === 2 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Produktwert</p><h3>Wie viel kostet das Produkt normalerweise?</h3><p>Die benötigten Punkte werden automatisch berechnet.</p></div>
          <div className="field"><FormLabel htmlFor="reward-price" required>Preis in €</FormLabel><input aria-required="true" className="input reward-price-input" data-drawer-autofocus="true" id="reward-price" inputMode="decimal" onChange={(event) => setPriceInput(event.target.value)} placeholder="Beispiel: 5,50 €" required value={priceInput} /></div>
        </section>
      ) : null}
      {step === 3 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Empfehlung</p><h3>Automatisch berechnete Einlösung</h3></div>
          <RedemptionRateSelect
            id="reward-redemption-rate"
            legacyValue={legacyRedemptionRatePercent}
            onChange={(percent) => {
              setRedemptionRatePercent(percent);
              setLegacyRedemptionRatePercent(null);
            }}
            value={redemptionRatePercent}
          />
          <div className="reward-engine-summary">
            <article><span>Benötigte Punkte</span><strong>{calculation.requiredPoints}</strong></article>
            <article><span>Einlösequote</span><strong>{calculation.quotePercent === null ? "Auswählen" : `${calculation.quotePercent} %`}</strong></article>
            <article><span>Konsumation bis Einlösung</span><strong>{formatEuro(calculation.estimatedConsumption)}</strong></article>
            <article className={`reward-profit-status ${calculation.statusClass}`}><span>Einordnung</span><strong>{calculation.status}</strong></article>
          </div>
        </section>
      ) : null}
      {step === 4 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Bild</p><h3>Produktfoto hinzufügen</h3><p>Optional. Ohne Foto erscheint ein ruhiger Standardplatzhalter.</p></div>
          <div className="reward-photo-row">
            <OwnerRewardImageUploader
              categoryIcon={<SelectedIcon aria-hidden="true" size={46} />}
              disabled={saving}
              error={photoError}
              crop={photoCrop}
              imageUrl={editingOffer?.image_url}
              label={rewardTitle}
              loading={saving && Boolean(photoFile)}
              onFileSelected={handlePhoto}
              onEdit={() => setPhotoCropEditing(true)}
              previewUrl={photoPreview}
            />
            {photoPreview && photoCropEditing ? (
              <OwnerRewardImageEditor
                crop={photoCrop}
                disabled={saving}
                imageUrl={photoPreview}
                label={rewardTitle}
                onCropChange={setPhotoCrop}
                onFileSelected={handlePhoto}
              />
            ) : null}
          </div>
        </section>
      ) : null}
      {step === 5 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Vorschau</p><h3>Letzte Angaben prüfen</h3></div>
          <div className="grid two">
            <div className="field"><FormLabel htmlFor="reward-name" required>Name</FormLabel><input aria-required="true" className="input" id="reward-name" onChange={(event) => setRewardName(event.target.value)} required value={rewardName} /></div>
            <div className="field"><FormLabel htmlFor="reward-category" required>Kategorie</FormLabel><input aria-required="true" className="input" id="reward-category" onChange={(event) => setRewardCategory(event.target.value)} required value={rewardCategory} /></div>
          </div>
          <article className="premium-customer-reward-preview large">
            <div>{photoPreview ? <RewardImageFrame alt={rewardTitle} crop={photoCrop} imageUrl={photoPreview} /> : <SelectedIcon aria-hidden="true" size={48} />}</div>
            <section><span>{currentCategory}</span><h4>{rewardTitle}</h4><strong>{calculation.requiredPoints} Punkte</strong><p>Produktwert {formatEuro(productPrice)}</p></section>
          </article>
        </section>
      ) : null}
      {status && editorOpen ? <p className="status-message" role="status">{status}</p> : null}
    </div>
  );

  const wizardActions = (
    <>
      <button className="button secondary" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} type="button"><ChevronLeft size={18} />Zurück</button>
      {step < 5 ? (
        <button className="button" disabled={(step === 1 && !selectedTemplate) || (step === 2 && productPrice <= 0)} onClick={() => setStep((current) => Math.min(5, current + 1) as WizardStep)} type="button">Weiter</button>
      ) : (
        <button className="button" disabled={saving || !rewardName.trim() || redemptionRatePercent === null} onClick={saveReward} type="button"><Sparkles size={18} />{saving && photoFile ? "Foto wird hochgeladen …" : editingOffer ? "Änderungen speichern" : "Punkteeinlösung erstellen"}</button>
      )}
    </>
  );

  return (
    <div className="premium-owner-management-page">
      <header className="page-header premium-owner-management-header">
        <div><span className="premium-owner-kicker">Angebote mit Punkten</span><h1>Punkteeinlösungen</h1><p>Lege Produkte fest, die Gäste mit gesammelten Punkten einlösen können.</p></div>
        <button className="button premium-owner-primary-action" onClick={startCreate} type="button"><Gift size={18} />Neue Punkteeinlösung</button>
      </header>

      {loading ? (
        <section aria-busy="true" aria-label="Punkteeinlösungen werden geladen" className="premium-owner-reward-grid">
          {[1, 2, 3].map((item) => <article className="premium-owner-reward-card premium-owner-reward-skeleton" key={item}><span className="premium-skeleton premium-owner-skeleton-media" /><div><span className="premium-skeleton premium-owner-skeleton-line short" /><span className="premium-skeleton premium-owner-skeleton-line" /><span className="premium-skeleton premium-owner-skeleton-line medium" /></div></article>)}
        </section>
      ) : loadError ? (
        <section className="card premium-owner-management-state" role="alert"><span><RefreshCw size={24} /></span><div><h2>Punkteeinlösungen konnten nicht geladen werden</h2><p>Die aktuellen Daten konnten nicht abgerufen werden. Bitte versuche es erneut.</p></div><button className="button" onClick={reloadRewards} type="button">Erneut versuchen</button></section>
      ) : offers.length === 0 ? (
        <section className="card premium-owner-management-empty"><span><Gift size={30} /></span><h2>Noch keine Punkteeinlösungen</h2><p>Erstelle deine erste Belohnung, die Gäste mit Punkten einlösen können.</p><button className="button" onClick={startCreate} type="button">Erste Punkteeinlösung erstellen</button></section>
      ) : (
        <section className="premium-owner-reward-grid" aria-label="Gespeicherte Punkteeinlösungen">
          {offers.map((offer) => {
            const currentStatus = rewardStatus(offer);
            const PlaceholderIcon = iconForCategory(offer.category);
            return (
              <PremiumOwnerRewardCard
                actions={<><button className="button secondary icon-text-button" onClick={() => setPreviewOffer(offer)} type="button"><Eye size={17} />Vorschau</button><button className="button secondary icon-text-button" onClick={() => editOffer(offer)} type="button"><Edit3 size={17} />Bearbeiten</button><button className="button secondary icon-text-button" onClick={() => setPendingStatusOffer(offer)} type="button">{offer.active ? <PowerOff size={17} /> : <Power size={17} />}{offer.active ? "Deaktivieren" : "Aktivieren"}</button></>}
                badgeLabel={currentStatus.label}
                badgeTone={currentStatus.tone}
                category={offer.category ?? "Eigenes Produkt"}
                className={`${offer.active ? "" : "inactive"}${editingOffer?.id === offer.id ? " drawer-active" : ""}`}
                imageUrl={offer.image_url}
                imageCrop={rewardImageCropFromRecord(offer)}
                key={offer.id}
                media={(
                  <OwnerRewardImageUploader
                    ariaLabel={offer.image_url ? "Rewardbild ändern" : "Rewardbild hinzufügen"}
                    categoryIcon={<PlaceholderIcon aria-hidden="true" size={42} strokeWidth={1.5} />}
                    compact
                    disabled={quickPhotoSaving}
                    crop={rewardImageCropFromRecord(offer)}
                    imageUrl={offer.image_url}
                    label={offer.title}
                    onFileSelected={(file) => selectQuickPhoto(offer, file)}
                    onEdit={() => editQuickPhoto(offer)}
                    showMessage={false}
                  />
                )}
                meta={[{ label: "Benötigte Punkte", value: `${offer.required_points} Punkte` }, { label: "Produktwert", value: offer.product_price ? formatEuro(offer.product_price) : "Nicht hinterlegt" }, { label: "Gültigkeit", value: formatValidity(offer.expires_at) }]}
                PlaceholderIcon={PlaceholderIcon}
                title={offer.title}
              />
            );
          })}
        </section>
      )}

      <AppDrawer description="Produkt, Preis, Foto und automatische Punkteberechnung." dismissOnOverlay={false} footer={editorOpen && !editingOffer ? wizardActions : null} onClose={closeRewardEditor} open={editorOpen && !editingOffer} size="large" title="Neue Punkteeinlösung">{wizardContent}</AppDrawer>

      <AppDrawer description="Produkt, Preis, Foto und automatische Punkteberechnung bearbeiten." dismissOnOverlay={false} footer={editingOffer ? wizardActions : null} onClose={closeRewardEditor} open={editorOpen && Boolean(editingOffer)} size="large" title="Punkteeinlösung bearbeiten">{wizardContent}</AppDrawer>

      <AppDrawer description="So sehen Gäste dieses Angebot im Kundenportal." footer={<button className="button" onClick={() => setPreviewOffer(null)} type="button">Vorschau schließen</button>} onClose={() => setPreviewOffer(null)} open={Boolean(previewOffer)} title="Vorschau im Kundenportal">
        {previewOffer ? (() => { const Icon = iconForCategory(previewOffer.category); return <div className="premium-owner-preview-shell"><article className="premium-customer-reward-preview large"><div>{previewOffer.image_url ? <RewardImageFrame alt={previewOffer.title} crop={rewardImageCropFromRecord(previewOffer)} imageUrl={previewOffer.image_url} /> : <Icon aria-hidden="true" size={54} />}</div><section><span>{previewOffer.category ?? "Eigenes Produkt"}</span><h3>{previewOffer.title}</h3><strong>{previewOffer.required_points} Punkte</strong><p>{previewOffer.active ? "Im Kundenportal sichtbar" : "Derzeit nicht sichtbar"}</p></section></article><p className="premium-owner-preview-note"><Eye size={18} />Diese Vorschau löst keine Punkteeinlösung aus.</p></div>; })() : null}
      </AppDrawer>

      <AppDrawer description={pendingStatusOffer?.active ? "Neue Kunden können sie danach nicht mehr einlösen." : "Sie wird danach im Kundenportal sichtbar."} footer={pendingStatusOffer ? <><button className="button secondary" onClick={() => setPendingStatusOffer(null)} type="button">Abbrechen</button><button className="button" disabled={saving} onClick={() => toggleOffer(pendingStatusOffer)} type="button">{pendingStatusOffer.active ? "Deaktivieren" : "Aktivieren"}</button></> : null} onClose={() => setPendingStatusOffer(null)} open={Boolean(pendingStatusOffer)} size="compact" title={pendingStatusOffer?.active ? "Belohnung deaktivieren?" : "Belohnung aktivieren?"}>
        {pendingStatusOffer ? <div className="premium-owner-confirmation"><span><Star size={26} /></span><h3>{pendingStatusOffer.title}</h3><p>{pendingStatusOffer.active ? "Die Punkteeinlösung bleibt gespeichert und kann später wieder aktiviert werden." : "Gäste sehen die Punkteeinlösung nach der Aktivierung wieder."}</p></div> : null}
      </AppDrawer>

      <AppDrawer description="Nur Foto und Ausschnitt werden geändert. Punkte, Status und Bedingungen bleiben unverändert." dismissOnOverlay={false} footer={pendingQuickPhoto ? <><button className="button secondary" disabled={quickPhotoSaving} onClick={closeQuickPhoto} type="button">Abbrechen</button><button className="button" disabled={quickPhotoSaving || quickPhotoUnavailable} onClick={saveQuickPhoto} type="button">{quickPhotoSaving ? "Foto wird gespeichert …" : "Foto speichern"}</button></> : null} onClose={closeQuickPhoto} open={Boolean(pendingQuickPhoto)} size="compact" title="Bildausschnitt bearbeiten">
        {pendingQuickPhoto ? <div className="premium-owner-quick-photo"><OwnerRewardImageEditor crop={pendingQuickPhoto.crop} disabled={quickPhotoSaving || quickPhotoUnavailable} imageUrl={pendingQuickPhoto.previewUrl} label={pendingQuickPhoto.offer.title} onCropChange={(crop) => setPendingQuickPhoto((current) => current ? { ...current, crop } : current)} onFileSelected={(file) => selectQuickPhoto(pendingQuickPhoto.offer, file)} /><h3>{pendingQuickPhoto.offer.title}</h3><p>Nach dem Speichern erscheint derselbe Ausschnitt in Übersicht und Kundenportal.</p>{quickPhotoError ? <p className="status-message error" role="alert">{quickPhotoError}</p> : null}</div> : null}
      </AppDrawer>

      {status && !editorOpen ? <p className="status-message" role="status">{status}</p> : null}
    </div>
  );
}
