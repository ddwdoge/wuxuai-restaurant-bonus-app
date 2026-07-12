import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Edit3, Gift, ImagePlus, Power, Sparkles } from "lucide-react";
import { loadLoyaltySettings } from "../../loyalty/loyaltyService";
import {
  loadRewardOffers,
  saveRewardOffer,
  setRewardOfferActive,
  type RewardOffer,
} from "../../rewards/rewardService";
import { supabase } from "../../../shared/lib/supabase";
import { useTenant } from "../../tenant/TenantProvider";

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
  icon: string;
  category: string;
  defaultTitle: string;
};

const rewardTemplates: RewardTemplate[] = [
  { key: "dessert", label: "Dessert", icon: "🍰", category: "Dessert", defaultTitle: "Gratis Dessert" },
  { key: "drink", label: "Getränk", icon: "🥤", category: "Getränk", defaultTitle: "Gratis Getränk" },
  { key: "coffee", label: "Kaffee", icon: "☕", category: "Kaffee", defaultTitle: "Gratis Kaffee" },
  { key: "appetizer", label: "Vorspeise", icon: "🥗", category: "Vorspeise", defaultTitle: "Gratis Vorspeise" },
  { key: "main", label: "Hauptspeise", icon: "🍽️", category: "Hauptspeise", defaultTitle: "Gratis Hauptspeise" },
  { key: "sushi", label: "Sushi", icon: "🍣", category: "Sushi", defaultTitle: "Gratis Sushi" },
  { key: "menu", label: "Menü", icon: "🍱", category: "Menü", defaultTitle: "Gratis Menü" },
  { key: "custom", label: "Eigenes Produkt", icon: "🎁", category: "Eigenes Produkt", defaultTitle: "Eigenes Produkt" },
];

const categoryAssets: Record<string, { icon: string; asset: string }> = {
  Dessert: { icon: "🍰", asset: "dessert" },
  Getränk: { icon: "🥤", asset: "drink" },
  Kaffee: { icon: "☕", asset: "coffee" },
  Vorspeise: { icon: "🥗", asset: "appetizer" },
  Hauptspeise: { icon: "🍽️", asset: "main" },
  Sushi: { icon: "🍣", asset: "sushi" },
  Menü: { icon: "🍱", asset: "menu" },
  "Eigenes Produkt": { icon: "🎁", asset: "custom" },
};

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
  if (!value) return "";
  return String(value).replace(".", ",");
}

function extractProductPrice(description: string) {
  const match = description.match(/Produktwert:\s*([0-9]+(?:[,.][0-9]+)?)/);
  return match ? parseEuro(match[1]) : null;
}

function rewardFileExtension(file: File) {
  const fromName = file.name.toLowerCase().split(".").pop();
  if (fromName && ["png", "jpg", "jpeg", "svg"].includes(fromName)) {
    return fromName;
  }
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

  if (ratio >= 10) {
    return {
      requiredPoints,
      estimatedRevenue,
      redemptionReturnRate,
      quotePercent,
      status: "🟢 Wirtschaftlich",
      statusClass: "good",
    };
  }

  if (ratio >= 7) {
    return {
      requiredPoints,
      estimatedRevenue,
      redemptionReturnRate,
      quotePercent,
      status: "🟡 Prüfen",
      statusClass: "check",
    };
  }

  return {
    requiredPoints,
    estimatedRevenue,
    redemptionReturnRate,
    quotePercent,
    status: "🔴 Zu großzügig",
    statusClass: "risk",
  };
}

function standardRewardAsset(category: string | null | undefined, title: string) {
  const asset = categoryAssets[category ?? ""] ?? categoryAssets["Eigenes Produkt"];

  return (
    <span className={`standard-asset reward-card-asset ${asset.asset}`} aria-label={`Standardbild ${title}`}>
      {asset.icon}
    </span>
  );
}

