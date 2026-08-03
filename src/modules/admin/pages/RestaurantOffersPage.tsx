import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Copy,
  Edit3,
  Eye,
  Image as ImageIcon,
  MousePointerClick,
  Newspaper,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";
import { useTenant } from "../../tenant/TenantProvider";
import { OwnerRewardImageUploader } from "../components/OwnerRewardImageUploader";
import {
  removeOwnerRewardImageUpload,
  uploadOwnerRewardImage,
} from "../services/ownerRewardImageService";
import {
  changeRestaurantOfferStatus,
  deleteRestaurantOfferDraft,
  duplicateRestaurantOffer,
  formatRestaurantOfferPrice,
  loadRestaurantOfferBranches,
  loadRestaurantOffers,
  restaurantOfferDisplayStatus,
  restaurantOfferTypeLabels,
  restaurantOfferTypes,
  saveRestaurantOffer,
  type RestaurantOffer,
  type RestaurantOfferBranch,
  type RestaurantOfferType,
} from "../../offers/restaurantOfferService";
import "./restaurant-offers.css";

type Filter = "all" | "published" | "draft" | "inactive";

type OfferForm = {
  id: string | null;
  branchId: string;
  offerType: RestaurantOfferType;
  title: string;
  shortDescription: string;
  description: string;
  imageUrl: string | null;
  currentPrice: string;
  previousPrice: string;
  validFrom: string;
  validTo: string;
  weekdays: number[];
  timeFrom: string;
  timeTo: string;
  buttonLabel: string;
};

const weekdays = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 7, label: "So" },
];

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function newOfferForm(branchId = ""): OfferForm {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    id: null,
    branchId,
    offerType: "WEEKLY_OFFER",
    title: "",
    shortDescription: "",
    description: "",
    imageUrl: null,
    currentPrice: "",
    previousPrice: "",
    validFrom: localDateTime(start),
    validTo: localDateTime(end),
    weekdays: [],
    timeFrom: "",
    timeTo: "",
    buttonLabel: "Angebot ansehen",
  };
}

function offerToForm(offer: RestaurantOffer): OfferForm {
  return {
    id: offer.id,
    branchId: offer.branch_id,
    offerType: offer.offer_type,
    title: offer.title,
    shortDescription: offer.short_description,
    description: offer.description ?? "",
    imageUrl: offer.image_url,
    currentPrice: offer.current_price == null ? "" : String(offer.current_price),
    previousPrice: offer.previous_price == null ? "" : String(offer.previous_price),
    validFrom: localDateTime(new Date(offer.valid_from)),
    validTo: localDateTime(new Date(offer.valid_to)),
    weekdays: offer.weekdays ?? [],
    timeFrom: offer.time_from?.slice(0, 5) ?? "",
    timeTo: offer.time_to?.slice(0, 5) ?? "",
    buttonLabel: offer.button_label,
  };
}

