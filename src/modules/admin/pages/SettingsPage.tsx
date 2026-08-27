import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock,
  CreditCard,
  Gift,
  ImageUp,
  Info,
  KeyRound,
  LoaderCircle,
  MapPinned,
  Minus,
  Scale,
  Palette,
  Plus,
  QrCode,
  ScanLine,
  Save,
  ShoppingBag,
  RotateCcw,
  Users,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../../shared/lib/supabase";
import type { BranchSubscription, PointsCollectionMode, Restaurant } from "../../../shared/types/domain";
import { useTenant } from "../../tenant/TenantProvider";
import { LazyPartnerRestaurantMap } from "../../customer/LazyPartnerRestaurantMap";
import type { PartnerRestaurant } from "../../customer/partnerRestaurantService";
import { normalizeOpeningDay, validateOpeningDay, type OpeningDay } from "../../../shared/openingHours.mjs";
import { OpeningHoursEditor } from "../../../shared/components/OpeningHoursEditor";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { RestaurantLogoStage } from "../../../shared/components/RestaurantLogoStage";
import {
  defaultLogoPresentation,
  logoPresentationAfterEditorDrag,
  logoPresentationAtRelativeScale,
  relativeLogoScale,
  transparentContentAdjustment,
  type LogoPresentation,
} from "../../../shared/logoPresentation.mjs";
import { loadLoyaltySettings, updatePointsCollectionSettings } from "../../loyalty/loyaltyService";
import {
  geocodeOwnerLocation,
  OwnerLocationGeocodingError,
  ownerLocationAddressKey,
  type OwnerLocationCandidate,
} from "../ownerLocationGeocodingService";

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

type GeocodingStatus = "idle" | "searching" | "found" | "ambiguous" | "not_found" | "stale" | "error" | "rate_limited";

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

async function inspectLogoBlob(blob: Blob, enforceMinimumSize: boolean) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Das Logo konnte nicht gelesen werden."));
      nextImage.src = url;
    });
    if (enforceMinimumSize && image.naturalWidth < 512 && image.naturalHeight < 512) {
      throw new Error("Bitte verwende ein Logo mit mindestens 512 Pixeln Breite oder Höhe.");
    }

    const maxDimension = 420;
    const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { adjustment: null, height: image.naturalHeight, width: image.naturalWidth };
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let right = -1;
    let top = canvas.height;
    let bottom = -1;
    let transparentPixelFound = false;
    const cornerIndexes = [0, canvas.width - 1, (canvas.height - 1) * canvas.width, canvas.width * canvas.height - 1];
    const cornerColors = cornerIndexes.map((index) => {
      const offset = index * 4;
      return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    });
    const background = cornerColors[0];
    const lightNeutralBackground = background.every((channel) => channel >= 235)
      && Math.max(...background) - Math.min(...background) <= 14
      && cornerColors.every((color) => color.every((channel, index) => Math.abs(channel - background[index]) <= 18));
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const alpha = pixels[offset + 3];
        if (alpha <= 10) {
          transparentPixelFound = true;
          continue;
        }
        if (lightNeutralBackground) {
          const distance = Math.max(
            Math.abs(pixels[offset] - background[0]),
            Math.abs(pixels[offset + 1] - background[1]),
            Math.abs(pixels[offset + 2] - background[2]),
          );
          if (distance <= 24) continue;
        }
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    const adjustment = (transparentPixelFound || lightNeutralBackground) && right >= left && bottom >= top
      ? transparentContentAdjustment({ bottom, left, right, top }, canvas.width, canvas.height)
      : null;
    return { adjustment, height: image.naturalHeight, width: image.naturalWidth };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function inspectLogoFile(file: File) {
  return inspectLogoBlob(file, true);
}

async function inspectLogoUrl(url: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("Das gespeicherte Logo konnte nicht geprüft werden.");
  return inspectLogoBlob(await response.blob(), false);
}

type BrandingLogoEditorProps = {
  adjustment: LogoPresentation | null;
  logoUrl: string;
  name: string;
  onChange: (presentation: LogoPresentation) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  presentation: LogoPresentation;
  primaryColor: string;
  saving: boolean;
};