export function RewardsPage() {
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const wizardRef = useRef<HTMLElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const rewardNameInputRef = useRef<HTMLInputElement | null>(null);
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
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [highlightWizard, setHighlightWizard] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    async function loadRewards() {
      try {
        const [nextOffers, nextSettings] = await Promise.all([
          loadRewardOffers(restaurantId),
          loadLoyaltySettings(restaurantId),
        ]);
        if (!cancelled) {
          setOffers(nextOffers.filter((offer) => offer.source === "reward" && !offer.is_starter_reward));
          setSettings({
            loyalty_mode: nextSettings.loyalty_mode,
            amount_per_point: nextSettings.amount_per_point,
            redemption_return_rate: nextSettings.redemption_return_rate ?? 0.05,
            stamps_required: nextSettings.stamps_required,
            active: nextSettings.active,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Punkteeinlösungen konnten nicht geladen werden.", error);
          setStatus("Daten konnten gerade nicht geladen werden.");
        }
      }
    }

    loadRewards();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const productPrice = parseEuro(priceInput);
  const calculation = useMemo(
    () => calculateReward(productPrice, settings),
    [productPrice, settings],
  );
  const rewardTitle = rewardName.trim() || selectedTemplate?.defaultTitle || "Neue Punkteeinlösung";
  const currentCategory = rewardCategory.trim() || selectedTemplate?.category || "Eigenes Produkt";
  const canContinueFromPrice = productPrice > 0;

  useEffect(() => {
    if (!highlightWizard) return;

    const highlightTimer = window.setTimeout(() => setHighlightWizard(false), 1400);
    const focusTimer = window.setTimeout(() => {
      if (step === 2) {
        priceInputRef.current?.focus();
        priceInputRef.current?.select();
        return;
      }
      rewardNameInputRef.current?.focus();
    }, 260);

    return () => {
      window.clearTimeout(highlightTimer);
      window.clearTimeout(focusTimer);
    };
  }, [highlightWizard, step]);

  function selectTemplate(template: RewardTemplate) {
    setSelectedTemplate(template);
    if (!rewardName.trim() || !editingOffer) {
      setRewardName(template.defaultTitle);
    }
    if (!rewardCategory.trim() || !editingOffer) {
      setRewardCategory(template.category);
    }
  }

  function goBack() {
    setStep((current) => Math.max(1, current - 1) as WizardStep);
  }

  function goNext() {
    setStep((current) => Math.min(5, current + 1) as WizardStep);
  }

  function resetWizard() {
    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    setStep(1);
    setSelectedTemplate(null);
    setRewardName("");
    setRewardCategory("");
    setPriceInput("");
    setPhotoPreview(null);
    setPhotoFile(null);
    setEditingOffer(null);
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setStatus("Bitte wähle PNG, JPG, JPEG oder SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus("Das Bild darf maximal 5 MB groß sein.");
      return;
    }

    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoFile(file);
    setStatus("Foto für die Vorschau ausgewählt.");
  }

  function editOffer(offer: RewardOffer) {
    if (offer.source !== "reward") {
      setStatus("Gutscheine bleiben in V1 außerhalb der Punkteeinlösung.");
      return;
    }

    const template =
      rewardTemplates.find((item) => item.category === offer.category) ?? rewardTemplates[rewardTemplates.length - 1] ?? null;
    setEditingOffer(offer);
    setSelectedTemplate(template);
    setRewardName(offer.title);
    setRewardCategory(offer.category ?? template?.category ?? "Eigenes Produkt");
    setPriceInput(formatPriceInput(offer.product_price ?? extractProductPrice(offer.description)));
    setPhotoPreview(offer.image_url);
    setPhotoFile(null);
    setStep(2);
    setHighlightWizard(true);
    setStatus("Punkteeinlösung wird bearbeitet.");

    window.setTimeout(() => {
      wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function saveReward() {
    if (!restaurantId || !selectedTemplate || productPrice <= 0) return;

    setSaving(true);
    setStatus(null);

    try {
      let imageUrl: string | null = null;

      if (photoFile && supabase) {
        const path = `${restaurantId}/rewards/reward-${Date.now()}.${rewardFileExtension(photoFile)}`;
        const { error } = await supabase.storage.from("restaurant-media").upload(path, photoFile, {
          cacheControl: "3600",
          upsert: true,
        });
        if (error) throw error;
        const { data } = supabase.storage.from("restaurant-media").getPublicUrl(path);
        imageUrl = data.publicUrl;
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
        is_starter_reward: editingOffer?.is_starter_reward ?? false,
        active: editingOffer?.active ?? true,
        expires_at: null,
      });

      setOffers((currentOffers) => {
        const exists = currentOffers.some((offer) => offer.id === saved.id && offer.source === saved.source);
        return exists
          ? currentOffers.map((offer) => (offer.id === saved.id && offer.source === saved.source ? saved : offer))
          : [...currentOffers, saved];
      });
      resetWizard();
      setStatus(editingOffer ? "Punkteeinlösung aktualisiert." : "Punkteeinlösung erstellt.");
    } catch (error) {
      console.error("Punkteeinlösung konnte nicht gespeichert werden.", error);
      setStatus("Punkteeinlösung konnte gerade nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOffer(offer: RewardOffer) {
    const updated = await setRewardOfferActive(offer, !offer.active);
    setOffers((currentOffers) =>
      currentOffers.map((item) => (item.id === updated.id && item.source === updated.source ? updated : item)),
    );
    setStatus(updated.active ? "Punkteeinlösung aktiviert." : "Punkteeinlösung deaktiviert.");
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Punkteeinlösung</h1>
          <p className="muted">
            Lege Produkte fest, die Gäste mit gesammelten Punkten einlösen können.
          </p>
        </div>
      </header>

      <section className="reward-wizard-shell">
        <article className={`card reward-wizard-card${highlightWizard ? " editing-highlight" : ""}`} ref={wizardRef}>
          <div className="reward-wizard-head">
            <span className="pill">Schritt {step} von 5</span>
            <h2>{editingOffer ? "Punkteeinlösung bearbeiten" : "Neue Punkteeinlösung erstellen"}</h2>
            <p className="muted">
              Du legst Produkt und Preis fest. WUXUAI berechnet automatisch, wie viele Punkte zur Einlösung nötig sind.
            </p>
          </div>

          {step === 1 ? (
            <div className="reward-wizard-step">
              <h3>Was soll mit Punkten einlösbar sein?</h3>
              <div className="reward-template-grid">
                {rewardTemplates.map((template) => (
                  <button
                    className={`reward-template-card${selectedTemplate?.key === template.key ? " selected" : ""}`}
                    key={template.key}
                    onClick={() => selectTemplate(template)}
                    type="button"
                  >
                    <span className="reward-template-check">
                      {selectedTemplate?.key === template.key ? <CheckCircle2 size={20} /> : null}
                    </span>
                    <span className="reward-template-icon" aria-hidden="true">{template.icon}</span>
                    <strong>{template.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="reward-wizard-step">
              <h3>Wie viel kostet dieses Produkt normalerweise?</h3>
              <label className="field" htmlFor="reward-price">
                <span>Preis in €</span>
                <input
                  className="input reward-price-input"
                  id="reward-price"
                  inputMode="decimal"
                  onChange={(event) => setPriceInput(event.target.value)}
                  placeholder="Beispiel: 5,50 €"
                  ref={priceInputRef}
                  value={priceInput}
                />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="reward-wizard-step">
              <h3>Empfohlene Einlösung</h3>
              <div className="reward-engine-summary">
                <article>
                  <span>Empfohlene Einlösung</span>
                  <strong>{calculation.requiredPoints} Punkte</strong>
                </article>
                <article>
                  <span>Einlösequote</span>
                  <strong>{calculation.quotePercent} %</strong>
                </article>
                <article>
                  <span>Geschätzte Konsumation bis zur Einlösung</span>
                  <strong>{formatEuro(calculation.estimatedRevenue)}</strong>
                </article>
                <article className={`reward-profit-status ${calculation.statusClass}`}>
                  <span>Status</span>
                  <strong>{calculation.status}</strong>
                </article>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="reward-wizard-step">
              <h3>Foto hochladen</h3>
              <p className="muted">Optional. Wenn du kein Foto hochlädst, verwenden wir ein Standardbild.</p>
              <div className="reward-photo-row">
                <div className="reward-standard-image">
                  {photoPreview ? <img alt="Punkteeinlösung" src={photoPreview} /> : <span>{selectedTemplate?.icon ?? "🎁"}</span>}
                </div>
                <div>
                  <input
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                    className="visually-hidden"
                    id="reward-photo"
                    onChange={handlePhoto}
                    type="file"
                  />
                  <button
                    className="button secondary"
                    onClick={() => document.getElementById("reward-photo")?.click()}
                    type="button"
                  >
                    <ImagePlus size={18} />
                    Foto auswählen
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="reward-wizard-step">
              <h3>Vorschau</h3>
              <div className="grid two">
                <label className="field" htmlFor="reward-name">
                  <span>Name</span>
                  <input
                    className="input"
                    id="reward-name"
                    onChange={(event) => setRewardName(event.target.value)}
                    ref={rewardNameInputRef}
                    value={rewardName}
                  />
                </label>
                <label className="field" htmlFor="reward-category">
                  <span>Kategorie</span>
                  <input
                    className="input"
                    id="reward-category"
                    onChange={(event) => setRewardCategory(event.target.value)}
                    value={rewardCategory}
                  />
                </label>
              </div>
              <article className="reward-preview-card">
                <div className="reward-preview-image">
                  {photoPreview ? <img alt="Punkteeinlösung" src={photoPreview} /> : <span>{selectedTemplate?.icon ?? "🎁"}</span>}
                </div>
                <div>
                  <span className="pill">{currentCategory}</span>
                  <h4>{rewardTitle}</h4>
                  <p>Produktpreis: {formatEuro(productPrice)}</p>
                  <p>Einlösequote: {calculation.quotePercent} %</p>
                  <p>Geschätzte Konsumation: {formatEuro(calculation.estimatedRevenue)}</p>
                  <p>Benötigte Punkte: {calculation.requiredPoints}</p>
                  <strong className={`reward-status-text ${calculation.statusClass}`}>{calculation.status}</strong>
                </div>
              </article>
            </div>
          ) : null}

          <div className="wizard-footer">
            <button className="button secondary" disabled={step === 1} onClick={goBack} type="button">
              Zurück
            </button>
            {step < 5 ? (
              <button
                className="button"
                disabled={(step === 1 && !selectedTemplate) || (step === 2 && !canContinueFromPrice)}
                onClick={goNext}
                type="button"
              >
                Weiter
              </button>
            ) : (
              <button className="button" disabled={saving} onClick={saveReward} type="button">
                <Sparkles size={18} />
                {editingOffer ? "Änderungen speichern" : "Punkteeinlösung erstellen"}
              </button>
            )}
          </div>
        </article>

        <article className="card reward-list-card">
          <h2>Gespeicherte Punkteeinlösungen</h2>
          <div className="reward-management-grid">
            {offers.map((offer) => (
              <article className={`reward-management-card${offer.active ? "" : " inactive"}`} key={`${offer.source}-${offer.id}`}>
                <div className="reward-management-image">
                  {offer.image_url ? (
                    <img alt={offer.title} src={offer.image_url} />
                  ) : (
                    standardRewardAsset(offer.category, offer.title)
                  )}
                </div>
                <div className="reward-management-body">
                  <strong>{offer.title}</strong>
                  <p className="muted">Preis</p>
                  <p>{offer.product_price ? formatEuro(offer.product_price) : "Nicht hinterlegt"}</p>
                  <p className="muted">Automatisch berechnet</p>
                  <p>{offer.required_points} Punkte</p>
                  <p className="muted">Status</p>
                  <p>{offer.active ? "🟢 Aktiv" : "⚪ Inaktiv"}</p>
                </div>
                <div className="row-actions">
                  <button className="button secondary" onClick={() => editOffer(offer)} type="button">
                    <Edit3 size={16} />
                    Bearbeiten
                  </button>
                  <button className="button secondary" onClick={() => toggleOffer(offer)} type="button">
                    <Power size={16} />
                    {offer.active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>
              </article>
            ))}
            {offers.length === 0 ? (
              <article className="empty-state-card reward-empty-card">
                <Gift size={34} />
                <h3>Noch keine Punkteeinlösung erstellt.</h3>
                <p className="muted">Erstelle deine erste Punkteeinlösung, damit Gäste ein klares Ziel beim Sammeln haben.</p>
                <button
                  className="button"
                  onClick={() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  type="button"
                >
                  Erste Punkteeinlösung erstellen
                </button>
              </article>
            ) : null}
          </div>
        </article>
      </section>

      {status ? <p className="status-message">{status}</p> : null}
    </>
  );
}