function formatPeriod(offer: RestaurantOffer) {
  const formatter = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${formatter.format(new Date(offer.valid_from))} – ${formatter.format(new Date(offer.valid_to))}`;
}

function statusTone(status: string) {
  if (status === "Veröffentlicht") return "active";
  if (status === "Geplant" || status === "Entwurf") return "draft";
  if (status === "Abgelaufen") return "expired";
  return "inactive";
}

export function RestaurantOffersPage() {
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const [offers, setOffers] = useState<RestaurantOffer[]>([]);
  const [branches, setBranches] = useState<RestaurantOfferBranch[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [previewOffer, setPreviewOffer] = useState<RestaurantOffer | null>(null);
  const [form, setForm] = useState<OfferForm>(() => newOfferForm());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstInvalidRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextOffers, nextBranches] = await Promise.all([
        loadRestaurantOffers(restaurantId),
        loadRestaurantOfferBranches(restaurantId),
      ]);
      setOffers(nextOffers);
      setBranches(nextBranches);
    } catch (nextError) {
      setOffers([]);
      setBranches([]);
      setError(nextError instanceof Error ? nextError.message : "Aktuelles konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const visibleOffers = useMemo(() => offers.filter((offer) => {
    const displayStatus = restaurantOfferDisplayStatus(offer);
    if (filter === "published") return displayStatus === "Veröffentlicht" || displayStatus === "Geplant";
    if (filter === "draft") return displayStatus === "Entwurf";
    if (filter === "inactive") return ["Deaktiviert", "Abgelaufen", "Archiviert"].includes(displayStatus);
    return true;
  }), [filter, offers]);

  function resetPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  function startCreate() {
    resetPhoto();
    setForm(newOfferForm(branches[0]?.id ?? activeRestaurant?.primary_branch_id ?? ""));
    setFormError(null);
    setFormOpen(true);
  }

  function startEdit(offer: RestaurantOffer) {
    resetPhoto();
    setForm(offerToForm(offer));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    resetPhoto();
    setFormOpen(false);
    setFormError(null);
  }

  function selectPhoto(file: File) {
    resetPhoto();
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function validateForm() {
    if (!form.title.trim() || !form.shortDescription.trim() || !form.branchId || !form.validFrom || !form.validTo) {
      return "Bitte fülle alle Pflichtfelder aus.";
    }
    if (new Date(form.validTo).getTime() <= new Date(form.validFrom).getTime()) {
      return "Das Ende muss nach dem Beginn liegen.";
    }
    const currentPrice = form.currentPrice ? Number(form.currentPrice.replace(",", ".")) : null;
    const previousPrice = form.previousPrice ? Number(form.previousPrice.replace(",", ".")) : null;
    if (currentPrice !== null && (!Number.isFinite(currentPrice) || currentPrice <= 0)) return "Der aktuelle Preis muss größer als 0 sein.";
    if (previousPrice !== null && (currentPrice === null || previousPrice <= currentPrice)) return "Der vorherige Preis muss über dem aktuellen Preis liegen.";
    if (form.offerType === "LUNCH_MENU" && (!form.weekdays.length || !form.timeFrom || !form.timeTo)) {
      return "Wähle für das Mittagsmenü mindestens einen Wochentag und ein Zeitfenster.";
    }
    if ((form.timeFrom && !form.timeTo) || (!form.timeFrom && form.timeTo) || (form.timeFrom && form.timeTo && form.timeTo <= form.timeFrom)) {
      return "Bitte gib ein vollständiges, gültiges Zeitfenster ein.";
    }
    return null;
  }

  async function saveForm() {
    if (!activeRestaurant?.id || saving) return;
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      firstInvalidRef.current?.focus();
      return;
    }
    setSaving(true);
    setFormError(null);
    let uploadedPath: string | null = null;
    try {
      let imageUrl = form.imageUrl;
      if (photoFile) {
        const upload = await uploadOwnerRewardImage({
          restaurantId: activeRestaurant.id,
          folder: "offers",
          entityId: form.id,
          file: photoFile,
        });
        imageUrl = upload.publicUrl;
        uploadedPath = upload.objectPath;
      }
      await saveRestaurantOffer({
        id: form.id,
        restaurantId: activeRestaurant.id,
        branchId: form.branchId,
        offerType: form.offerType,
        title: form.title.trim(),
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim() || null,
        imageUrl,
        currentPrice: form.currentPrice ? Number(form.currentPrice.replace(",", ".")) : null,
        previousPrice: form.previousPrice ? Number(form.previousPrice.replace(",", ".")) : null,
        validFrom: new Date(form.validFrom).toISOString(),
        validTo: new Date(form.validTo).toISOString(),
        weekdays: form.weekdays.length ? form.weekdays : null,
        timeFrom: form.timeFrom || null,
        timeTo: form.timeTo || null,
        buttonLabel: form.buttonLabel.trim() || "Angebot ansehen",
      });
      setStatusMessage(form.id ? "Angebot aktualisiert." : "Entwurf gespeichert.");
      resetPhoto();
      setFormOpen(false);
      await reload();
    } catch (nextError) {
      if (uploadedPath) await removeOwnerRewardImageUpload(uploadedPath);
      setFormError(nextError instanceof Error ? nextError.message : "Das Angebot konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(offer: RestaurantOffer, action: "PUBLISH" | "DISABLE" | "ARCHIVE") {
    if (!activeRestaurant?.id) return;
    setStatusMessage(null);
    try {
      await changeRestaurantOfferStatus(activeRestaurant.id, offer.id, action);
      setStatusMessage(action === "PUBLISH" ? "Angebot veröffentlicht." : action === "DISABLE" ? "Angebot deaktiviert." : "Angebot archiviert.");
      await reload();
    } catch (nextError) {
      setStatusMessage(nextError instanceof Error ? nextError.message : "Die Aktion konnte nicht abgeschlossen werden.");
    }
  }

  async function duplicateOffer(offer: RestaurantOffer) {
    if (!activeRestaurant?.id) return;
    try {
      await duplicateRestaurantOffer(activeRestaurant.id, offer.id);
      setStatusMessage("Kopie als Entwurf erstellt.");
      await reload();
    } catch (nextError) {
      setStatusMessage(nextError instanceof Error ? nextError.message : "Das Angebot konnte nicht dupliziert werden.");
    }
  }

  async function deleteDraft(offer: RestaurantOffer) {
    if (!activeRestaurant?.id) return;
    try {
      await deleteRestaurantOfferDraft(activeRestaurant.id, offer.id);
      setStatusMessage("Entwurf gelöscht.");
      await reload();
    } catch (nextError) {
      setStatusMessage(nextError instanceof Error ? nextError.message : "Der Entwurf konnte nicht gelöscht werden.");
    }
  }

  if (!activeRestaurant) return <section className="card premium-owner-management-state"><h1>Kein Restaurant ausgewählt</h1></section>;

  return (
    <div className="premium-owner-page restaurant-offers-page">
      <header className="premium-owner-page-header restaurant-offers-heading">
        <div><span className="premium-owner-kicker">Informationen für deine Gäste</span><h1>Aktuelles & Angebote</h1><p>Veröffentliche Menüs, Veranstaltungen und Neuigkeiten. Maximal fünf Beiträge können gleichzeitig aktiv sein.</p></div>
        <button className="button premium-owner-primary-action" onClick={startCreate} type="button"><Plus aria-hidden="true" size={19} />Neues Angebot erstellen</button>
      </header>

      <section className="restaurant-offers-legal-note">
        <Newspaper aria-hidden="true" size={21} />
        <p><strong>Information statt Punkteeinlösung.</strong> Angebote verändern keine Punkte und erzeugen keine Einlösung. Das Restaurant ist für die Richtigkeit, Aktualität, Verfügbarkeit und rechtliche Zulässigkeit seiner Angebots-, Preis-, Produkt- und Bildangaben verantwortlich.</p>
      </section>

      <div className="restaurant-offers-toolbar">
        <div aria-label="Angebote filtern" className="restaurant-offers-filters" role="group">
          {([['all', 'Alle'], ['published', 'Veröffentlicht'], ['draft', 'Entwürfe'], ['inactive', 'Inaktiv']] as const).map(([value, label]) => (
            <button aria-pressed={filter === value} className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
          ))}
        </div>
        <span>{offers.filter((offer) => restaurantOfferDisplayStatus(offer) === "Veröffentlicht").length} von 5 aktuell aktiv</span>
      </div>

      {statusMessage ? <p aria-live="polite" className="restaurant-offers-message">{statusMessage}</p> : null}
      {loading ? (
        <section aria-busy="true" className="restaurant-offers-grid">{[0, 1, 2].map((item) => <div className="restaurant-offer-skeleton" key={item} />)}</section>
      ) : error ? (
        <section className="card premium-owner-management-state" role="alert"><RefreshCw aria-hidden="true" size={25} /><div><h2>Aktuelles konnte nicht geladen werden</h2><p>{error}</p></div><button className="button" onClick={() => void reload()} type="button">Erneut versuchen</button></section>
      ) : visibleOffers.length ? (
        <section aria-label="Gespeicherte Angebote" className="restaurant-offers-grid">
          {visibleOffers.map((offer) => {
            const displayStatus = restaurantOfferDisplayStatus(offer);
            return (
              <article className="restaurant-offer-card" key={offer.id}>
                <div className="restaurant-offer-media">
                  {offer.image_url ? <img alt={`Bild zu ${offer.title}`} loading="lazy" src={offer.image_url} /> : <span><ImageIcon aria-hidden="true" size={34} /></span>}
                  <span className={`restaurant-offer-status ${statusTone(displayStatus)}`}>{displayStatus}</span>
                </div>
                <div className="restaurant-offer-body">
                  <span className="restaurant-offer-type">{restaurantOfferTypeLabels[offer.offer_type]}</span>
                  <h2>{offer.title}</h2>
                  <p>{offer.short_description}</p>
                  <dl>
                    <div><dt>Gültigkeit</dt><dd>{formatPeriod(offer)}</dd></div>
                    <div><dt>Standort</dt><dd>{offer.branch_name ?? activeRestaurant.name}</dd></div>
                    {offer.current_price != null ? <div><dt>Preis</dt><dd>{formatRestaurantOfferPrice(offer.current_price)}</dd></div> : null}
                  </dl>
                  <div className="restaurant-offer-metrics"><span><Eye aria-hidden="true" size={16} />{offer.views ?? 0} Aufrufe</span><span><MousePointerClick aria-hidden="true" size={16} />{offer.clicks ?? 0} Klicks</span></div>
                  <div className="restaurant-offer-actions">
                    <button onClick={() => startEdit(offer)} type="button"><Edit3 aria-hidden="true" size={17} />Bearbeiten</button>
                    <button onClick={() => setPreviewOffer(offer)} type="button"><Eye aria-hidden="true" size={17} />Vorschau</button>
                    {offer.status === "DRAFT" || offer.status === "DISABLED" ? <button onClick={() => void runAction(offer, "PUBLISH")} type="button"><Send aria-hidden="true" size={17} />Veröffentlichen</button> : null}
                    {offer.status === "PUBLISHED" && offer.is_active ? <button onClick={() => void runAction(offer, "DISABLE")} type="button"><XCircle aria-hidden="true" size={17} />Deaktivieren</button> : null}
                    <button onClick={() => void duplicateOffer(offer)} type="button"><Copy aria-hidden="true" size={17} />Duplizieren</button>
                    {offer.status === "DRAFT" ? <button className="danger" onClick={() => void deleteDraft(offer)} type="button"><Trash2 aria-hidden="true" size={17} />Entwurf löschen</button> : offer.status !== "ARCHIVED" ? <button onClick={() => void runAction(offer, "ARCHIVE")} type="button"><Archive aria-hidden="true" size={17} />Archivieren</button> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="restaurant-offers-empty"><Newspaper aria-hidden="true" size={34} /><h2>Noch keine Angebote</h2><p>Erstelle deinen ersten Informationsbeitrag für deine Gäste.</p><button className="button" onClick={startCreate} type="button">Neues Angebot erstellen</button></section>
      )}

      <AppDrawer
        description="Erstelle oder bearbeite einen Informationsbeitrag."
        footer={<><button className="button secondary" disabled={saving} onClick={closeForm} type="button">Abbrechen</button><button className="button" disabled={saving} onClick={() => void saveForm()} type="button">{saving ? "Wird gespeichert …" : "Entwurf speichern"}</button></>}
        onClose={closeForm}
        open={formOpen}
        size="large"
        title={form.id ? "Angebot bearbeiten" : "Neues Angebot"}
      >
        <form className="restaurant-offer-form" onSubmit={(event) => { event.preventDefault(); void saveForm(); }}>
          <RequiredFieldsNote />
          <OwnerRewardImageUploader
            ariaLabel={form.imageUrl || photoPreview ? "Foto für das Angebot ändern" : "Foto für das Angebot hinzufügen"}
            categoryIcon={<ImageIcon aria-hidden="true" size={34} />}
            imageUrl={form.imageUrl}
            label="Angebot"
            loading={saving && Boolean(photoFile)}
            onFileSelected={selectPhoto}
            onRemove={() => { resetPhoto(); setForm((current) => ({ ...current, imageUrl: null })); }}
            previewUrl={photoPreview}
          />
          <div className="field"><FormLabel htmlFor="offer-title" required>Titel</FormLabel><input aria-required="true" id="offer-title" maxLength={120} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} ref={firstInvalidRef} required value={form.title} /></div>
          <div className="field"><FormLabel htmlFor="offer-type" required>Art des Beitrags</FormLabel><select aria-required="true" id="offer-type" onChange={(event) => setForm((current) => ({ ...current, offerType: event.target.value as RestaurantOfferType }))} required value={form.offerType}>{restaurantOfferTypes.map((type) => <option key={type} value={type}>{restaurantOfferTypeLabels[type]}</option>)}</select></div>
          <div className="field"><FormLabel htmlFor="offer-short" required>Kurzbeschreibung</FormLabel><textarea aria-required="true" id="offer-short" maxLength={240} onChange={(event) => setForm((current) => ({ ...current, shortDescription: event.target.value }))} required rows={3} value={form.shortDescription} /><small>{form.shortDescription.length}/240 Zeichen</small></div>
          <div className="field"><FormLabel htmlFor="offer-description" optional>Ausführliche Beschreibung</FormLabel><textarea id="offer-description" maxLength={4000} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} value={form.description} /></div>
          <div className="restaurant-offer-form-grid">
            <div className="field"><FormLabel htmlFor="offer-price" optional>Aktueller Preis</FormLabel><input id="offer-price" inputMode="decimal" min="0.01" onChange={(event) => setForm((current) => ({ ...current, currentPrice: event.target.value }))} step="0.01" type="number" value={form.currentPrice} /></div>
            <div className="field"><FormLabel htmlFor="offer-previous-price" optional>Vorheriger Preis</FormLabel><input id="offer-previous-price" inputMode="decimal" min="0.01" onChange={(event) => setForm((current) => ({ ...current, previousPrice: event.target.value }))} step="0.01" type="number" value={form.previousPrice} /></div>
          </div>
          <p className="restaurant-offer-price-note">Du bist für die Richtigkeit und rechtliche Zulässigkeit deiner Preisangaben verantwortlich.</p>
          <div className="restaurant-offer-form-grid">
            <div className="field"><FormLabel htmlFor="offer-valid-from" required>Gültig von</FormLabel><input aria-required="true" id="offer-valid-from" onChange={(event) => setForm((current) => ({ ...current, validFrom: event.target.value }))} required type="datetime-local" value={form.validFrom} /></div>
            <div className="field"><FormLabel htmlFor="offer-valid-to" required>Gültig bis</FormLabel><input aria-required="true" id="offer-valid-to" onChange={(event) => setForm((current) => ({ ...current, validTo: event.target.value }))} required type="datetime-local" value={form.validTo} /></div>
          </div>
          <div className="field"><FormLabel htmlFor="offer-branch" required>Restaurant/Filiale</FormLabel><select aria-required="true" id="offer-branch" onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))} required value={form.branchId}><option value="">Bitte auswählen</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
          <fieldset className="restaurant-offer-weekdays"><legend>Wochentage <span>Optional</span></legend>{weekdays.map((day) => <label key={day.value}><input checked={form.weekdays.includes(day.value)} onChange={(event) => setForm((current) => ({ ...current, weekdays: event.target.checked ? [...current.weekdays, day.value].sort() : current.weekdays.filter((value) => value !== day.value) }))} type="checkbox" />{day.label}</label>)}</fieldset>
          <div className="restaurant-offer-form-grid"><div className="field"><FormLabel htmlFor="offer-time-from" optional>Uhrzeit von</FormLabel><input id="offer-time-from" onChange={(event) => setForm((current) => ({ ...current, timeFrom: event.target.value }))} type="time" value={form.timeFrom} /></div><div className="field"><FormLabel htmlFor="offer-time-to" optional>Uhrzeit bis</FormLabel><input id="offer-time-to" onChange={(event) => setForm((current) => ({ ...current, timeTo: event.target.value }))} type="time" value={form.timeTo} /></div></div>
          <div className="field"><FormLabel htmlFor="offer-button" optional>Buttontext</FormLabel><input id="offer-button" maxLength={50} onChange={(event) => setForm((current) => ({ ...current, buttonLabel: event.target.value }))} value={form.buttonLabel} /></div>
          {formError ? <p className="restaurant-offer-form-error" role="alert">{formError}</p> : null}
        </form>
      </AppDrawer>

      <AppDrawer description="So sehen Gäste den Beitrag." onClose={() => setPreviewOffer(null)} open={Boolean(previewOffer)} size="standard" title="Vorschau">
        {previewOffer ? <article className="restaurant-offer-customer-preview">{previewOffer.image_url ? <img alt={`Bild zu ${previewOffer.title}`} src={previewOffer.image_url} /> : <span><ImageIcon aria-hidden="true" size={34} /></span>}<div><small>{restaurantOfferTypeLabels[previewOffer.offer_type]}</small><h2>{previewOffer.title}</h2><p>{previewOffer.short_description}</p>{previewOffer.current_price != null ? <strong>{formatRestaurantOfferPrice(previewOffer.current_price)}</strong> : null}<button className="button" type="button">{previewOffer.button_label}</button></div></article> : null}
      </AppDrawer>
    </div>
  );
}
