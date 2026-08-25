import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import {
  BadgeCheck,
  CalendarDays,
  Calculator,
  ChevronRight,
  CircleAlert,
  Clock3,
  HandCoins,
  HelpCircle,
  Home,
  KeyRound,
  LogOut,
  Menu,
  MoreHorizontal,
  QrCode,
  Search,
  ShieldCheck,
  Stamp,
  UserSearch,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { buildStaffLoginPath } from "../auth/staffLoginFlow.mjs";
import type { Customer, LoyaltyRule, LoyaltySettings } from "../../shared/types/domain";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import { useAuth } from "../auth/AuthProvider";
import { useStaffPortalAccess } from "../auth/staffPortalAccessContext";
import {
  applyStaffLoyaltyAction,
  confirmRestaurantControlledPoints,
  defaultSettingsForMode,
  loadTodayRestaurantPin,
  loadCustomers,
  loadLoyaltyRules,
  loadLoyaltySettings,
  resolveCustomerQrToken,
  previewRestaurantControlledPoints,
  rulesForMode,
  type TodayRestaurantPin,
  type RestaurantControlledPointsPreview,
} from "../loyalty/loyaltyService";
import { useTenant } from "../tenant/TenantProvider";
import { extractCustomerPointsQrReference } from "../loyalty/customerPointsQr.mjs";
import { loadStaffDailyActivity, type StaffDailyActivity } from "./staffActivityService";
import "./staff-premium.css";

type StaffView = "home" | "search" | "earn";

type PendingPinAction = {
  title: string;
  detail: string;
  pinLabel: string;
  pinHelp: string;
  run: (dailyPin: string) => Promise<void>;
};

function extractCustomerToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { customer_token?: string; token?: string };
    return parsed.customer_token ?? parsed.token ?? null;
  } catch {
    // Continue with URL/raw-token parsing.
  }

  try {
    const parsedUrl = new URL(trimmed);
    return parsedUrl.searchParams.get("token") || parsedUrl.searchParams.get("customer_token");
  } catch {
    return trimmed.length > 24 && !trimmed.includes(" ") ? trimmed : null;
  }
}

