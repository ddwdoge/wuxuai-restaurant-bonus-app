import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
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
  Sparkles,
  Soup,
  Star,
  Utensils,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { supabase } from "../../../shared/lib/supabase";
import { loadLoyaltySettings } from "../../loyalty/loyaltyService";
import {
  loadRewardOffers,
  saveRewardOffer,
  setRewardOfferActive,
  type RewardOffer,
} from "../../rewards/rewardService";
import { useTenant } from "../../tenant/TenantProvider";
import { PremiumOwnerRewardCard } from "../components/PremiumOwnerRewardCard";

type WizardStep = 1 | 2 | 3 | 4 | 5;
type RewardCalculationSettings = {
  loyalty_mode: "amount_based" | "stamp_based" | "menu_points";
  amount_per_point: number;
  redemption_return_rate?: number;
  stamps_required: number;
  active: boolean;
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
  redemption_return_rate: 0.05,
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

function rewardFileExtension(file: File) {
  const fromName = file.name.toLowerCase().split(".").pop();
  if (fromName && ["png", "jpg", "jpeg", "svg"].includes(fromName)) return fromName;
  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function calculateReward(price: number, settings: RewardCalculationSettings) {
  const amountPerPoint = Math.max(0.01, Number(settings.amount_per_point) || 1);
  const redemptionReturnRate = Math.max(0.01, Number(settings.redemption_return_rate) || 0.05);
  const targetRevenue = price > 0 ? price / redemptionReturnRate : 0;
  const requiredPoints = Math.max(1, Math.ceil(targetRevenue / amountPerPoint));
  const estimatedRevenue = requiredPoints * amountPerPoint;
  const ratio = price > 0 ? estimatedRevenue / price : 0;
  const quotePercent = Math.round(redemptionReturnRate * 100);

  if (ratio >= 10) return { requiredPoints, estimatedRevenue, quotePercent, status: "Wirtschaftlich", statusClass: "good" };
  if (ratio >= 7) return { requiredPoints, estimatedRevenue, quotePercent, status: "Bitte prüfen", statusClass: "check" };
  return { requiredPoints, estimatedRevenue, quotePercent, status: "Sehr großzügig", statusClass: "risk" };
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
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const [offers, setOffers] = useState<RewardOffer[]>([]);
  const [settings, setSettings] = useState<RewardCalculationSettings>(fallbackSettings);
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<RewardTemplate | null>(null);
  const [rewardName, setRewardName] = useState("");
  const [rewardCategory, setRewardCategory] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [editingOffer, setEditingOffer] = useState<RewardOffer | null>(null);
  const [previewOffer, setPreviewOffer] = useState<RewardOffer | null>(null);
  const [pendingStatusOffer, setPendingStatusOffer] = useState<RewardOffer | null>(null);
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
          redemption_return_rate: nextSettings.redemption_return_rate ?? 0.05,
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

  const reloadRewards = useCallback(() => setReloadKey((current) => current + 1), []);
  const productPrice = parseEuro(priceInput);
  const calculation = useMemo(() => calculateReward(productPrice, settings), [productPrice, settings]);
  const rewardTitle = rewardName.trim() || selectedTemplate?.defaultTitle || "Neue Punkteeinlösung";
  const currentCategory = rewardCategory.trim() || selectedTemplate?.category || "Eigenes Produkt";

  function resetWizard() {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setStep(1);
    setSelectedTemplate(null);
    setRewardName("");
    setRewardCategory("");
    setPriceInput("");
    setPhotoPreview(null);
    setPhotoFile(null);
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
    setPhotoPreview(offer.image_url);
    setPhotoFile(null);
    setStep(2);
    setStatus(null);
    setEditorOpen(true);
  }

  function closeRewardEditor() {
    setEditorOpen(false);
    resetWizard();
    setStatus(null);
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg", "image/svg+xml"].includes(file.type)) {
      setStatus("Bitte wähle PNG, JPG, JPEG oder SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus("Das Bild darf maximal 5 MB groß sein.");
      return;
    }
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoFile(file);
  }

  async function saveReward() {
    if (!restaurantId || !selectedTemplate || productPrice <= 0) return;
    const wasEditing = Boolean(editingOffer);
    setSaving(true);
    setStatus(null);
    try {
      let imageUrl: string | null = null;
      if (photoFile && supabase) {
        const path = `${restaurantId}/rewards/reward-${Date.now()}.${rewardFileExtension(photoFile)}`;
        const { error } = await supabase.storage.from("restaurant-media").upload(path, photoFile, { cacheControl: "3600", upsert: true });
        if (error) throw error;
        imageUrl = supabase.storage.from("restaurant-media").getPublicUrl(path).data.publicUrl;
      }
      const saved = await saveRewardOffer({
        id: editingOffer?.id,
        source: "reward",
        restaurant_id: restaurantId,
        title: rewardTitle,
        description: `Produktwert: ${formatEuro(productPrice)}. Einlösequote: ${calculation.quotePercent} %. Geschätzte Konsumation: ${formatEuro(calculation.estimatedRevenue)}.`,
        reward_type: "reward",
        required_points: calculation.requiredPoints,
        required_stamps: 0,
        category: currentCategory,
        product_group: currentCategory,
        image_url: imageUrl ?? editingOffer?.image_url ?? null,
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
    } catch (error) {
      console.error("Punkteeinlösung konnte nicht gespeichert werden.", error);
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

  const SelectedIcon = selectedTemplate?.Icon ?? Gift;
  const wizardContent = (
    <div className="premium-owner-editor">
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
          <label className="field" htmlFor="reward-price"><span>Preis in €</span><input className="input reward-price-input" data-drawer-autofocus="true" id="reward-price" inputMode="decimal" onChange={(event) => setPriceInput(event.target.value)} placeholder="Beispiel: 5,50 €" value={priceInput} /></label>
        </section>
      ) : null}
      {step === 3 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Empfehlung</p><h3>Automatisch berechnete Einlösung</h3></div>
          <div className="reward-engine-summary">
            <article><span>Benötigte Punkte</span><strong>{calculation.requiredPoints}</strong></article>
            <article><span>Einlösequote</span><strong>{calculation.quotePercent} %</strong></article>
            <article><span>Konsumation bis Einlösung</span><strong>{formatEuro(calculation.estimatedRevenue)}</strong></article>
            <article className={`reward-profit-status ${calculation.statusClass}`}><span>Einordnung</span><strong>{calculation.status}</strong></article>
          </div>
        </section>
      ) : null}
      {step === 4 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Bild</p><h3>Produktfoto hinzufügen</h3><p>Optional. Ohne Foto erscheint ein ruhiger Standardplatzhalter.</p></div>
          <div className="reward-photo-row">
            <div className="reward-standard-image">{photoPreview ? <img alt="Punkteeinlösung" src={photoPreview} /> : <SelectedIcon aria-hidden="true" size={44} />}</div>
            <div><input accept="image/png,image/jpeg,image/jpg,image/svg+xml" className="visually-hidden" id="reward-photo" onChange={handlePhoto} type="file" /><button className="button secondary" onClick={() => document.getElementById("reward-photo")?.click()} type="button"><ImagePlus size={18} />Foto auswählen</button></div>
          </div>
        </section>
      ) : null}
      {step === 5 ? (
        <section className="premium-owner-editor-section">
          <div><p className="premium-owner-kicker">Vorschau</p><h3>Letzte Angaben prüfen</h3></div>
          <div className="grid two">
            <label className="field" htmlFor="reward-name"><span>Name</span><input className="input" id="reward-name" onChange={(event) => setRewardName(event.target.value)} value={rewardName} /></label>
            <label className="field" htmlFor="reward-category"><span>Kategorie</span><input className="input" id="reward-category" onChange={(event) => setRewardCategory(event.target.value)} value={rewardCategory} /></label>
          </div>
          <article className="premium-customer-reward-preview">
            <div>{photoPreview ? <img alt={rewardTitle} src={photoPreview} /> : <SelectedIcon aria-hidden="true" size={48} />}</div>
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
        <button className="button" disabled={saving || !rewardName.trim()} onClick={saveReward} type="button"><Sparkles size={18} />{editingOffer ? "Änderungen speichern" : "Punkteeinlösung erstellen"}</button>
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
                key={offer.id}
                meta={[{ label: "Benötigte Punkte", value: `${offer.required_points} Punkte` }, { label: "Produktwert", value: offer.product_price ? formatEuro(offer.product_price) : "Nicht hinterlegt" }, { label: "Gültigkeit", value: formatValidity(offer.expires_at) }]}
                PlaceholderIcon={PlaceholderIcon}
                title={offer.title}
              />
            );
          })}
        </section>
      )}

      <AppDrawer description="Produkt, Preis, Foto und automatische Punkteberechnung." footer={editorOpen && !editingOffer ? wizardActions : null} onClose={closeRewardEditor} open={editorOpen && !editingOffer} title="Neue Punkteeinlösung">{wizardContent}</AppDrawer>

      <AppDrawer description="Produkt, Preis, Foto und automatische Punkteberechnung bearbeiten." footer={editingOffer ? wizardActions : null} onClose={closeRewardEditor} open={editorOpen && Boolean(editingOffer)} title="Punkteeinlösung bearbeiten">{wizardContent}</AppDrawer>

      <AppDrawer description="So sehen Gäste dieses Angebot im Kundenportal." footer={<button className="button" onClick={() => setPreviewOffer(null)} type="button">Vorschau schließen</button>} onClose={() => setPreviewOffer(null)} open={Boolean(previewOffer)} title="Vorschau im Kundenportal">
        {previewOffer ? (() => { const Icon = iconForCategory(previewOffer.category); return <div className="premium-owner-preview-shell"><article className="premium-customer-reward-preview large"><div>{previewOffer.image_url ? <img alt={previewOffer.title} src={previewOffer.image_url} /> : <Icon aria-hidden="true" size={54} />}</div><section><span>{previewOffer.category ?? "Eigenes Produkt"}</span><h3>{previewOffer.title}</h3><strong>{previewOffer.required_points} Punkte</strong><p>{previewOffer.active ? "Im Kundenportal sichtbar" : "Derzeit nicht sichtbar"}</p></section></article><p className="premium-owner-preview-note"><Eye size={18} />Diese Vorschau löst keine Punkteeinlösung aus.</p></div>; })() : null}
      </AppDrawer>

      <AppDrawer description={pendingStatusOffer?.active ? "Neue Kunden können sie danach nicht mehr einlösen." : "Sie wird danach im Kundenportal sichtbar."} footer={pendingStatusOffer ? <><button className="button secondary" onClick={() => setPendingStatusOffer(null)} type="button">Abbrechen</button><button className="button" disabled={saving} onClick={() => toggleOffer(pendingStatusOffer)} type="button">{pendingStatusOffer.active ? "Deaktivieren" : "Aktivieren"}</button></> : null} onClose={() => setPendingStatusOffer(null)} open={Boolean(pendingStatusOffer)} title={pendingStatusOffer?.active ? "Belohnung deaktivieren?" : "Belohnung aktivieren?"}>
        {pendingStatusOffer ? <div className="premium-owner-confirmation"><span><Star size={26} /></span><h3>{pendingStatusOffer.title}</h3><p>{pendingStatusOffer.active ? "Die Punkteeinlösung bleibt gespeichert und kann später wieder aktiviert werden." : "Gäste sehen die Punkteeinlösung nach der Aktivierung wieder."}</p></div> : null}
      </AppDrawer>

      {status && !editorOpen ? <p className="status-message" role="status">{status}</p> : null}
    </div>
  );
}
