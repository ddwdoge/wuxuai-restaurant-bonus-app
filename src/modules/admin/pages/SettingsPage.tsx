import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock,
  CreditCard,
  Gift,
  ImageUp,
  KeyRound,
  MapPinned,
  Scale,
  Palette,
  QrCode,
  Save,
  ShoppingBag,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../../shared/lib/supabase";
import type { BranchSubscription, Restaurant } from "../../../shared/types/domain";
import { useTenant } from "../../tenant/TenantProvider";
import { LazyPartnerRestaurantMap } from "../../customer/LazyPartnerRestaurantMap";
import type { PartnerRestaurant } from "../../customer/partnerRestaurantService";
import { normalizeOpeningDay, validateOpeningDay, type OpeningDay } from "../../../shared/openingHours.mjs";
import { OpeningHoursEditor } from "../../../shared/components/OpeningHoursEditor";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";

type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type RestaurantDetails = Pick<
  Restaurant,
  | "id"
  | "name"
  | "slug"
  | "status"
  | "owner_phone"
  | "restaurant_type"
  | "language"
  | "opening_hours"
  | "smart_open_enabled"
  | "primary_branch_id"
  | "organization_id"
>;

type PartnerLocationForm = {
  id: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  isDiscoverable: boolean;
  shortDescription: string;
  coverImageUrl: string;
};

const weekdays: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Montag" },
  { key: "tue", label: "Dienstag" },
  { key: "wed", label: "Mittwoch" },
  { key: "thu", label: "Donnerstag" },
  { key: "fri", label: "Freitag" },
  { key: "sat", label: "Samstag" },
  { key: "sun", label: "Sonntag" },
];

const defaultOpeningHours: Record<Weekday, OpeningDay> = {
  mon: normalizeOpeningDay(null, { enabled: false, open: "11:00", close: "22:00" }),
  tue: normalizeOpeningDay(null, { enabled: false, open: "11:00", close: "22:00" }),
  wed: normalizeOpeningDay(null, { enabled: false, open: "11:00", close: "22:00" }),
  thu: normalizeOpeningDay(null, { enabled: false, open: "11:00", close: "22:00" }),
  fri: normalizeOpeningDay(null, { enabled: false, open: "11:00", close: "22:00" }),
  sat: normalizeOpeningDay(null, { enabled: false, open: "12:00", close: "22:00" }),
  sun: normalizeOpeningDay(null, { enabled: false, open: "12:00", close: "21:00" }),
};

const subscriptionLabels: Record<string, string> = {
  trialing: "Testphase aktiv",
  active: "Abo aktiv",
  past_due: "Zahlung überfällig",
  unpaid: "Zahlung offen",
  paused: "Pausiert",
  cancelled: "Gekündigt",
};

const paymentLabels: Record<string, string> = {
  not_required: "Keine Zahlung erforderlich",
  pending: "Zahlung offen",
  paid: "Bezahlt",
  failed: "Zahlung fehlgeschlagen",
  manual: "Manuell bestätigt",
};

function normalizeOpeningHours(value: unknown): Record<Weekday, OpeningDay> {
  const input = (value && typeof value === "object" ? value : {}) as Partial<Record<Weekday, unknown>>;
  return weekdays.reduce((result, { key }) => {
    result[key] = normalizeOpeningDay(input[key], defaultOpeningHours[key]);
    return result;
  }, {} as Record<Weekday, OpeningDay>);
}