export function StaffTablet() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { signOut, user } = useAuth();
  const staffPortalAccess = useStaffPortalAccess();
  const { activeRestaurant, branding, loading: tenantLoading, restaurants } = useTenant();
  const staffRestaurant = useMemo(() => {
    if (slug) {
      return restaurants.find((restaurant) => restaurant.slug === slug) ?? null;
    }
    return activeRestaurant;
  }, [activeRestaurant, restaurants, slug]);
  const staffBranding = activeRestaurant?.id === staffRestaurant?.id ? branding : null;
  const restaurantId = staffRestaurant?.id ?? "";
  const [view, setView] = useState<StaffView>("home");
  const [settings, setSettings] = useState<LoyaltySettings>(() =>
    defaultSettingsForMode(restaurantId, "menu_points"),
  );
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [billAmount, setBillAmount] = useState(0);
  const [pointsQrReference, setPointsQrReference] = useState<string | null>(null);
  const [pointsPreview, setPointsPreview] = useState<RestaurantControlledPointsPreview | null>(null);
  const [customerPreviewError, setCustomerPreviewError] = useState<string | null>(null);
  const [selectedStampRuleId, setSelectedStampRuleId] = useState<string>("manual-stamp");
  const [pendingPinAction, setPendingPinAction] = useState<PendingPinAction | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [todayPin, setTodayPin] = useState<TodayRestaurantPin | null>(null);
  const [todayPinLoading, setTodayPinLoading] = useState(false);
  const [todayPinError, setTodayPinError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerManualValue, setScannerManualValue] = useState("");
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [todayActivity, setTodayActivity] = useState<StaffDailyActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRefreshToken, setActivityRefreshToken] = useState(0);
  const [pinDetailOpen, setPinDetailOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scannerHandlingResultRef = useRef(false);
  const scannerLaunchPendingRef = useRef(false);
  const scannerReturnViewRef = useRef<StaffView>("home");

  useEffect(() => {
    if (tenantLoading || restaurantId || !slug) return;
    setMessage("Restaurant konnte nicht geladen werden.");
  }, [restaurantId, slug, tenantLoading]);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;
    setStaffLoading(true);
    setStaffError(null);

    async function loadStaffData() {
      try {
        const [nextSettings, nextRules, nextCustomers] = await Promise.all([
          loadLoyaltySettings(restaurantId),
          loadLoyaltyRules(restaurantId),
          loadCustomers(restaurantId),
        ]);

        if (!cancelled) {
          setSettings(nextSettings);
          setRules(nextRules);
          setCustomers(nextCustomers);
          setSelectedCustomerId((current) => current || nextCustomers[0]?.id || "");
        }
      } catch (error) {
        console.error("Mitarbeiterdaten konnten nicht geladen werden.", error);
        if (!cancelled) {
          setStaffError("Mitarbeiterdaten konnten nicht geladen werden.");
        }
      } finally {
        if (!cancelled) {
          setStaffLoading(false);
        }
      }
    }

    loadStaffData();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) {
      setTodayActivity([]);
      setActivityError(null);
      setActivityLoading(false);
      return;
    }

    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);

    loadStaffDailyActivity(restaurantId)
      .then((activity) => {
        if (!cancelled) setTodayActivity(activity);
      })
      .catch((error) => {
        console.error("Heutige Aktivität konnte nicht geladen werden.", error);
        if (!cancelled) {
          setTodayActivity([]);
          setActivityError("Die heutige Übersicht konnte gerade nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activityRefreshToken, restaurantId]);

  useEffect(() => {
    if (!restaurantId) {
      setTodayPin(null);
      setTodayPinError(null);
      setTodayPinLoading(false);
      return;
    }

    let cancelled = false;
    setTodayPinLoading(true);
    setTodayPinError(null);

    loadTodayRestaurantPin(restaurantId)
      .then((nextTodayPin) => {
        if (!cancelled) {
          setTodayPin(nextTodayPin);
        }
      })
      .catch((error) => {
        console.error("Tages-PIN konnte nicht geladen werden.", error);
        if (!cancelled) {
          setTodayPin(null);
          setTodayPinError("Tages-PIN konnte gerade nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTodayPinLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const activeRules = useMemo(
    () => rulesForMode(rules.filter((rule) => rule.active), settings.loyalty_mode),
    [rules, settings.loyalty_mode],
  );
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) =>
        `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""} ${customer.customer_code}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [customers, query],
  );
  const calculatedPoints = Math.max(0, Math.floor(billAmount / settings.amount_per_point));
  const restaurantControlledEnabled = settings.points_collection_mode === "restaurant_controlled_only"
    || settings.points_collection_mode === "both";
  const customerInitiatedStaffToolsEnabled = settings.points_collection_mode !== "restaurant_controlled_only";
  const stampRules = activeRules.filter((rule) => rule.stamps > 0);
  const todayPointsIssued = todayActivity.reduce((total, activity) => total + activity.points_issued, 0);
  const todayRewardsRedeemed = todayActivity.reduce((total, activity) => total + activity.rewards_redeemed, 0);
  const recognizedCustomerName = pointsPreview?.customer_label ?? selectedCustomer?.name ?? null;
  const recognizedPointsBalance = pointsPreview?.points_balance ?? selectedCustomer?.points_balance ?? null;
  const hasCustomerContext = Boolean(selectedCustomer || pointsQrReference);
  const customerStatusMessage = message
    ?? (pointsPreview
      ? "Kunde erfolgreich geladen."
      : pointsQrReference
        ? "Kunden-QR erkannt."
        : selectedCustomer
          ? "Gast ausgewählt."
          : "Bitte QR scannen oder Gast suchen.");
  const customerStatusIsError = Boolean(customerPreviewError)
    || Boolean(message && /(nicht|konnte|ungültig|abgelaufen|fehler|überschreitet|zu viele)/i.test(message));
  const currentDateLabel = useMemo(
    () => new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "long", year: "numeric" }).format(new Date()),
    [],
  );

  async function handleStaffLogout() {
    setLoggingOut(true);
    setLogoutError(null);

    try {
      await signOut();
      navigate(buildStaffLoginPath(slug), { replace: true });
    } catch {
      setLogoutError("Abmelden ist gerade nicht möglich. Bitte versuche es erneut.");
    } finally {
      setLoggingOut(false);
    }
  }

  function openStaffView(nextView: StaffView) {
    setMessage(null);
    setView(nextView);
    setMoreOpen(false);
  }

  function clearSelectedCustomer() {
    setSelectedCustomerId("");
    setPointsQrReference(null);
    setPointsPreview(null);
    setCustomerPreviewError(null);
    setBillAmount(0);
    setQuery("");
    setMessage(null);
    setView("search");
  }

  function formatBoostExpiry(expiresAt: string) {
    return new Intl.DateTimeFormat("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Vienna",
    }).format(new Date(expiresAt));
  }

  function boostRemainingDays(expiresAt: string) {
    return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
  }

  function replaceCustomerBalance(customerId: string, pointsBalance: number, stampBalance: number) {
    setCustomers((currentCustomers) =>
      currentCustomers.map((customer) =>
        customer.id === customerId
          ? { ...customer, points_balance: pointsBalance, stamp_balance: stampBalance }
          : customer,
      ),
    );
  }

  function stopScanner() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

    if (scannerVideoRef.current) {
      const stream = scannerVideoRef.current.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      scannerVideoRef.current.srcObject = null;
    }
  }

  function scannerErrorMessage(error: unknown) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") {
        return "Kamera-Zugriff wurde abgelehnt. Bitte erlaube die Kamera oder suche den Gast manuell.";
      }

      if (error.name === "NotFoundError") {
        return "Keine Kamera gefunden. Bitte suche den Gast manuell.";
      }

      if (error.name === "NotReadableError") {
        return "Die Kamera ist gerade nicht verfügbar. Bitte schließe andere Kamera-Apps oder suche den Gast manuell.";
      }
    }

    return "QR-Scanner konnte nicht geöffnet werden. Bitte suche den Gast manuell.";
  }

  async function findCustomerFromSearch(searchValue: string) {
    const nextQuery = searchValue.trim();
    const pointsReference = extractCustomerPointsQrReference(nextQuery);
    if (pointsReference && restaurantId && restaurantControlledEnabled) {
      setPointsQrReference(pointsReference);
      setPointsPreview(null);
      setCustomerPreviewError(null);
      setBillAmount(0);
      setSelectedCustomerId("");
      setQuery("");
      setView("earn");
      setMessage("Kunden-QR erkannt. Gib jetzt den bonusberechtigten Betrag ein.");
      return;
    }
    const token = extractCustomerToken(nextQuery);

    if (token && restaurantId) {
      try {
        const customerFromQr = await resolveCustomerQrToken(restaurantId, token);
        setCustomers((currentCustomers) => {
          const exists = currentCustomers.some((customer) => customer.id === customerFromQr.id);
          return exists
            ? currentCustomers.map((customer) => (customer.id === customerFromQr.id ? customerFromQr : customer))
            : [customerFromQr, ...currentCustomers];
        });
        setSelectedCustomerId(customerFromQr.id);
        setCustomerPreviewError(null);
        setView("search");
        setMessage("Gast per QR gefunden.");
        return;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "QR konnte nicht gelesen werden.");
      }
    }

    const nextCustomer = customers.find((customer) =>
      `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""} ${customer.customer_code}`
        .toLowerCase()
        .includes(nextQuery.toLowerCase()),
    );
    setSelectedCustomerId(nextCustomer?.id ?? "");
  }

  async function handleScannerValue(value: string) {
    stopScanner();
    setScannerOpen(false);
    setScannerManualValue("");
    setQuery(value);
    await findCustomerFromSearch(value);
  }

  async function startQrScanner() {
    if (scannerLaunchPendingRef.current || scannerOpen) return;
    if (!restaurantControlledEnabled) {
      setMessage("Der Kunden-QR-Scanner ist für dieses Restaurant nicht aktiviert.");
      return;
    }
    scannerReturnViewRef.current = view;
    scannerLaunchPendingRef.current = true;
    setView("search");
    setScannerOpen(true);
    setScannerStarting(true);
    setScannerError(null);
    setScannerStatus("Kamera wird geöffnet...");
    setMessage(null);
    stopScanner();
    scannerHandlingResultRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      scannerLaunchPendingRef.current = false;
      setScannerStarting(false);
      setScannerStatus(null);
      setScannerError("Dieser Browser unterstützt keinen Kamera-Zugriff. Bitte suche den Gast manuell.");
      return;
    }

    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (!scannerVideoRef.current) throw new Error("Scanner video is unavailable.");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        scannerVideoRef.current,
        (result, _decodeError, scannerControls) => {
          if (!result || scannerHandlingResultRef.current) return;
          const rawValue = result.getText();
          const recognized = extractCustomerPointsQrReference(rawValue) || extractCustomerToken(rawValue);
          if (!recognized) {
            setScannerError("Dieser QR-Code ist kein gültiger Kunden-QR. Bitte versuche es erneut.");
            setScannerStatus("Kunden-QR ruhig und vollständig in den Rahmen halten.");
            return;
          }

          scannerHandlingResultRef.current = true;
          scannerControls.stop();
          scannerControlsRef.current = null;
          setScannerStatus("Kunden-QR erkannt.");
          void handleScannerValue(rawValue);
        },
      );
      if (scannerHandlingResultRef.current) {
        controls.stop();
        return;
      }
      scannerControlsRef.current = controls;
      setScannerStarting(false);
      setScannerStatus("Kunden-QR ruhig und vollständig in den Rahmen halten.");
      scannerLaunchPendingRef.current = false;
    } catch (error) {
      stopScanner();
      setScannerStarting(false);
      setScannerStatus(null);
      setScannerError(scannerErrorMessage(error));
      scannerLaunchPendingRef.current = false;
    }
  }

  function closeScanner() {
    scannerLaunchPendingRef.current = false;
    stopScanner();
    scannerHandlingResultRef.current = false;
    setScannerOpen(false);
    setScannerStarting(false);
    setScannerStatus(null);
    setScannerError(null);
    setScannerManualValue("");
  }

  function dismissScanner() {
    closeScanner();
    openStaffView(scannerReturnViewRef.current);
  }

  async function executePinAction(action: PendingPinAction, pin: string) {
    if (!restaurantId) return;
    if (!pin.trim()) {
      setMessage("Bitte gib die Tages-PIN ein.");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      await action.run(pin.trim());
      setPendingPinAction(null);
      setPinDraft("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Punkte konnten gerade nicht gebucht werden. Bitte versuche es erneut.",
      );
    } finally {
      setSaving(false);
    }
  }

  function requestPin(action: PendingPinAction) {
    setPendingPinAction(action);
    setPinDraft("");
  }

  function queueLoyaltyAction(payload: {
    title: string;
    points: number;
    stamps: number;
    reason: string;
    ruleId?: string | null;
    billAmount?: number | null;
  }) {
    if (!restaurantId || !selectedCustomer) return;

    requestPin({
      title: payload.title,
      detail: selectedCustomer.name,
      pinLabel: "Tages-PIN",
      pinHelp: "Bitte prüfe die heutige Tages-PIN in der Mitarbeiteransicht.",
      run: async (dailyPin) => {
        const result = await applyStaffLoyaltyAction({
          restaurantId,
          customerId: selectedCustomer.id,
          dailyPin,
          mode: settings.loyalty_mode,
          points: payload.points,
          stamps: payload.stamps,
          reason: payload.reason,
          ruleId: payload.ruleId ?? null,
          billAmount: payload.billAmount ?? null,
          idempotencyKey: crypto.randomUUID(),
        });

        replaceCustomerBalance(selectedCustomer.id, result.points_balance, result.stamp_balance);
        setBillAmount(0);
        setMessage("Vorgang gespeichert und protokolliert.");
        setActivityRefreshToken((current) => current + 1);
      },
    });
  }

  async function handleRestaurantControlledPreview() {
    if (!restaurantId || !pointsQrReference) return;
    const amountCents = Math.round(billAmount * 100);
    setSaving(true); setMessage(null); setCustomerPreviewError(null);
    try {
      setPointsPreview(await previewRestaurantControlledPoints(restaurantId, pointsQrReference, amountCents));
    } catch (error) {
      setPointsPreview(null);
      const nextError = error instanceof Error ? error.message : "Punkte konnten nicht berechnet werden.";
      setCustomerPreviewError(nextError);
      setMessage(nextError);
    } finally { setSaving(false); }
  }

  function confirmRestaurantControlledPreview() {
    if (!restaurantId || !pointsQrReference || !pointsPreview) return;
    const idempotencyKey = crypto.randomUUID();
    requestPin({
      title: "Punkte gutschreiben",
      detail: `${pointsPreview.customer_label} · ${pointsPreview.expected_points} Punkte`,
      pinLabel: "Tages-PIN",
      pinHelp: "Bestätige den tatsächlich direkt im Restaurant bezahlten Betrag.",
      run: async (dailyPin) => {
        const result = await confirmRestaurantControlledPoints({ restaurantId, qrReference: pointsQrReference,
          amountCents: pointsPreview.amount_cents, dailyPin, idempotencyKey });
        setPointsQrReference(null); setPointsPreview(null); setBillAmount(0);
        setMessage(`${result.points_added} Punkte wurden gutgeschrieben.`);
        setView("home");
        setActivityRefreshToken((current) => current + 1);
      },
    });
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await findCustomerFromSearch(query);
  }

  function selectCustomer(customerId: string, nextView: StaffView = "earn") {
    setSelectedCustomerId(customerId);
    setCustomerPreviewError(null);
    setMessage(null);
    setView(nextView);
  }

  return (
    <main className="tablet-shell staff-premium-shell">
      <header className="staff-premium-header">
        <div className="restaurant-brand-header staff-premium-brand">
          <span className="restaurant-logo-frame">
            {staffBranding?.logo_url ? (
              <img
                alt={`${staffRestaurant?.name ?? "Restaurant"} Logo`}
                className="restaurant-logo-image"
                src={staffBranding.logo_url}
              />
            ) : (
              <span className="restaurant-logo-placeholder">
                {(staffRestaurant?.name.trim().charAt(0) || "R").toUpperCase()}
              </span>
            )}
          </span>
          <div className="restaurant-brand-copy">
            <span className="staff-premium-kicker">WUXUAI Bonus</span>
            <h1 className="restaurant-brand-title">{staffRestaurant?.name ?? "Restaurant"}</h1>
          </div>
        </div>
        <button
          aria-expanded={moreOpen}
          aria-label="Mitarbeitermenü öffnen"
          className="staff-premium-menu-button"
          onClick={() => setMoreOpen(true)}
          type="button"
        >
          <Menu aria-hidden="true" size={20} />
          <span>Menü</span>
        </button>
        <div className="staff-premium-header-meta">
          <span><ShieldCheck aria-hidden="true" size={16} />{staffPortalAccess?.access_mode === "operator" ? "Mitarbeiterbereich – Betreiberzugriff" : "Mitarbeiterbereich"}</span>
          <time dateTime={new Date().toISOString().slice(0, 10)}><CalendarDays aria-hidden="true" size={16} />{currentDateLabel}</time>
        </div>
      </header>

      <div className="staff-premium-workspace">
        {view === "home" ? (
          <>
            <section className="staff-premium-intro">
              <span className="staff-premium-kicker">Heute im Service</span>
              <h2>Bereit für den nächsten Gast.</h2>
              <p>Kunden-QR scannen, Punkte sicher gutschreiben oder einen Gast schnell finden.</p>
            </section>

            <div className="staff-premium-priority-grid">
              {restaurantControlledEnabled ? (
                <section className="staff-premium-scan-hero" aria-labelledby="staff-scan-title">
                  <span className="staff-premium-scan-icon"><QrCode aria-hidden="true" size={27} /></span>
                  <div className="staff-premium-scan-copy">
                    <span className="staff-premium-kicker">Wichtigste Aktion</span>
                    <h2 id="staff-scan-title">Kunden-QR scannen</h2>
                    <p>QR-Code des Gastes scannen und Punkte sicher gutschreiben.</p>
                  </div>
                  <button
                    aria-label="Kunden-QR-Code scannen und Punkte gutschreiben"
                    className="staff-premium-scan-button"
                    disabled={scannerStarting || scannerOpen}
                    onClick={() => void startQrScanner()}
                    type="button"
                  >
                    <QrCode aria-hidden="true" size={21} />
                    <span>{scannerStarting ? "Scanner wird geöffnet …" : "QR-Code scannen"}</span>
                    <ChevronRight aria-hidden="true" size={19} />
                  </button>
                </section>
              ) : null}

              <button
                aria-label="Details zur heutigen Tages-PIN öffnen"
                className="staff-premium-pin-card"
                onClick={() => setPinDetailOpen(true)}
                type="button"
              >
                <span className="staff-premium-pin-head"><KeyRound aria-hidden="true" size={19} />Heutige Tages-PIN</span>
                {todayPinLoading ? (
                  <span className="staff-premium-pin-loading"><span aria-hidden="true" />Tages-PIN wird geladen …</span>
                ) : null}
                {!todayPinLoading && todayPinError ? (
                  <span className="staff-premium-pin-error"><CircleAlert aria-hidden="true" size={20} />{todayPinError}</span>
                ) : null}
                {!todayPinLoading && !todayPinError && todayPin ? (
                  <strong className="staff-premium-pin-code" aria-label={`Tages-PIN ${todayPin.pin_code.split("").join(" ")}`}>
                    {todayPin.pin_code.split("").map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}
                  </strong>
                ) : null}
                <span className="staff-premium-pin-copy">Nur für heutige Punktebuchungen</span>
                <span className="staff-premium-pin-valid"><Clock3 aria-hidden="true" size={16} />Gültig bis 23:59<ChevronRight aria-hidden="true" size={18} /></span>
              </button>
            </div>

            <section className="staff-premium-activity" aria-labelledby="staff-activity-title">
              <div className="staff-premium-section-heading">
                <div><span className="staff-premium-kicker">Schnellübersicht</span><h2 id="staff-activity-title">Heute</h2></div>
                {!activityLoading && !activityError ? <span className="staff-premium-live-badge"><span aria-hidden="true" />Aktuell</span> : null}
              </div>
              {activityLoading ? (
                <div aria-label="Heutige Übersicht wird geladen" className="staff-premium-state staff-premium-state-loading">
                  <span aria-hidden="true" /><div><span /><span /></div>
                </div>
              ) : null}
              {!activityLoading && activityError ? (
                <div className="staff-premium-state staff-premium-state-error" role="alert">
                  <CircleAlert aria-hidden="true" size={23} /><div><strong>Übersicht nicht verfügbar</strong><p>{activityError}</p></div>
                </div>
              ) : null}
              {!activityLoading && !activityError && todayActivity.length === 0 ? (
                <div className="staff-premium-state staff-premium-state-empty">
                  <Clock3 aria-hidden="true" size={23} /><div><strong>Heute noch keine Aktivität</strong><p>Einlösungen und Punktebuchungen erscheinen hier automatisch.</p></div>
                </div>
              ) : null}
              {!activityLoading && !activityError && todayActivity.length > 0 ? (
                <div className="staff-premium-activity-grid">
                  <article><span>Einlösungen heute</span><strong>{todayRewardsRedeemed}</strong></article>
                  <article><span>Bonuspunkte heute</span><strong>{todayPointsIssued}</strong></article>
                </div>
              ) : null}
            </section>

            <section className="staff-premium-quick-section" aria-labelledby="staff-quick-title">
              <div className="staff-premium-section-heading"><div><span className="staff-premium-kicker">Weitere Aufgaben</span><h2 id="staff-quick-title">Schnell starten</h2></div></div>
              <div className="staff-premium-quick-grid">
                <button onClick={() => openStaffView("search")} type="button"><UserSearch aria-hidden="true" size={22} /><span><strong>Gast suchen</strong><small>Name oder Code</small></span><ChevronRight aria-hidden="true" size={18} /></button>
                {customerInitiatedStaffToolsEnabled ? <button onClick={() => openStaffView("earn")} type="button"><HandCoins aria-hidden="true" size={22} /><span><strong>Punkte geben</strong><small>Tages-PIN nötig</small></span><ChevronRight aria-hidden="true" size={18} /></button> : null}
              </div>
            </section>
          </>
        ) : (
          <button className="staff-premium-back" onClick={() => openStaffView("home")} type="button"><Home aria-hidden="true" size={18} />Zur Startseite</button>
        )}

      {view !== "home" ? <section className="staff-customer-flow">
        <div className="staff-customer-flow-status" aria-live={customerStatusIsError ? "assertive" : "polite"} role={customerStatusIsError ? "alert" : "status"}>
          {customerStatusIsError ? <CircleAlert aria-hidden="true" size={20} /> : <BadgeCheck aria-hidden="true" size={20} />}
          <strong>{customerStatusMessage}</strong>
        </div>

        <article className={`card staff-customer-context-card${hasCustomerContext ? " is-selected" : " is-empty"}`} aria-live="polite">
          {recognizedCustomerName && recognizedPointsBalance !== null ? (
            <>
              <span className="staff-customer-context-status"><BadgeCheck aria-hidden="true" size={18} />Gast erkannt</span>
              <h2>{recognizedCustomerName}</h2>
              <p className="staff-customer-context-points">Aktuell <strong>{recognizedPointsBalance} Punkte</strong></p>
              {pointsPreview?.boost_multiplier && pointsPreview.boost_multiplier > 1 ? (
                <div className="staff-customer-boost">
                  <strong>{pointsPreview.boost_multiplier}× Bonus aktiv</strong>
                  {pointsPreview.boost_expires_at ? (
                    <span>Noch {boostRemainingDays(pointsPreview.boost_expires_at)} Tage · bis {formatBoostExpiry(pointsPreview.boost_expires_at)}</span>
                  ) : null}
                </div>
              ) : null}
              <button className="button secondary" onClick={clearSelectedCustomer} type="button">Anderen Gast wählen</button>
            </>
          ) : pointsQrReference ? (
            <>
              <span className="staff-customer-context-status">
                {customerPreviewError ? <CircleAlert aria-hidden="true" size={18} /> : <BadgeCheck aria-hidden="true" size={18} />}
                {customerPreviewError ? "Kundendaten nicht verfügbar" : "Kunden-QR erkannt"}
              </span>
              <h2>{customerPreviewError ? "Gast konnte nicht sicher geladen werden" : saving ? "Kundendaten werden geladen …" : "Gast wird sicher geprüft"}</h2>
              <p className="muted">{customerPreviewError ?? "Name und Punktestand erscheinen mit der sicheren serverseitigen Punkte-Vorschau."}</p>
              {customerPreviewError ? <button className="button" onClick={() => { setCustomerPreviewError(null); setMessage(null); }} type="button">Erneut versuchen</button> : null}
              <button className="button secondary" onClick={clearSelectedCustomer} type="button">Anderen Gast wählen</button>
            </>
          ) : (
            <>
              <span className="staff-customer-context-status"><UserSearch aria-hidden="true" size={18} />Kein Gast gewählt</span>
              <h2>Kein Gast gewählt</h2>
              <p className="muted">Bitte QR scannen oder Gast suchen.</p>
            </>
          )}
        </article>

        {view === "earn" && !customerPreviewError ? (
        <section aria-disabled={!hasCustomerContext} className={`card staff-points-credit-card${hasCustomerContext ? "" : " is-disabled"}`}>
          <h2>{recognizedCustomerName ? `Punkte für ${recognizedCustomerName} vergeben` : pointsQrReference ? "Punkte gutschreiben" : "Punkte/Stempel geben"}</h2>
          {!hasCustomerContext ? <p className="muted">Wähle zuerst einen Gast aus oder scanne den persönlichen Kunden-QR.</p> : null}
          {pointsQrReference ? <div className="restaurant-controlled-credit">
            <p className="muted">Erfasse nur den direkt im Restaurant bezahlten Betrag nach Rabatten. Trinkgeld, Gutscheinkäufe und Lieferplattformen zählen nicht.</p>
            <div className="field"><FormLabel htmlFor="controlled-bill-amount" required>Bonusberechtigter Betrag</FormLabel><input aria-required="true" className="input" id="controlled-bill-amount" inputMode="decimal" max={(settings.points_collection_max_amount_cents ?? 30000) / 100} min="0.01" onChange={(event) => { setBillAmount(Number(event.target.value) || 0); setPointsPreview(null); }} required step="0.01" type="number" value={billAmount || ""} /></div>
            {!pointsPreview ? <button className="button" disabled={saving || billAmount <= 0} onClick={() => void handleRestaurantControlledPreview()} type="button">Punkte serverseitig berechnen</button> : <div className="settings-info-card">
              <span>{pointsPreview.customer_label} · aktuell {pointsPreview.points_balance} Punkte</span>
              <strong>+{pointsPreview.expected_points} Punkte</strong>
              {pointsPreview.boost_multiplier > 1 ? <p className="muted">{pointsPreview.base_points} Basispunkte · {pointsPreview.boost_multiplier}× Freundschaftsbonus</p> : null}
              {pointsPreview.high_amount_warning ? <p className="status-message">Hoher Betrag: Bitte den bezahlten Betrag sorgfältig prüfen.</p> : null}
              <button className="button" disabled={saving} onClick={confirmRestaurantControlledPreview} type="button">Mit Tages-PIN bestätigen</button>
            </div>}
          </div> : null}
          {!pointsQrReference && settings.loyalty_mode === "amount_based" ? (
            <div className="grid two">
              <div className="field">
                <FormLabel htmlFor="bill-amount" required>Rechnungsbetrag</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="bill-amount"
                  min="0"
                  disabled={!selectedCustomer}
                  required
                  step="0.01"
                  type="number"
                  value={billAmount}
                  onChange={(event) => setBillAmount(Number(event.target.value) || 0)}
                />
                <p className="muted">
                  <Calculator size={16} /> {calculatedPoints} Punkte
                </p>
              </div>
              <button
                className="large-action"
                disabled={!selectedCustomer || calculatedPoints <= 0 || saving}
                onClick={() =>
                  queueLoyaltyAction({
                    title: "Punkte buchen",
                    points: calculatedPoints,
                    stamps: 0,
                    reason: `Rechnungsbetrag ${billAmount.toFixed(2)} EUR`,
                    billAmount,
                  })
                }
                type="button"
              >
                <HandCoins size={32} />
                Punkte buchen
                <span className="muted">{calculatedPoints} Punkte</span>
              </button>
            </div>
          ) : null}

          {!pointsQrReference && settings.loyalty_mode === "stamp_based" ? (
            <div className="grid two">
              <div className="field">
                <FormLabel htmlFor="stamp-rule" required>Stempel-Regel</FormLabel>
                <select
                  aria-required="true"
                  className="select"
                  id="stamp-rule"
                  disabled={!selectedCustomer}
                  required
                  value={selectedStampRuleId}
                  onChange={(event) => setSelectedStampRuleId(event.target.value)}
                >
                  <option value="manual-stamp">1 Stempel</option>
                  {stampRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.title} · {rule.stamps} Stempel
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="large-action"
                disabled={!selectedCustomer || saving}
                onClick={() => {
                  const selectedRule = stampRules.find((rule) => rule.id === selectedStampRuleId);
                  queueLoyaltyAction({
                    title: "Stempel geben",
                    points: 0,
                    stamps: selectedRule?.stamps ?? 1,
                    reason: selectedRule?.title ?? "1 Stempel",
                    ruleId: selectedRule?.id ?? null,
                  });
                }}
                type="button"
              >
                <Stamp size={32} />
                Stempel geben
                <span className="muted">Tages-PIN erforderlich</span>
              </button>
            </div>
          ) : null}

          {!pointsQrReference && settings.loyalty_mode === "menu_points" ? (
            <div className="tablet-actions" style={{ marginTop: 16 }}>
              {activeRules.map((rule) => (
                <button
                  className="large-action"
                  disabled={!selectedCustomer || saving}
                  key={rule.id}
                  onClick={() =>
                    queueLoyaltyAction({
                      title: rule.title,
                      points: rule.points,
                      stamps: 0,
                      reason: rule.title,
                      ruleId: rule.id,
                    })
                  }
                  type="button"
                >
                  <BadgeCheck size={32} />
                  {rule.title}
                  <span className="muted">{rule.points} Punkte</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

        <article className={`card staff-customer-search-card${hasCustomerContext ? " is-secondary" : ""}`}>
          <form className="form" onSubmit={handleSearch}>
            <RequiredFieldsNote />
            <div className="field">
              <FormLabel htmlFor="customer-search" required>Schnellsuche</FormLabel>
              <input
                aria-required="true"
                className="input"
                id="customer-search"
                placeholder="QR, Telefon, Name oder Gästecode"
                required
                autoFocus={view === "search" && !scannerOpen}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="row-actions staff-customer-search-actions">
              <button className="button" type="submit"><Search size={18} />Gast suchen</button>
              <button className="button secondary" disabled={scannerStarting || scannerOpen} onClick={() => void startQrScanner()} type="button"><QrCode size={18} />QR scannen</button>
            </div>
          </form>

          {view === "search" ? (
            <div className="rule-list compact-list">
              {scannerOpen ? (
                <section className="scanner-panel" aria-live="polite">
                  <div className="scanner-head">
                    <strong>QR scannen</strong>
                    <button className="icon-button" onClick={dismissScanner} type="button" aria-label="Scanner schließen">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="scanner-video-frame">
                    <video
                      ref={scannerVideoRef}
                      className="scanner-video"
                      autoPlay
                      muted
                      playsInline
                      aria-label="Kamera-Vorschau für QR-Scan"
                    />
                    {scannerStarting ? <span className="scanner-overlay">Kamera wird geöffnet...</span> : null}
                  </div>
                  {scannerStatus ? <p className="muted">{scannerStatus}</p> : null}
                  {scannerError ? <p className="status-message error">{scannerError}</p> : null}
                  <form
                    className="scanner-manual-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!scannerManualValue.trim()) {
                        setScannerError("Bitte QR-Code, Telefon, Name oder Gästecode eingeben.");
                        return;
                      }
                      void handleScannerValue(scannerManualValue);
                    }}
                  >
                    <FormLabel htmlFor="scanner-manual-input" required>QR-Code manuell eingeben</FormLabel>
                    <div className="row-actions">
                      <input
                        aria-required="true"
                        className="input"
                        id="scanner-manual-input"
                        placeholder="QR-Code, Telefon, Name oder Gästecode"
                        required
                        value={scannerManualValue}
                        onChange={(event) => setScannerManualValue(event.target.value)}
                      />
                      <button className="button secondary" type="submit">
                        <Search size={16} />
                        Suchen
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}
              {staffLoading ? <p className="muted">Mitarbeiterdaten werden geladen...</p> : null}
              {!staffLoading && staffError ? <p className="status-message">{staffError}</p> : null}
              {filteredCustomers.map((customer) => (
                <button
                  className={`customer-row${customer.id === selectedCustomerId ? " active" : ""}`}
                  key={customer.id}
                  onClick={() => selectCustomer(customer.id)}
                  type="button"
                >
                  <strong>{customer.name}</strong>
                  <span>{customer.phone ?? customer.customer_code}</span>
                </button>
              ))}
            </div>
          ) : null}
        </article>
      </section> : null}

      </div>

      <nav aria-label="Mitarbeiter-Navigation" className="staff-premium-bottom-nav">
        <button
          aria-current={view === "home" && !scannerOpen && !pinDetailOpen && !moreOpen ? "page" : undefined}
          className={view === "home" && !scannerOpen && !pinDetailOpen && !moreOpen ? "active" : ""}
          onClick={() => { closeScanner(); openStaffView("home"); }}
          type="button"
        >
          <Home aria-hidden="true" size={21} />
          <span>Start</span>
        </button>
        <button
          aria-current={scannerOpen ? "page" : undefined}
          aria-label="Kunden-QR scannen"
          className={scannerOpen ? "active staff-premium-nav-scan" : "staff-premium-nav-scan"}
          disabled={scannerStarting || scannerOpen}
          onClick={() => void startQrScanner()}
          type="button"
        >
          <QrCode aria-hidden="true" size={22} />
          <span><span className="staff-premium-nav-label-wide">QR scannen</span><span className="staff-premium-nav-label-short">QR</span></span>
        </button>
        <button
          aria-current={pinDetailOpen ? "page" : undefined}
          className={pinDetailOpen ? "active" : ""}
          onClick={() => { closeScanner(); setPinDetailOpen(true); }}
          type="button"
        >
          <KeyRound aria-hidden="true" size={21} />
          <span>Tages-PIN</span>
        </button>
        <button
          aria-current={view === "search" && !scannerOpen && !pinDetailOpen && !moreOpen ? "page" : undefined}
          className={view === "search" && !scannerOpen && !pinDetailOpen && !moreOpen ? "active" : ""}
          onClick={() => { closeScanner(); openStaffView("search"); }}
          type="button"
        >
          <UserSearch aria-hidden="true" size={21} />
          <span><span className="staff-premium-nav-label-wide">Gast suchen</span><span className="staff-premium-nav-label-short">Suchen</span></span>
        </button>
        <button
          aria-current={moreOpen ? "page" : undefined}
          aria-expanded={moreOpen}
          className={moreOpen ? "active" : ""}
          onClick={() => { closeScanner(); setMoreOpen(true); }}
          type="button"
        >
          <MoreHorizontal aria-hidden="true" size={21} />
          <span>Mehr</span>
        </button>
      </nav>

      <AppDrawer
        description="Diese PIN wird für heutige Punktebuchungen benötigt."
        footer={
          <button className="button staff-premium-drawer-button" onClick={() => setPinDetailOpen(false)} type="button">
            Schließen
          </button>
        }
        onClose={() => setPinDetailOpen(false)}
        open={pinDetailOpen}
        title="Heutige Tages-PIN"
      >
        <div className="staff-premium-pin-detail">
          <span className="staff-premium-pin-detail-icon"><KeyRound aria-hidden="true" size={23} /></span>
          {todayPinLoading ? <p>Tages-PIN wird geladen …</p> : null}
          {!todayPinLoading && todayPinError ? (
            <div className="staff-premium-state staff-premium-state-error" role="alert">
              <CircleAlert aria-hidden="true" size={22} />
              <div><strong>Tages-PIN nicht verfügbar</strong><p>{todayPinError}</p></div>
            </div>
          ) : null}
          {!todayPinLoading && !todayPinError && todayPin ? (
            <strong className="staff-premium-pin-code" aria-label={`Tages-PIN ${todayPin.pin_code.split("").join(" ")}`}>
              {todayPin.pin_code.split("").map((digit, index) => <span key={`${digit}-detail-${index}`}>{digit}</span>)}
            </strong>
          ) : null}
          <div className="staff-premium-pin-detail-copy">
            <strong>Nur für Punktebuchungen</strong>
            <p>Zeige Gästen diese PIN nur direkt beim Sammeln von Punkten.</p>
          </div>
          <div className="staff-premium-pin-detail-valid">
            <Clock3 aria-hidden="true" size={18} />
            <span><strong>Heute gültig</strong><small>Automatisch bis 23:59</small></span>
          </div>
        </div>
      </AppDrawer>

      <AppDrawer
        description="Schnelle Wege für den Service."
        onClose={() => setMoreOpen(false)}
        open={moreOpen}
        title="Mehr"
      >
        <div className="staff-premium-more-menu">
          <section aria-label="Service-Aufgaben">
            <button onClick={() => { setMoreOpen(false); void startQrScanner(); }} type="button">
              <QrCode aria-hidden="true" size={21} /><span><strong>QR scannen</strong><small>Gast über Kamera öffnen</small></span><ChevronRight aria-hidden="true" size={18} />
            </button>
            <button onClick={() => openStaffView("search")} type="button">
              <UserSearch aria-hidden="true" size={21} /><span><strong>Gast suchen</strong><small>Name oder Gästecode</small></span><ChevronRight aria-hidden="true" size={18} />
            </button>
            <button onClick={() => openStaffView("earn")} type="button">
              <HandCoins aria-hidden="true" size={21} /><span><strong>Punkte geben</strong><small>Tages-PIN erforderlich</small></span><ChevronRight aria-hidden="true" size={18} />
            </button>
          </section>

          <aside className="staff-premium-help-card">
            <HelpCircle aria-hidden="true" size={22} />
            <div><strong>Hilfe im Service</strong><p>Bei Fragen zu einem Vorgang wende dich an die Restaurantleitung.</p></div>
          </aside>

          <div className="staff-premium-session-card">
            <span>{user?.email ?? "Angemeldeter Mitarbeiter"}</span>
            {logoutError ? <p role="alert">{logoutError}</p> : null}
            <button disabled={loggingOut} onClick={() => void handleStaffLogout()} type="button">
              <LogOut aria-hidden="true" size={19} />
              {loggingOut ? "Abmeldung läuft …" : "Abmelden"}
            </button>
          </div>
        </div>
      </AppDrawer>

      {view === "home" && message ? <p className="status-message">{message}</p> : null}

      <AppDrawer
        description={pendingPinAction?.detail}
        dismissOnOverlay={false}
        footer={pendingPinAction ? (
          <>
            <button className="button secondary" disabled={saving} onClick={() => setPendingPinAction(null)} type="button">Abbrechen</button>
            <button className="button" disabled={!pinDraft || saving} form="staff-pin-confirmation" type="submit">Bestätigen</button>
          </>
        ) : null}
        onClose={() => setPendingPinAction(null)}
        open={Boolean(pendingPinAction)}
        size="compact"
        title={pendingPinAction?.title ?? "Punkte bestätigen"}
      >
        {pendingPinAction ? (
          <form
            className="form"
            id="staff-pin-confirmation"
            onSubmit={(event) => {
              event.preventDefault();
              void executePinAction(pendingPinAction, pinDraft);
            }}
          >
            <RequiredFieldsNote />
            <div className="field">
              <FormLabel htmlFor="staff-pin-modal" required>{pendingPinAction.pinLabel}</FormLabel>
              <input
                aria-required="true"
                autoFocus
                className="input"
                data-drawer-autofocus="true"
                id="staff-pin-modal"
                inputMode="numeric"
                maxLength={4}
                placeholder="Tages-PIN eingeben"
                required
                type="password"
                value={pinDraft}
                onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <p className="muted">{pendingPinAction.pinHelp}</p>
            </div>
          </form>
        ) : null}
      </AppDrawer>
    </main>
  );
}