function BrandingLogoEditor({ adjustment, logoUrl, name, onChange, onClose, onSave, open, presentation, primaryColor, saving }: BrandingLogoEditorProps) {
  const openingPresentationRef = useRef(presentation);
  const wasOpenRef = useRef(false);
  const presentationRef = useRef(presentation);
  const autoFitBaselineRef = useRef(adjustment ?? { ...defaultLogoPresentation });
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<
    | { mode: "drag"; pointerId: number; startX: number; startY: number; presentation: LogoPresentation }
    | { mode: "pinch"; startDistance: number; startRelativeScale: number }
    | null
  >(null);
  const [autoFitBaseline, setAutoFitBaseline] = useState<LogoPresentation>(adjustment ?? { ...defaultLogoPresentation });
  const [imageMetrics, setImageMetrics] = useState({ aspect: "wide" as "wide" | "tall" | "square", ratio: 2 });
  const [interacting, setInteracting] = useState(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) openingPresentationRef.current = presentation;
    wasOpenRef.current = open;
  }, [open, presentation]);

  useEffect(() => {
    presentationRef.current = presentation;
  }, [presentation]);

  useEffect(() => {
    autoFitBaselineRef.current = autoFitBaseline;
  }, [autoFitBaseline]);

  useEffect(() => {
    if (open) return;
    activePointersRef.current.clear();
    gestureRef.current = null;
    setInteracting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (adjustment) {
      setAutoFitBaseline(adjustment);
      return;
    }
    setAutoFitBaseline({ ...defaultLogoPresentation });
    if (!logoUrl || logoUrl.startsWith("blob:")) return;
    let cancelled = false;
    void inspectLogoUrl(logoUrl)
      .then((inspection) => {
        if (!cancelled) setAutoFitBaseline(inspection.adjustment ?? { ...defaultLogoPresentation });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [adjustment, logoUrl, open]);

  const setManual = (patch: Partial<LogoPresentation>) => onChange({ ...presentation, ...patch, fitMode: "manual" });
  const relativeScale = relativeLogoScale(presentation, autoFitBaseline);
  const adjustRelativeScale = (delta: number) => {
    const nextFactor = Math.max(0.01, Math.round((relativeScale + delta) * 20) / 20);
    onChange(logoPresentationAtRelativeScale(presentation, autoFitBaseline, nextFactor));
  };
  const applyAutoFit = () => onChange({ ...autoFitBaselineRef.current });
  const beginPointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setInteracting(true);
    const pointers = [...activePointersRef.current.entries()];
    if (pointers.length === 1) {
      gestureRef.current = {
        mode: "drag",
        pointerId: event.pointerId,
        presentation: presentationRef.current,
        startX: event.clientX,
        startY: event.clientY,
      };
      return;
    }
    const [, first] = pointers[0];
    const [, second] = pointers[1];
    gestureRef.current = {
      mode: "pinch",
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      startRelativeScale: relativeLogoScale(presentationRef.current, autoFitBaselineRef.current),
    };
  };
  const movePointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    const pointers = [...activePointersRef.current.values()];
    if (gesture?.mode === "pinch" && pointers.length >= 2) {
      const distance = Math.max(1, Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y));
      onChange(logoPresentationAtRelativeScale(
        presentationRef.current,
        autoFitBaselineRef.current,
        gesture.startRelativeScale * (distance / gesture.startDistance),
      ));
      return;
    }
    if (gesture?.mode === "drag" && gesture.pointerId === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      onChange(logoPresentationAfterEditorDrag(
        gesture.presentation,
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
        bounds.width,
        bounds.height,
      ));
    }
  };
  const finishPointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = [...activePointersRef.current.entries()];
    if (remaining.length === 1) {
      const [pointerId, pointer] = remaining[0];
      gestureRef.current = {
        mode: "drag",
        pointerId,
        presentation: presentationRef.current,
        startX: pointer.x,
        startY: pointer.y,
      };
      return;
    }
    if (remaining.length === 0) {
      gestureRef.current = null;
      setInteracting(false);
    }
  };
  const zoomWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 || event.deltaX > 0 ? -0.05 : 0.05;
    const currentScale = relativeLogoScale(presentationRef.current, autoFitBaselineRef.current);
    onChange(logoPresentationAtRelativeScale(
      presentationRef.current,
      autoFitBaselineRef.current,
      currentScale + direction,
    ));
  };
  const handleEditorKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.05 : 0.01;
    const deltaX = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const deltaY = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    setManual({
      positionX: Math.min(1, Math.max(0, presentationRef.current.positionX + deltaX)),
      positionY: Math.min(1, Math.max(0, presentationRef.current.positionY + deltaY)),
    });
  };
  const previewProps = { logoUrl, name, presentation, primaryColor };
  const cancelEditor = () => {
    onChange(openingPresentationRef.current);
    onClose();
  };

  return (
    <AppDrawer
      className="branding-logo-drawer"
      description="Positioniere dein Logo direkt in der Vorschau."
      footer={(
        <>
          <button className="button secondary" disabled={saving} onClick={cancelEditor} type="button">Abbrechen</button>
          <button className="button branding-logo-save" disabled={saving} onClick={onSave} type="button"><Save size={18} /> {saving ? "Wird gespeichert…" : "Anpassung speichern"}</button>
        </>
      )}
      onClose={cancelEditor}
      open={open}
      size="workspace"
      title="Logo anpassen"
    >
      <div className="branding-logo-editor">
        <section className="branding-logo-live" aria-labelledby="branding-logo-live-title">
          <header className="branding-logo-section-heading">
            <h3 id="branding-logo-live-title">1. Live-Vorschau</h3>
            <p id="branding-logo-gesture-help"><Info aria-hidden="true" size={16} /><span className="branding-logo-help-desktop">Ziehe das Logo zum Positionieren. Zoome mit Trackpad/Maus oder +/−.</span><span className="branding-logo-help-mobile">Ziehe das Logo. Mit zwei Fingern kannst du zoomen.</span></p>
          </header>
          <div className="branding-logo-live-stage">
            <div
              aria-describedby="branding-logo-gesture-help"
              aria-label="Logo positionieren"
              className={`branding-logo-safe-area aspect-${imageMetrics.aspect}${interacting ? " is-interacting" : ""}`}
              onDoubleClick={applyAutoFit}
              onKeyDown={handleEditorKeys}
              onPointerCancel={finishPointerGesture}
              onPointerDown={beginPointerGesture}
              onPointerMove={movePointerGesture}
              onPointerUp={finishPointerGesture}
              onWheel={zoomWithWheel}
              role="group"
              style={{ "--branding-logo-source-ratio": imageMetrics.ratio } as React.CSSProperties}
              tabIndex={0}
            >
              <RestaurantLogoStage {...previewProps} className="branding-logo-editor-main" onImageMetrics={setImageMetrics} size="preview" />
              <div className="branding-logo-zoom-controls" onPointerDown={(event) => event.stopPropagation()}>
                <button aria-label="Logo verkleinern" onClick={() => adjustRelativeScale(-0.05)} type="button"><Minus aria-hidden="true" size={17} /></button>
                <output aria-live="polite">Zoom {Math.round(relativeScale * 100)} %</output>
                <button aria-label="Logo vergrößern" onClick={() => adjustRelativeScale(0.05)} type="button"><Plus aria-hidden="true" size={17} /></button>
              </div>
            </div>
            <span className="branding-logo-safe-area-label">Sicherheitsbereich</span>
          </div>
          <div className="branding-logo-editor-actions">
            <button className="button secondary" onClick={applyAutoFit} type="button"><RotateCcw size={18} /> Automatisch einpassen</button>
            <button className="button secondary" onClick={() => onChange(openingPresentationRef.current)} type="button"><RotateCcw size={18} /> Zurücksetzen</button>
          </div>
        </section>

        <section aria-labelledby="logo-context-preview-title" className="branding-logo-contexts">
          <div><h3 id="logo-context-preview-title">2. Vorschau im Bonusprogramm</h3><p className="muted">So wirkt dein Logo in den wichtigsten Ansichten.</p></div>
          <div className="branding-logo-context-grid">
            <article><div className="branding-context-header"><RestaurantLogoStage {...previewProps} size="header" /><div><small>WUXUAI Bonus</small><strong>{name}</strong></div></div><span>Gäste-Header</span></article>
            <article><div className="branding-context-detail"><RestaurantLogoStage {...previewProps} size="detail" /><strong>{name}</strong></div><span>Restaurantdetails</span></article>
            <article><div className="branding-context-print"><div><RestaurantLogoStage {...previewProps} size="print" /><strong>{name}</strong></div><QrCode aria-hidden="true" size={42} /></div><span>QR Starter Kit</span></article>
            <article><div className="branding-context-header"><RestaurantLogoStage {...previewProps} size="header" /><div><small>Mitarbeiterbereich</small><strong>{name}</strong></div></div><span>Mitarbeiter-Header</span></article>
          </div>
        </section>
      </div>
    </AppDrawer>
  );
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
  const geocodingRequestRef = useRef(0);
  const [details, setDetails] = useState<RestaurantDetails | null>(null);
  const [restaurantForm, setRestaurantForm] = useState({ name: "", ownerPhone: "" });
  const [openingHours, setOpeningHours] = useState<Record<Weekday, OpeningDay>>(() => normalizeOpeningHours(null));
  const [brandingForm, setBrandingForm] = useState({
    logoUrl: "",
    logoFitMode: "auto" as "auto" | "manual",
    logoScale: 1,
    logoPositionX: 0.5,
    logoPositionY: 0.5,
    primaryColor: "#0f766e",
    secondaryColor: "#f4a261",
    buttonColor: "#0f766e",
  });
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  const [transparentLogoAdjustment, setTransparentLogoAdjustment] = useState<LogoPresentation | null>(null);
  const [subscription, setSubscription] = useState<BranchSubscription | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocationForm | null>(null);
  const [geocodingStatus, setGeocodingStatus] = useState<GeocodingStatus>("idle");
  const [geocodingCandidates, setGeocodingCandidates] = useState<OwnerLocationCandidate[]>([]);
  const [verifiedLocationKey, setVerifiedLocationKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggingLogo, setDraggingLogo] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [pointsCollectionMode, setPointsCollectionMode] = useState<PointsCollectionMode>("customer_initiated_only");
  const [pointsCollectionLimit, setPointsCollectionLimit] = useState("300");

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
        const collectionSettings = await loadLoyaltySettings(nextDetails.id);
        setPointsCollectionMode(collectionSettings.points_collection_mode ?? "customer_initiated_only");
        setPointsCollectionLimit(String((collectionSettings.points_collection_max_amount_cents ?? 30000) / 100));

        if (supabase) {
          const { data: locationData, error: locationError } = await supabase
            .from("branches")
            .select("id, address, postal_code, city, country, latitude, longitude, is_discoverable, public_short_description, public_cover_image_url")
            .eq("restaurant_id", nextDetails.id)
            .limit(1)
            .maybeSingle();
          if (locationError) throw locationError;
          const nextLocation = locationData ? {
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
          } : null;
          setPartnerLocation(nextLocation);
          setGeocodingCandidates([]);
          const storedLatitude = Number(nextLocation?.latitude);
          const storedLongitude = Number(nextLocation?.longitude);
          const storedCoordinatesValid = nextLocation && Boolean(nextLocation.latitude.trim()) && Boolean(nextLocation.longitude.trim())
            && Number.isFinite(storedLatitude) && storedLatitude >= -90 && storedLatitude <= 90
            && Number.isFinite(storedLongitude) && storedLongitude >= -180 && storedLongitude <= 180;
          setVerifiedLocationKey(storedCoordinatesValid ? ownerLocationAddressKey(nextLocation) : null);
          setGeocodingStatus(storedCoordinatesValid ? "found" : "idle");
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
      logoFitMode: branding?.logo_fit_mode ?? "auto",
      logoScale: branding?.logo_scale ?? 1,
      logoPositionX: branding?.logo_position_x ?? 0.5,
      logoPositionY: branding?.logo_position_y ?? 0.5,
      primaryColor: branding?.primary_color ?? "#0f766e",
      secondaryColor: branding?.secondary_color ?? "#f4a261",
      buttonColor: branding?.button_color ?? "#0f766e",
    });
  }, [branding?.button_color, branding?.logo_fit_mode, branding?.logo_position_x, branding?.logo_position_y, branding?.logo_scale, branding?.logo_url, branding?.primary_color, branding?.secondary_color]);

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

  async function savePointsCollection(event: FormEvent) {
    event.preventDefault();
    if (!details?.id) return;
    const maxAmountCents = Math.round(Number(pointsCollectionLimit) * 100);
    if (!Number.isInteger(maxAmountCents) || maxAmountCents < 100 || maxAmountCents > 100000) {
      setErrorMessage("Bitte wähle einen Maximalbetrag zwischen 1 und 1.000 Euro.");
      return;
    }
    setSaving(true); setStatus(null); setErrorMessage(null);
    try {
      await updatePointsCollectionSettings({ restaurantId: details.id, mode: pointsCollectionMode, maxAmountCents });
      setStatus("Punktevergabe gespeichert.");
    } catch {
      setErrorMessage("Punktevergabe konnte nicht gespeichert werden.");
    } finally { setSaving(false); }
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
    const coordinatesValid = Boolean(partnerLocation.latitude.trim()) && Boolean(partnerLocation.longitude.trim())
      && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    const publicDetailsComplete = Boolean(partnerLocation.address.trim() && partnerLocation.postalCode.trim()
      && partnerLocation.city.trim() && partnerLocation.country.trim());

    if (!publicDetailsComplete) {
      setErrorMessage("Bitte fülle alle Pflichtfelder des Standorts aus.");
      return;
    }
    if (!coordinatesValid || verifiedLocationKey !== ownerLocationAddressKey(partnerLocation)) {
      setErrorMessage("Bitte zeige die aktuelle Adresse zuerst auf der Karte an.");
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

  function updatePartnerAddress(field: "address" | "postalCode" | "city" | "country", value: string) {
    geocodingRequestRef.current += 1;
    setPartnerLocation((current) => current ? { ...current, [field]: value, latitude: "", longitude: "" } : current);
    setVerifiedLocationKey(null);
    setGeocodingCandidates([]);
    setGeocodingStatus("stale");
    setStatus(null);
  }

  function applyGeocodingCandidate(candidate: OwnerLocationCandidate) {
    const nextLocation = partnerLocation ? {
      ...partnerLocation,
      address: candidate.address,
      postalCode: candidate.postalCode,
      city: candidate.city,
      country: candidate.country,
      latitude: String(candidate.latitude),
      longitude: String(candidate.longitude),
    } : null;
    setPartnerLocation(nextLocation);
    setGeocodingCandidates([]);
    setVerifiedLocationKey(nextLocation ? ownerLocationAddressKey(nextLocation) : null);
    setGeocodingStatus("found");
    setStatus(null);
  }

  async function findPartnerLocation() {
    if (!details?.id || !partnerLocation) return;
    const addressComplete = partnerLocation.address.trim() && partnerLocation.postalCode.trim()
      && partnerLocation.city.trim() && partnerLocation.country.trim();
    if (!addressComplete) {
      setErrorMessage("Bitte fülle Adresse, Postleitzahl, Ort und Land aus.");
      return;
    }

    const requestId = geocodingRequestRef.current + 1;
    geocodingRequestRef.current = requestId;
    setGeocodingStatus("searching");
    setGeocodingCandidates([]);
    setStatus(null);
    setErrorMessage(null);
    try {
      const candidates = await geocodeOwnerLocation({
        restaurantId: details.id,
        address: partnerLocation.address,
        postalCode: partnerLocation.postalCode,
        city: partnerLocation.city,
        country: partnerLocation.country,
      });
      if (requestId !== geocodingRequestRef.current) return;
      if (candidates.length === 0) {
        setGeocodingStatus("not_found");
        return;
      }
      if (candidates.length === 1) {
        applyGeocodingCandidate(candidates[0]);
        return;
      }
      setGeocodingCandidates(candidates);
      setGeocodingStatus("ambiguous");
    } catch (error) {
      if (requestId !== geocodingRequestRef.current) return;
      setGeocodingStatus(error instanceof OwnerLocationGeocodingError && error.code === "RATE_LIMITED" ? "rate_limited" : "error");
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
            logo_fit_mode: brandingForm.logoFitMode,
            logo_scale: brandingForm.logoScale,
            logo_position_x: brandingForm.logoPositionX,
            logo_position_y: brandingForm.logoPositionY,
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
      setLogoEditorOpen(false);
    } catch (error) {
      console.error("Branding konnte nicht gespeichert werden.", error);
      setErrorMessage("Branding konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!details?.id) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    const maxSize = 5 * 1024 * 1024;

    setStatus(null);
    setErrorMessage(null);

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Bitte wähle PNG, JPG, JPEG, WebP oder SVG.");
      return;
    }

    if (file.size > maxSize) {
      setErrorMessage("Das Logo darf maximal 5 MB groß sein.");
      return;
    }

    let inspection: Awaited<ReturnType<typeof inspectLogoFile>>;
    try {
      inspection = await inspectLogoFile(file);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Das Logo konnte nicht geprüft werden.");
      return;
    }

    const initialPresentation = inspection.adjustment ?? defaultLogoPresentation;
    const previewUrl = URL.createObjectURL(file);
    setLogoPreviewUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return previewUrl;
    });
    setBrandingForm((current) => ({
      ...current,
      logoFitMode: initialPresentation.fitMode,
      logoPositionX: initialPresentation.positionX,
      logoPositionY: initialPresentation.positionY,
      logoScale: initialPresentation.scale,
    }));
    setTransparentLogoAdjustment(inspection.adjustment);
    setLogoEditorOpen(true);
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
          logo_fit_mode: initialPresentation.fitMode,
          logo_scale: initialPresentation.scale,
          logo_position_x: initialPresentation.positionX,
          logo_position_y: initialPresentation.positionY,
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
  const currentLogoPresentation: LogoPresentation = {
    fitMode: brandingForm.logoFitMode,
    positionX: brandingForm.logoPositionX,
    positionY: brandingForm.logoPositionY,
    scale: brandingForm.logoScale,
  };
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
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  className="visually-hidden"
                  onChange={handleLogoInputChange}
                  type="file"
                />
                <RestaurantLogoStage className="settings-logo-preview" logoUrl={currentLogoUrl} name={details.name} presentation={currentLogoPresentation} primaryColor={brandingForm.primaryColor} size="preview" />
                <button className="button secondary" onClick={() => logoInputRef.current?.click()} type="button">
                  <ImageUp size={18} />
                  Logo auswählen
                </button>
                {currentLogoUrl ? <button className="button secondary" onClick={() => setLogoEditorOpen(true)} type="button"><Scale size={18} /> Logo anpassen</button> : null}
                {currentLogoUrl && brandingForm.logoFitMode === "manual" ? <button className="button secondary" onClick={() => setBrandingForm((current) => ({ ...current, logoFitMode: "auto", logoPositionX: 0.5, logoPositionY: 0.5, logoScale: 1 }))} type="button"><RotateCcw size={18} /> Zurücksetzen</button> : null}
                <p className="muted">PNG, JPG, JPEG, WebP oder SVG. Maximal 5 MB.</p>
                <p className="muted">Empfohlen: 1024 × 1024 Pixel. Mindestens 512 Pixel Breite oder Höhe.</p>
              </div>
              <div className="settings-info-card">
                <h2>Aktuelles Branding</h2>
                <p className="muted">Das Logo wird automatisch passend dargestellt. Du kannst Größe und Position bei Bedarf anpassen.</p>
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
        <BrandingLogoEditor
          adjustment={transparentLogoAdjustment}
          logoUrl={currentLogoUrl}
          name={details.name}
          onChange={(presentation) => setBrandingForm((current) => ({
            ...current,
            logoFitMode: presentation.fitMode,
            logoPositionX: presentation.positionX,
            logoPositionY: presentation.positionY,
            logoScale: presentation.scale,
          }))}
          onClose={() => setLogoEditorOpen(false)}
          onSave={() => void saveBranding()}
          open={logoEditorOpen && Boolean(currentLogoUrl)}
          presentation={currentLogoPresentation}
          primaryColor={brandingForm.primaryColor}
          saving={saving}
        />
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
    const previewAvailable = partnerLocation && Boolean(partnerLocation.latitude.trim()) && Boolean(partnerLocation.longitude.trim())
      && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
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
      offers: [],
      membership: null,
      distance_km: null,
    } : null;

    return (
      <>
        <SettingsHeader title="Standort & Restaurantsuche" description="Lege fest, wie dein Restaurant für Gäste auf der Partnerkarte erscheint." />
        <section className="card settings-detail-card">
          {partnerLocation ? (
            <form className="form" onSubmit={savePartnerLocation}>
              <RequiredFieldsNote />
              <div className="grid two">
                <div className="field"><FormLabel htmlFor="location-address" required>Adresse</FormLabel><input aria-required="true" className="input" id="location-address" maxLength={180} onChange={(event) => updatePartnerAddress("address", event.target.value)} required value={partnerLocation.address} /></div>
                <div className="field"><FormLabel htmlFor="location-postal-code" required>Postleitzahl</FormLabel><input aria-required="true" className="input" id="location-postal-code" inputMode="numeric" maxLength={24} onChange={(event) => updatePartnerAddress("postalCode", event.target.value)} required value={partnerLocation.postalCode} /></div>
                <div className="field"><FormLabel htmlFor="location-city" required>Ort</FormLabel><input aria-required="true" className="input" id="location-city" maxLength={100} onChange={(event) => updatePartnerAddress("city", event.target.value)} required value={partnerLocation.city} /></div>
                <div className="field"><FormLabel htmlFor="location-country" required>Land</FormLabel><input aria-required="true" className="input" id="location-country" maxLength={2} onChange={(event) => updatePartnerAddress("country", event.target.value)} required value={partnerLocation.country} /></div>
              </div>
              <div className="settings-location-geocoding">
                <button className="button secondary settings-location-geocode-button" disabled={geocodingStatus === "searching"} onClick={findPartnerLocation} type="button">
                  {geocodingStatus === "searching" ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <MapPinned aria-hidden="true" size={18} />}
                  {geocodingStatus === "searching" ? "Adresse wird gesucht …" : ["not_found", "error", "rate_limited"].includes(geocodingStatus) ? "Erneut suchen" : "Adresse auf Karte anzeigen"}
                </button>
                {geocodingStatus === "found" ? <p className="settings-location-found" role="status">✓ Standort gefunden</p> : null}
                {geocodingStatus === "stale" ? <p className="muted">Die Adresse wurde geändert. Bitte prüfe die neue Kartenposition.</p> : null}
                {geocodingStatus === "not_found" ? <p className="status-message error">Adresse konnte nicht eindeutig gefunden werden. Bitte überprüfe Straße, Hausnummer, Postleitzahl und Ort.</p> : null}
                {geocodingStatus === "rate_limited" ? <p className="status-message error">Die Kartensuche ist gerade ausgelastet. Bitte versuche es in einem Moment erneut.</p> : null}
                {geocodingStatus === "error" ? <p className="status-message error">Die Adresse konnte gerade nicht gesucht werden. Bitte versuche es erneut.</p> : null}
                {geocodingStatus === "ambiguous" ? (
                  <div className="settings-location-results" aria-live="polite">
                    <strong>Welche Adresse meinst du?</strong>
                    {geocodingCandidates.map((candidate) => (
                      <button className="settings-location-result" key={`${candidate.latitude}:${candidate.longitude}`} onClick={() => applyGeocodingCandidate(candidate)} type="button">
                        <MapPinned aria-hidden="true" size={18} />
                        <span>{candidate.displayName}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {previewLocation ? <details className="settings-location-advanced"><summary>Erweiterte Einstellungen</summary><dl><div><dt>Breitengrad</dt><dd>{latitude.toFixed(6)}</dd></div><div><dt>Längengrad</dt><dd>{longitude.toFixed(6)}</dd></div></dl></details> : null}
              <div className="field"><FormLabel htmlFor="location-description" optional>Öffentliche Kurzbeschreibung</FormLabel><textarea className="input settings-location-description" id="location-description" maxLength={280} onChange={(event) => setPartnerLocation((current) => current ? { ...current, shortDescription: event.target.value } : current)} value={partnerLocation.shortDescription} /></div>
              <div className="field"><FormLabel htmlFor="location-cover" optional>Öffentliches Bild (HTTPS-Adresse)</FormLabel><input className="input" id="location-cover" onChange={(event) => setPartnerLocation((current) => current ? { ...current, coverImageUrl: event.target.value } : current)} placeholder="https://…" type="url" value={partnerLocation.coverImageUrl} /></div>
              <label className="settings-location-toggle"><input checked={partnerLocation.isDiscoverable} onChange={(event) => setPartnerLocation((current) => current ? { ...current, isDiscoverable: event.target.checked } : current)} type="checkbox" /><span><strong>In Restaurantsuche sichtbar</strong><small>Nur aktive Restaurants mit vollständiger Adresse und gültiger Kartenposition werden öffentlich angezeigt.</small></span></label>
              {previewLocation ? (
                <div className="settings-location-preview"><h2>Markervorschau</h2><LazyPartnerRestaurantMap locations={[previewLocation]} onSelect={() => undefined} selectedId={previewLocation.branch_id} userLocation={null} /></div>
              ) : <p className="muted">Zeige deine Adresse auf der Karte an, um die Position zu prüfen.</p>}
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
            description="Lege fest, ob dein Team den Kunden-QR scannt oder Gäste den Vorgang starten."
            icon={ScanLine}
            label="Punktevergabe einstellen"
            title="Punkte sammeln"
            to="/admin/settings/punkte-sammeln"
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
            description="Lege Aktivierung, Bonusdauer und monatliches Einladungslimit fest."
            icon={Users}
            label="2× Bonus einstellen"
            title="Freunde einladen & 2× Bonus"
            to="/admin/loyalty#freundschaftsbonus"
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

  if (section === "punkte-sammeln") {
    const options: Array<{ value: PointsCollectionMode; title: string; description: string; recommended?: boolean }> = [
      { value: "restaurant_controlled_only", title: "Restaurant scannt Kunden-QR", description: "Das Restaurant kontrolliert den Vorgang. Der Gast zeigt nur seinen persönlichen Bonus-QR.", recommended: true },
      { value: "customer_initiated_only", title: "Gast scannt Restaurant-QR", description: "Der Gast startet den Sammelvorgang. Das Restaurant bestätigt anschließend." },
      { value: "both", title: "Beide Möglichkeiten", description: "Je nach Situation können beide Abläufe verwendet werden." },
    ];
    return <>
      <SettingsHeader title="Punkte sammeln" description="Lege fest, wie Gäste in deinem Restaurant Punkte sammeln." />
      <section className="card settings-detail-card">
        <form className="form" onSubmit={savePointsCollection}>
          <fieldset className="points-mode-fieldset">
            <legend>Wie können Gäste Punkte sammeln?</legend>
            <div className="choice-grid points-mode-grid">
              {options.map((option) => <label className={`choice-card${pointsCollectionMode === option.value ? " active" : ""}`} key={option.value}>
                <input checked={pointsCollectionMode === option.value} name="points-mode" onChange={() => setPointsCollectionMode(option.value)} type="radio" />
                <span><strong>{option.title}</strong>{option.recommended ? <small>Empfohlen</small> : null}</span>
                <small>{option.description}</small>
              </label>)}
            </div>
          </fieldset>
          <div className="field">
            <FormLabel htmlFor="points-collection-limit" required>Maximal bonusberechtigter Betrag pro Buchung</FormLabel>
            <div className="points-limit-input"><input aria-required="true" className="input" id="points-collection-limit" inputMode="decimal" max="1000" min="1" onChange={(event) => setPointsCollectionLimit(event.target.value)} required step="1" type="number" value={pointsCollectionLimit} /><span>EUR</span></div>
            <p className="muted">Standard 300 EUR. Erlaubt sind 1 bis 1.000 EUR. Höhere Beträge werden serverseitig abgelehnt.</p>
          </div>
          <div className="settings-info-card"><strong>Nicht bonusberechtigt</strong><p className="muted">Trinkgeld, Gutscheinkäufe und Bestellungen über externe Lieferplattformen zählen nicht zum bonusberechtigten Betrag.</p></div>
          <FormActions saving={saving} submitLabel="Punktevergabe speichern" />
        </form>
      </section>
      <StatusMessages errorMessage={errorMessage} status={status} />
    </>;
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
                  <p>Plan: WUXUAI Bonus</p>
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
          description="Lege Aktivierung, Bonusdauer und monatliches Einladungslimit fest."
          icon={Users}
          label="2× Bonus einstellen"
          title="Freunde einladen & 2× Bonus"
          to="/admin/loyalty#freundschaftsbonus"
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