function formatDate(value?: string | null) {
  if (!value) return "Nicht gesetzt";
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function remainingTrialDays(value?: string | null) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

function isDatePast(value?: string | null) {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

function addDaysIso(value: string | null | undefined, days: number) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

function normalizeSubscription(record: Partial<BranchSubscription> | null): BranchSubscription | null {
  if (!record?.id || !record.branch_id || !record.organization_id) return null;
  const status = record.subscription_status ?? record.status ?? "trialing";
  const createdAt = record.created_at ?? new Date().toISOString();
  const trialStartedAt = record.trial_started_at ?? createdAt;
  const trialEndsAt = record.trial_ends_at ?? record.current_period_ends_at ?? addDaysIso(trialStartedAt, 30);

  return {
    id: record.id,
    organization_id: record.organization_id,
    branch_id: record.branch_id,
    status,
    subscription_status: record.subscription_status ?? status,
    payment_status: record.payment_status,
    plan_key: record.plan_key ?? "pilot",
    current_period_ends_at: record.current_period_ends_at ?? trialEndsAt,
    current_period_end: record.current_period_end ?? record.current_period_ends_at ?? null,
    trial_started_at: trialStartedAt,
    trial_ends_at: trialEndsAt,
    stripe_customer_id: record.stripe_customer_id ?? null,
    stripe_subscription_id: record.stripe_subscription_id ?? null,
    paused_at: record.paused_at ?? null,
    locked_at: record.locked_at ?? null,
    lock_reason: record.lock_reason ?? null,
    created_at: createdAt,
  };
}

function fileExtension(file: File) {
  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/png") return "png";
  return "jpg";
}

async function loadPrimarySubscription(restaurant: RestaurantDetails | null) {
  if (!supabase || !restaurant?.id) return null;

  let branchId = restaurant.primary_branch_id ?? null;
  let branchOrganizationId = restaurant.organization_id ?? null;
  if (!branchId) {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id, organization_id")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (branchError) throw branchError;
    branchId = branch?.id ?? null;
    branchOrganizationId = branch?.organization_id ?? branchOrganizationId;
  }

  if (!branchId) return null;

  const { data, error } = await supabase
    .from("branch_subscriptions")
    .select("id, organization_id, branch_id, status, plan_key, current_period_ends_at, created_at")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (error) throw error;

  const existing = normalizeSubscription(data as Partial<BranchSubscription> | null);
  if (existing) return existing;

  if (!branchOrganizationId) return null;

  const trialStartedAt = new Date().toISOString();
  const trialEndsAt = addDaysIso(trialStartedAt, 30);
  const { data: created, error: createError } = await supabase
    .from("branch_subscriptions")
    .insert({
      organization_id: branchOrganizationId,
      branch_id: branchId,
      status: "trialing",
      plan_key: "pilot",
      current_period_ends_at: trialEndsAt,
    })
    .select("id, organization_id, branch_id, status, plan_key, current_period_ends_at, created_at")
    .single();

  if (createError) throw createError;
  return normalizeSubscription(created as Partial<BranchSubscription>);
}

export function SettingsPage() {
  const { activeRestaurant, branding, loading: tenantLoading, refreshTenants } = useTenant();
  const { section } = useParams();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [details, setDetails] = useState<RestaurantDetails | null>(null);
  const [restaurantForm, setRestaurantForm] = useState({ name: "", ownerPhone: "" });
  const [openingHours, setOpeningHours] = useState<Record<Weekday, OpeningDay>>(() => normalizeOpeningHours(null));
  const [brandingForm, setBrandingForm] = useState({
    logoUrl: "",
    primaryColor: "#0f766e",
    secondaryColor: "#f4a261",
    buttonColor: "#0f766e",
  });
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [subscription, setSubscription] = useState<BranchSubscription | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocationForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggingLogo, setDraggingLogo] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (tenantLoading) return;
      if (!activeRestaurant?.id) {
        setDetails(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setSubscriptionError(null);

      try {
        let nextDetails: RestaurantDetails;
        if (supabase) {
          const { data, error } = await supabase
            .from("restaurants")
            .select(
              "id, name, slug, status, owner_phone, restaurant_type, language, opening_hours, smart_open_enabled, primary_branch_id, organization_id",
            )
            .eq("id", activeRestaurant.id)
            .maybeSingle();

          if (error) throw error;
          if (!data) throw new Error("Restaurantdaten konnten nicht gefunden werden.");
          nextDetails = data as RestaurantDetails;
        } else {
          nextDetails = activeRestaurant as RestaurantDetails;
        }

        if (cancelled) return;
        setDetails(nextDetails);
        setRestaurantForm({
          name: nextDetails.name ?? "",
          ownerPhone: nextDetails.owner_phone ?? "",
        });
        setOpeningHours(normalizeOpeningHours(nextDetails.opening_hours));

        if (supabase) {
          const { data: locationData, error: locationError } = await supabase
            .from("branches")
            .select("id, address, postal_code, city, country, latitude, longitude, is_discoverable, public_short_description, public_cover_image_url")
            .eq("restaurant_id", nextDetails.id)
            .limit(1)
            .maybeSingle();
          if (locationError) throw locationError;
          setPartnerLocation(locationData ? {
            id: locationData.id,
            address: locationData.address ?? "",
            postalCode: locationData.postal_code ?? "",
            city: locationData.city ?? "",
            country: locationData.country ?? "AT",
            latitude: locationData.latitude === null ? "" : String(locationData.latitude),
            longitude: locationData.longitude === null ? "" : String(locationData.longitude),
            isDiscoverable: Boolean(locationData.is_discoverable),
            shortDescription: locationData.public_short_description ?? "",
            coverImageUrl: locationData.public_cover_image_url ?? "",
          } : null);
        } else {
          setPartnerLocation(null);
        }

        try {
          const nextSubscription = await loadPrimarySubscription(nextDetails);
          if (!cancelled) setSubscription(nextSubscription);
        } catch (error) {
          console.error("Abo-Daten konnten nicht geladen werden.", error);
          if (!cancelled) {
            setSubscription(null);
            setSubscriptionError("Abo-Daten konnten gerade nicht geladen werden.");
          }
        }
      } catch (error) {
        console.error("Einstellungen konnten nicht geladen werden.", error);
        if (!cancelled) {
          setDetails(null);
          setErrorMessage("Einstellungen konnten nicht geladen werden.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [activeRestaurant, tenantLoading]);

  useEffect(() => {
    setBrandingForm({
      logoUrl: branding?.logo_url ?? "",
      primaryColor: branding?.primary_color ?? "#0f766e",
      secondaryColor: branding?.secondary_color ?? "#f4a261",
      buttonColor: branding?.button_color ?? "#0f766e",
    });
  }, [branding?.button_color, branding?.logo_url, branding?.primary_color, branding?.secondary_color]);

  async function saveRestaurantData(event: FormEvent) {
    event.preventDefault();
    if (!details?.id) return;

    setSaving(true);
    setStatus(null);
    setErrorMessage(null);

    try {
      if (supabase) {
        const { error } = await supabase
          .from("restaurants")
          .update({
            name: restaurantForm.name.trim(),
            owner_phone: restaurantForm.ownerPhone.trim() || null,
          })
          .eq("id", details.id);

        if (error) throw error;
      }

      setDetails((current) =>
        current
          ? { ...current, name: restaurantForm.name.trim(), owner_phone: restaurantForm.ownerPhone.trim() || null }
          : current,
      );
      await refreshTenants();
      setStatus("Restaurantdaten gespeichert.");
    } catch (error) {
      console.error("Restaurantdaten konnten nicht gespeichert werden.", error);
      setErrorMessage("Restaurantdaten konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOpeningHours(event: FormEvent) {
    event.preventDefault();
    if (!details?.id) return;

    const invalidDay = weekdays.find(({ key }) => validateOpeningDay(openingHours[key]));
    if (invalidDay) {
      setErrorMessage(`${invalidDay.label}: ${validateOpeningDay(openingHours[invalidDay.key])}`);
      document.getElementById(`settings-${invalidDay.key}-open`)?.focus();
      return;
    }

    setSaving(true);
    setStatus(null);
    setErrorMessage(null);

    try {
      if (supabase) {
        const { error } = await supabase
          .from("restaurants")
          .update({ opening_hours: openingHours })
          .eq("id", details.id);

        if (error) throw error;
      }

      setDetails((current) => (current ? { ...current, opening_hours: openingHours } : current));
      await refreshTenants();
      setStatus("Öffnungszeiten gespeichert.");
    } catch (error) {
      console.error("Öffnungszeiten konnten nicht gespeichert werden.", error);
      setErrorMessage("Öffnungszeiten konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function savePartnerLocation(event: FormEvent) {
    event.preventDefault();
    if (!details?.id || !partnerLocation) return;

    const latitude = Number(partnerLocation.latitude);
    const longitude = Number(partnerLocation.longitude);
    const coordinatesValid = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    const publicDetailsComplete = Boolean(partnerLocation.address.trim() && partnerLocation.postalCode.trim() && partnerLocation.city.trim());

    if (!coordinatesValid) {
      setErrorMessage("Bitte gib eine gültige Kartenposition ein.");
      return;
    }
    if (partnerLocation.isDiscoverable && (!publicDetailsComplete || details.status !== "active")) {
      setErrorMessage("Für die Sichtbarkeit müssen Adresse, PLZ und Ort vollständig sein und das Restaurant aktiv sein.");
      return;
    }

    setSaving(true);
    setStatus(null);
    setErrorMessage(null);
    try {
      if (!supabase) throw new Error("Live-Daten sind nicht verbunden.");
      const { error } = await supabase
        .from("branches")
        .update({
          address: partnerLocation.address.trim(),
          postal_code: partnerLocation.postalCode.trim(),
          city: partnerLocation.city.trim(),
          country: partnerLocation.country.trim().toUpperCase() || "AT",
          latitude,
          longitude,
          is_discoverable: partnerLocation.isDiscoverable,
          public_short_description: partnerLocation.shortDescription.trim() || null,
          public_cover_image_url: partnerLocation.coverImageUrl.trim() || null,
        })
        .eq("id", partnerLocation.id)
        .eq("restaurant_id", details.id);
      if (error) throw error;
      setStatus("Standort für die Restaurantsuche gespeichert.");
    } catch (error) {
      console.error("Standort konnte nicht gespeichert werden.", error);
      setErrorMessage("Standort konnte gerade nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBranding(event?: FormEvent) {
    event?.preventDefault();
    if (!details?.id) return;

    setSaving(true);
    setStatus(null);
    setErrorMessage(null);

    try {
      if (supabase) {
        const { error } = await supabase.from("restaurant_branding").upsert(
          {
            restaurant_id: details.id,
            logo_url: brandingForm.logoUrl || null,
            primary_color: brandingForm.primaryColor,
            secondary_color: brandingForm.secondaryColor,
            button_color: brandingForm.buttonColor,
            font_family: branding?.font_family ?? "Inter",
          },
          { onConflict: "restaurant_id" },
        );

        if (error) throw error;
      }

      await refreshTenants();
      setStatus("Branding gespeichert.");
    } catch (error) {
      console.error("Branding konnte nicht gespeichert werden.", error);
      setErrorMessage("Branding konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!details?.id) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    const maxSize = 5 * 1024 * 1024;

    setStatus(null);
    setErrorMessage(null);

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Bitte wähle PNG, JPG, JPEG oder SVG.");
      return;
    }

    if (file.size > maxSize) {
      setErrorMessage("Das Logo darf maximal 5 MB groß sein.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setLogoPreviewUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return previewUrl;
    });
    setStatus("Logo ausgewählt. Vorschau ist sofort aktiv.");

    if (!supabase) return;

    try {
      const path = `${details.id}/branding/logo-${Date.now()}.${fileExtension(file)}`;
      const { error } = await supabase.storage.from("restaurant-media").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (error) throw error;

      const { data } = supabase.storage.from("restaurant-media").getPublicUrl(path);
      setLogoPreviewUrl("");
      setBrandingForm((current) => ({ ...current, logoUrl: data.publicUrl }));

      const { error: brandingError } = await supabase.from("restaurant_branding").upsert(
        {
          restaurant_id: details.id,
          logo_url: data.publicUrl,
          primary_color: brandingForm.primaryColor,
          secondary_color: brandingForm.secondaryColor,
          button_color: brandingForm.buttonColor,
          font_family: branding?.font_family ?? "Inter",
        },
        { onConflict: "restaurant_id" },
      );

      if (brandingError) throw brandingError;
      await refreshTenants();
      setStatus("Logo gespeichert.");
    } catch (error) {
      console.error("Logo konnte nicht gespeichert werden.", error);
      setErrorMessage("Logo bleibt als Vorschau sichtbar. Speichern ist gerade nicht möglich.");
    }
  }

  function handleLogoInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) uploadLogo(file);
    event.target.value = "";
  }

  function handleLogoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingLogo(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadLogo(file);
  }

  function updateOpeningDay(day: Weekday, patch: Partial<OpeningDay>) {
    setOpeningHours((current) => ({
      ...current,
      [day]: { ...current[day], ...patch },
    }));
  }

  const currentLogoUrl = logoPreviewUrl || brandingForm.logoUrl;
  const trialDays = remainingTrialDays(subscription?.trial_ends_at);
  const currentSubscriptionStatus = subscription?.subscription_status ?? subscription?.status ?? null;
  const trialExpired = currentSubscriptionStatus === "trialing" && isDatePast(subscription?.trial_ends_at);
  const trialActive = currentSubscriptionStatus === "trialing" && !trialExpired;
  const subscriptionActive = currentSubscriptionStatus === "active";

  if (loading || tenantLoading) {
    return (
      <section className="card settings-detail-card">
        <h1>Einstellungen</h1>
        <p className="muted">Einstellungen werden geladen...</p>
      </section>
    );
  }

  if (!details) {
    return (
      <section className="card settings-detail-card">
        <h1>Einstellungen</h1>
        <p className="status-message error">{errorMessage ?? "Restaurantdaten konnten nicht geladen werden."}</p>
      </section>
    );
  }

  if (section === "restaurantdaten") {
    return (
      <>
        <SettingsHeader title="Restaurantdaten" description="Passe die wichtigsten Angaben deines Restaurants an." />
        <section className="card settings-detail-card">
          <form className="form" onSubmit={saveRestaurantData}>
            <RequiredFieldsNote />
            <div className="field">
              <FormLabel htmlFor="restaurant-name" required>Restaurantname</FormLabel>
              <input
                aria-required="true"
                className="input"
                id="restaurant-name"
                required
                value={restaurantForm.name}
                onChange={(event) => setRestaurantForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="field">
              <FormLabel htmlFor="restaurant-phone" optional>Telefon</FormLabel>
              <input
                className="input"
                id="restaurant-phone"
                placeholder="Noch nicht eingerichtet"
                value={restaurantForm.ownerPhone}
                onChange={(event) => setRestaurantForm((current) => ({ ...current, ownerPhone: event.target.value }))}
              />
            </div>
            <div className="settings-meta-grid">
              <InfoValue label="Restaurant-Link" value={details.slug} />
              <InfoValue label="Status" value={details.status === "active" ? "Aktiv" : details.status === "draft" ? "Entwurf" : "Pausiert"} />
              <InfoValue label="Sprache" value={details.language === "de" ? "Deutsch" : details.language ?? "Deutsch"} />
            </div>
            <FormActions saving={saving} submitLabel="Speichern" />
          </form>
        </section>
        <StatusMessages errorMessage={errorMessage} status={status} />
      </>
    );
  }

  if (section === "aussehen") {
    return (
      <>
        <SettingsHeader title="Branding" description="Logo und Darstellung deines Bonusprogramms." />
        <section className="card settings-detail-card">
          <form className="form" onSubmit={saveBranding}>
            <RequiredFieldsNote />
            <div className="settings-logo-row">
              <div
                className={`logo-dropzone${draggingLogo ? " active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDraggingLogo(true);
                }}
                onDragLeave={() => setDraggingLogo(false)}
                onDrop={handleLogoDrop}
              >
                <input
                  ref={logoInputRef}
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  className="visually-hidden"
                  onChange={handleLogoInputChange}
                  type="file"
                />
                <div className="logo-preview-box settings-logo-preview">
                  {currentLogoUrl ? <img alt={`${details.name} Logo`} src={currentLogoUrl} /> : <span>{details.name.charAt(0)}</span>}
                </div>
                <button className="button secondary" onClick={() => logoInputRef.current?.click()} type="button">
                  <ImageUp size={18} />
                  Logo auswählen
                </button>
                <p className="muted">PNG, JPG, JPEG oder SVG. Maximal 5 MB.</p>
              </div>
              <div className="settings-info-card">
                <h2>Aktuelles Branding</h2>
                <p className="muted">Diese Darstellung wird für Gäste-App, QR-Material und Highlights verwendet.</p>
              </div>
            </div>
            <div className="grid two">
              <div className="field">
                <FormLabel htmlFor="primary-color" required>Markenfarbe</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="primary-color"
                  required
                  type="color"
                  value={brandingForm.primaryColor}
                  onChange={(event) => setBrandingForm((current) => ({ ...current, primaryColor: event.target.value }))}
                />
              </div>
              <div className="field">
                <FormLabel htmlFor="button-color" required>Buttonfarbe</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="button-color"
                  required
                  type="color"
                  value={brandingForm.buttonColor}
                  onChange={(event) => setBrandingForm((current) => ({ ...current, buttonColor: event.target.value }))}
                />
              </div>
            </div>
            <FormActions saving={saving} submitLabel="Branding speichern" />
          </form>
        </section>
        <StatusMessages errorMessage={errorMessage} status={status} />
      </>
    );
  }

  if (section === "oeffnungszeiten") {
    return (
      <>
        <SettingsHeader title="Öffnungszeiten" description="Lege fest, wann dein Restaurant geöffnet ist." />
        <section className="card settings-detail-card">
          <form className="form" onSubmit={saveOpeningHours}>
            <RequiredFieldsNote />
            <div className="settings-hours-grid">
              {weekdays.map(({ key, label }) => (
                <OpeningHoursEditor dayLabel={label} idPrefix={`settings-${key}`} key={key} onChange={(patch) => updateOpeningDay(key, patch)} value={openingHours[key]} />
              ))}
            </div>
            <FormActions saving={saving} submitLabel="Öffnungszeiten speichern" />
          </form>
        </section>
        <StatusMessages errorMessage={errorMessage} status={status} />
      </>
    );
  }

  if (section === "standort") {
    const latitude = Number(partnerLocation?.latitude);
    const longitude = Number(partnerLocation?.longitude);
    const previewAvailable = partnerLocation && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    const previewLocation: PartnerRestaurant | null = previewAvailable ? {
      restaurant_id: details.id,
      branch_id: partnerLocation.id,
      name: details.name,
      slug: details.slug,
      address: partnerLocation.address,
      postal_code: partnerLocation.postalCode,
      city: partnerLocation.city,
      country: partnerLocation.country,
      latitude,
      longitude,
      logo_url: branding?.logo_url ?? null,
      cover_image_url: partnerLocation.coverImageUrl || null,
      short_description: partnerLocation.shortDescription || null,
      opening_hours: details.opening_hours,
      welcome_reward_available: false,
      active_reward_count: 0,
      membership: null,
      distance_km: null,
    } : null;

    return (
      <>
        <SettingsHeader title="Standort & Restaurantsuche" description="Lege fest, wie dein Restaurant für Gäste auf der Partnerkarte erscheint." />
        <section className="card settings-detail-card">
          {partnerLocation ? (
            <form className="form" onSubmit={savePartnerLocation}>
              {partnerLocation.isDiscoverable ? <RequiredFieldsNote /> : null}
              <div className="grid two">
                <div className="field"><FormLabel htmlFor="location-address" optional={!partnerLocation.isDiscoverable} required={partnerLocation.isDiscoverable}>Adresse</FormLabel><input aria-required={partnerLocation.isDiscoverable || undefined} className="input" id="location-address" onChange={(event) => setPartnerLocation((current) => current ? { ...current, address: event.target.value } : current)} required={partnerLocation.isDiscoverable} value={partnerLocation.address} /></div>
                <div className="field"><FormLabel htmlFor="location-postal-code" optional={!partnerLocation.isDiscoverable} required={partnerLocation.isDiscoverable}>Postleitzahl</FormLabel><input aria-required={partnerLocation.isDiscoverable || undefined} className="input" id="location-postal-code" inputMode="numeric" onChange={(event) => setPartnerLocation((current) => current ? { ...current, postalCode: event.target.value } : current)} required={partnerLocation.isDiscoverable} value={partnerLocation.postalCode} /></div>
                <div className="field"><FormLabel htmlFor="location-city" optional={!partnerLocation.isDiscoverable} required={partnerLocation.isDiscoverable}>Ort</FormLabel><input aria-required={partnerLocation.isDiscoverable || undefined} className="input" id="location-city" onChange={(event) => setPartnerLocation((current) => current ? { ...current, city: event.target.value } : current)} required={partnerLocation.isDiscoverable} value={partnerLocation.city} /></div>
                <div className="field"><FormLabel htmlFor="location-country" optional={!partnerLocation.isDiscoverable} required={partnerLocation.isDiscoverable}>Land</FormLabel><input aria-required={partnerLocation.isDiscoverable || undefined} className="input" id="location-country" maxLength={2} onChange={(event) => setPartnerLocation((current) => current ? { ...current, country: event.target.value } : current)} required={partnerLocation.isDiscoverable} value={partnerLocation.country} /></div>
                <div className="field"><FormLabel htmlFor="location-latitude" optional={!partnerLocation.isDiscoverable} required={partnerLocation.isDiscoverable}>Breitengrad</FormLabel><input aria-required={partnerLocation.isDiscoverable || undefined} className="input" id="location-latitude" inputMode="decimal" onChange={(event) => setPartnerLocation((current) => current ? { ...current, latitude: event.target.value } : current)} placeholder="48.208174" required={partnerLocation.isDiscoverable} value={partnerLocation.latitude} /></div>
                <div className="field"><FormLabel htmlFor="location-longitude" optional={!partnerLocation.isDiscoverable} required={partnerLocation.isDiscoverable}>Längengrad</FormLabel><input aria-required={partnerLocation.isDiscoverable || undefined} className="input" id="location-longitude" inputMode="decimal" onChange={(event) => setPartnerLocation((current) => current ? { ...current, longitude: event.target.value } : current)} placeholder="16.373819" required={partnerLocation.isDiscoverable} value={partnerLocation.longitude} /></div>
              </div>
              <div className="field"><FormLabel htmlFor="location-description" optional>Öffentliche Kurzbeschreibung</FormLabel><textarea className="input settings-location-description" id="location-description" maxLength={280} onChange={(event) => setPartnerLocation((current) => current ? { ...current, shortDescription: event.target.value } : current)} value={partnerLocation.shortDescription} /></div>
              <div className="field"><FormLabel htmlFor="location-cover" optional>Öffentliches Bild (HTTPS-Adresse)</FormLabel><input className="input" id="location-cover" onChange={(event) => setPartnerLocation((current) => current ? { ...current, coverImageUrl: event.target.value } : current)} placeholder="https://…" type="url" value={partnerLocation.coverImageUrl} /></div>
              <label className="settings-location-toggle"><input checked={partnerLocation.isDiscoverable} onChange={(event) => setPartnerLocation((current) => current ? { ...current, isDiscoverable: event.target.checked } : current)} type="checkbox" /><span><strong>In Restaurantsuche sichtbar</strong><small>Nur aktive Restaurants mit vollständiger Adresse und gültiger Kartenposition werden öffentlich angezeigt.</small></span></label>
              {previewLocation ? (
                <div className="settings-location-preview"><h2>Markervorschau</h2><LazyPartnerRestaurantMap locations={[previewLocation]} onSelect={() => undefined} selectedId={previewLocation.branch_id} userLocation={null} /></div>
              ) : <p className="muted">Gib gültige Koordinaten ein, um die Kartenposition zu prüfen.</p>}
              <FormActions saving={saving} submitLabel="Standort speichern" />
            </form>
          ) : <p className="status-message error">Für dieses Restaurant wurde kein primärer Standort gefunden.</p>}
        </section>
        <StatusMessages errorMessage={errorMessage} status={status} />
      </>
    );
  }

  if (section === "bonusprogramm") {
    return (
      <>
        <SettingsHeader title="Bonusprogramm" description="Verwalte die echten Bereiche deines Bonusprogramms." />
        <section className="grid two">
          <SettingsLinkCard
            description="Lege Produkte fest, die Gäste mit Punkten einlösen können."
            icon={ShoppingBag}
            label="Punkteeinlösung verwalten"
            title="Punkteeinlösung"
            to="/admin/rewards"
          />
          <SettingsLinkCard
            description="Lege fest, welche Geschenke neue Gäste erhalten können."
            icon={Gift}
            label="Willkommensgeschenke verwalten"
            title="Willkommensgeschenke"
            to="/admin/welcome-gifts"
          />
          <SettingsLinkCard
            description="Plane letzte Punktevergabe, Kundenhinweis und Einlösefrist."
            icon={Scale}
            label="Programmende sicher planen"
            title="Bonusprogramm beenden"
            to="/admin/settings/program-end"
          />
        </section>
      </>
    );
  }

  if (section === "konto-testphase") {
    return (
      <>
        <SettingsHeader title="Abo & Testphase" description="Aktueller Status deines Restaurantkontos." />
        <section className="card settings-detail-card">
          {subscriptionError ? (
            <p className="status-message error">{subscriptionError}</p>
          ) : subscription ? (
            <>
              <div className="settings-subscription-hero">
                <span className={`settings-status-badge${subscriptionActive ? " success" : trialExpired ? " warning" : ""}`}>
                  {subscriptionActive ? "Abo aktiv" : trialExpired ? "Testphase abgelaufen" : "Testphase aktiv"}
                </span>
                <h2>
                  {subscriptionActive
                    ? "Dein Restaurant-Bonusprogramm ist aktiv."
                    : trialExpired
                      ? "Deine kostenlose Testphase ist abgelaufen."
                      : "Du nutzt WUXUAI Bonus kostenlos."}
                </h2>
                {trialActive ? (
                  <p>Noch {trialDays ?? 0} Tage kostenlos.</p>
                ) : trialExpired ? (
                  <p>Nach der Testphase kannst du dein Monatsabo aktivieren.</p>
                ) : (
                  <p>Plan: Restaurant Bonus</p>
                )}
              </div>
              <div className="settings-meta-grid">
                <InfoValue label="Abo-Status" value={subscriptionLabels[currentSubscriptionStatus ?? ""] ?? "Nicht gesetzt"} />
                <InfoValue
                  label="Zahlungsstatus"
                  value={subscription.payment_status ? paymentLabels[subscription.payment_status] : "Zahlung wird bald aktiviert"}
                />
                <InfoValue label="Plan" value={subscription.plan_key === "pilot" ? "Monatsabo nach Testphase" : subscription.plan_key || "Monatsabo nach Testphase"} />
                <InfoValue label="Testphase Start" value={formatDate(subscription.trial_started_at)} />
                <InfoValue label="Testphase Ende" value={formatDate(subscription.trial_ends_at)} />
                <InfoValue label="Verbleibende Tage" value={trialDays === null ? "Nicht gesetzt" : `${trialDays} Tage`} />
              </div>
              <div className="settings-subscription-note">
                <p>Keine Kreditkarte in der Testphase.</p>
                <p>Zahlung wird bald aktiviert.</p>
              </div>
              {trialExpired ? (
                <button className="button secondary" disabled type="button">
                  Abo aktivieren
                </button>
              ) : null}
            </>
          ) : (
            <div className="settings-info-card">
              <h2>Kein Abo eingerichtet</h2>
              <p className="muted">Die Testphase wird automatisch eingerichtet, sobald dein Restaurantkonto bereit ist.</p>
              <p className="muted">Zahlung wird bald aktiviert.</p>
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Einstellungen</h1>
          <p className="muted">{details.name} verwalten.</p>
        </div>
      </header>

      <section className="grid two">
        <SettingsLinkCard
          description="Impressum, Teilnahmebedingungen, Datenschutz und Programmende."
          icon={Scale}
          label="Rechtliche Bereitschaft prüfen"
          title="Rechtliches & Datenschutz"
          to="/admin/legal"
        />
        <SettingsLinkCard
          description="Passe die wichtigsten Angaben deines Restaurants an."
          icon={Building2}
          label="Restaurantdaten bearbeiten"
          title="Restaurantdaten"
          to="/admin/settings/restaurantdaten"
        />
        <SettingsLinkCard
          description="Logo und Darstellung deines Bonusprogramms."
          icon={Palette}
          label="Branding bearbeiten"
          title="Branding"
          to="/admin/settings/aussehen"
        />
        <SettingsLinkCard
          description="Lege fest, wann dein Restaurant geöffnet ist."
          icon={Clock}
          label="Öffnungszeiten bearbeiten"
          title="Öffnungszeiten"
          to="/admin/settings/oeffnungszeiten"
        />
        <SettingsLinkCard
          description="Adresse, Kartenposition und Sichtbarkeit für die Partnersuche."
          icon={MapPinned}
          label="Standort bearbeiten"
          title="Standort & Restaurantsuche"
          to="/admin/settings/standort"
        />
        <SettingsLinkCard
          description="Lege Produkte fest, die Gäste mit Punkten einlösen können."
          icon={ShoppingBag}
          label="Punkteeinlösung verwalten"
          title="Punkteeinlösung"
          to="/admin/rewards"
        />
        <SettingsLinkCard
          description="Lege fest, welche Geschenke neue Gäste erhalten können."
          icon={Gift}
          label="Willkommensgeschenke verwalten"
          title="Willkommensgeschenke"
          to="/admin/welcome-gifts"
        />
        <SettingsLinkCard
          description="Öffne den Mitarbeiterbereich und sieh die heutige Tages-PIN."
          icon={KeyRound}
          label="Mitarbeiterbereich öffnen"
          title="Mitarbeiter & Tages-PIN"
          to="/admin/staff"
        />
        <SettingsLinkCard
          description="Drucke QR-Codes und Starter Kit für dein Restaurant."
          icon={QrCode}
          label="QR Center öffnen"
          title="QR & Starter Kit"
          to="/admin/qr"
        />
        <SettingsLinkCard
          description="Sieh Testphase, Abo-Status und Zahlungsstatus."
          icon={CreditCard}
          label="Abo & Testphase ansehen"
          title="Abo & Testphase"
          to="/admin/settings/konto-testphase"
        />
      </section>
    </>
  );
}

function SettingsHeader({ description, title }: { description: string; title: string }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <Link className="button secondary" to="/admin/settings">
        <ArrowLeft size={18} />
        Zurück
      </Link>
    </header>
  );
}

function SettingsLinkCard({
  description,
  icon: Icon,
  label,
  title,
  to,
}: {
  description: string;
  icon: typeof Building2;
  label: string;
  title: string;
  to: string;
}) {
  return (
    <Link className="card settings-nav-card" to={to}>
      <div className="row-between">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span className="icon-badge">
          <Icon size={22} />
        </span>
      </div>
      <span className="settings-card-action">
        {label}
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}

function InfoValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-info-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FormActions({ saving, submitLabel }: { saving: boolean; submitLabel: string }) {
  return (
    <div className="settings-page-actions">
      <Link className="button secondary" to="/admin/settings">
        Abbrechen
      </Link>
      <button className="button" disabled={saving} type="submit">
        <Save size={18} />
        {saving ? "Speichern..." : submitLabel}
      </button>
    </div>
  );
}

function StatusMessages({ errorMessage, status }: { errorMessage: string | null; status: string | null }) {
  return (
    <>
      {status ? <p className="status-message" role="status">{status}</p> : null}
      {errorMessage ? <p className="status-message error" role="alert">{errorMessage}</p> : null}
    </>
  );
}
