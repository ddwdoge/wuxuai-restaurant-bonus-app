import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Calculator,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gift,
  HandCoins,
  HelpCircle,
  Home,
  KeyRound,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  QrCode,
  Search,
  SearchX,
  ShieldCheck,
  Stamp,
  UserSearch,
  WifiOff,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { Customer, LoyaltyRule, LoyaltySettings } from "../../shared/types/domain";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import { useAuth } from "../auth/AuthProvider";
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
import {
  consumeRedemptionCode,
  inspectRedemptionCode,
  loadStaffCustomerRewards,
  type ConsumeRedemptionCodeResult,
  type RedemptionCodePreview,
  type StaffCustomerRewardView,
} from "../rewards/rewardService";
import { useTenant } from "../tenant/TenantProvider";
import { loadStaffDailyActivity, type StaffDailyActivity } from "./staffActivityService";
import {
  classifyStaffRedemptionError,
  staffRedemptionErrorContent,
  type StaffRedemptionErrorKind,
} from "./staffRedemptionError";
import "./staff-premium.css";

type StaffView = "home" | "search" | "earn" | "redeem";

type PendingPinAction = {
  title: string;
  detail: string;
  pinLabel: string;
  pinHelp: string;
  run: (dailyPin: string) => Promise<void>;
};

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

type WindowWithBarcodeDetector = Window &
  typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructor;
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

function extractPointsCreditReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { type?: string; token?: string };
    return parsed.type === "wuxuai_points_credit" && parsed.token ? parsed.token : null;
  } catch {
    return /^\d{8}$/.test(trimmed.replace(/\s/g, "")) ? trimmed.replace(/\s/g, "") : null;
  }
}

export function StaffTablet() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { signOut, user } = useAuth();
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
  const [staffRewards, setStaffRewards] = useState<StaffCustomerRewardView[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [billAmount, setBillAmount] = useState(0);
  const [pointsQrReference, setPointsQrReference] = useState<string | null>(null);
  const [pointsPreview, setPointsPreview] = useState<RestaurantControlledPointsPreview | null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
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
  const [redemptionDigits, setRedemptionDigits] = useState<string[]>(() => Array(6).fill(""));
  const [redemptionStep, setRedemptionStep] = useState<"entry" | "preview" | "result" | "error">("entry");
  const [redemptionPreview, setRedemptionPreview] = useState<RedemptionCodePreview | null>(null);
  const [redemptionResult, setRedemptionResult] = useState<ConsumeRedemptionCodeResult | null>(null);
  const [redemptionErrorKind, setRedemptionErrorKind] = useState<StaffRedemptionErrorKind | null>(null);
  const [checkingRedemptionCode, setCheckingRedemptionCode] = useState(false);
  const [todayActivity, setTodayActivity] = useState<StaffDailyActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [pinDetailOpen, setPinDetailOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerAnimationRef = useRef<number | null>(null);
  const scannerActiveRef = useRef(false);
  const redemptionInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const redemptionErrorHeadingRef = useRef<HTMLHeadingElement | null>(null);

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
  }, [restaurantId]);

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
    if (!restaurantId || !selectedCustomerId) {
      setStaffRewards([]);
      return;
    }

    let cancelled = false;

    loadStaffCustomerRewards(restaurantId, selectedCustomerId)
      .then((nextRewards) => {
        if (!cancelled) setStaffRewards(nextRewards);
      })
      .catch((error) => {
        console.error("Punkteeinlösungen konnten nicht geladen werden.", error);
        if (!cancelled) {
          setStaffRewards([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId, selectedCustomerId]);

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
  const unlockedRewards = staffRewards.filter((offer) => offer.status === "unlocked");
  const redemptionCode = redemptionDigits.join("");
  const todayPointsIssued = todayActivity.reduce((total, activity) => total + activity.points_issued, 0);
  const todayRewardsRedeemed = todayActivity.reduce((total, activity) => total + activity.rewards_redeemed, 0);
  const currentDateLabel = useMemo(
    () => new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "long", year: "numeric" }).format(new Date()),
    [],
  );

  async function handleStaffLogout() {
    setLoggingOut(true);
    setLogoutError(null);

    try {
      await signOut();
      navigate("/restaurant/login", { replace: true });
    } catch {
      setLogoutError("Abmelden ist gerade nicht möglich. Bitte versuche es erneut.");
    } finally {
      setLoggingOut(false);
    }
  }

  function openStaffView(nextView: StaffView) {
    if (nextView !== "redeem") {
      setRedemptionDigits(Array(6).fill(""));
      setRedemptionStep("entry");
      setRedemptionPreview(null);
      setRedemptionResult(null);
      setRedemptionErrorKind(null);
      setMessage(null);
    }
    setView(nextView);
    setMoreOpen(false);
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
    scannerActiveRef.current = false;

    if (scannerAnimationRef.current !== null) {
      cancelAnimationFrame(scannerAnimationRef.current);
      scannerAnimationRef.current = null;
    }

    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }

    if (scannerVideoRef.current) {
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
    const pointsReference = extractPointsCreditReference(nextQuery);
    if (pointsReference && restaurantId && restaurantControlledEnabled) {
      setPointsQrReference(pointsReference);
      setPointsPreview(null);
      setBillAmount(0);
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
        setView("redeem");
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
    if (!restaurantControlledEnabled) {
      setMessage("Der Kunden-QR-Scanner ist für dieses Restaurant nicht aktiviert.");
      return;
    }
    setView("search");
    setScannerOpen(true);
    setScannerStarting(true);
    setScannerError(null);
    setScannerStatus("Kamera wird geöffnet...");
    setMessage(null);
    stopScanner();

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerStarting(false);
      setScannerStatus(null);
      setScannerError("Dieser Browser unterstützt keinen Kamera-Zugriff. Bitte suche den Gast manuell.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      scannerStreamRef.current = stream;
      scannerActiveRef.current = true;

      if (scannerVideoRef.current) {
        scannerVideoRef.current.srcObject = stream;
        await scannerVideoRef.current.play();
      }

      const BarcodeDetector = (window as WindowWithBarcodeDetector).BarcodeDetector;
      if (!BarcodeDetector) {
        setScannerStarting(false);
        setScannerStatus("Kamera geöffnet. Automatisches QR-Lesen wird von diesem Browser nicht unterstützt.");
        return;
      }

      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      setScannerStarting(false);
      setScannerStatus("QR-Code vor die Kamera halten.");

      const scanFrame = async () => {
        if (!scannerActiveRef.current || !scannerVideoRef.current) return;

        try {
          if (scannerVideoRef.current.readyState >= 2) {
            const codes = await detector.detect(scannerVideoRef.current);
            const rawValue = codes.find((code) => code.rawValue)?.rawValue;
            if (rawValue) {
              await handleScannerValue(rawValue);
              return;
            }
          }
        } catch (error) {
          console.error("QR konnte nicht automatisch gelesen werden.", error);
          setScannerStatus("Kamera geöffnet. Bitte QR-Code ruhig vor die Kamera halten.");
        }

        scannerAnimationRef.current = requestAnimationFrame(scanFrame);
      };

      scannerAnimationRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      console.error("QR-Scanner konnte nicht geöffnet werden.", error);
      stopScanner();
      setScannerStarting(false);
      setScannerStatus(null);
      setScannerError(scannerErrorMessage(error));
    }
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
    setScannerStarting(false);
    setScannerStatus(null);
    setScannerError(null);
    setScannerManualValue("");
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
      },
    });
  }

  async function handleRestaurantControlledPreview() {
    if (!restaurantId || !pointsQrReference) return;
    const amountCents = Math.round(billAmount * 100);
    setSaving(true); setMessage(null);
    try {
      setPointsPreview(await previewRestaurantControlledPoints(restaurantId, pointsQrReference, amountCents));
    } catch (error) {
      setPointsPreview(null);
      setMessage(error instanceof Error ? error.message : "Punkte konnten nicht berechnet werden.");
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
          amountCents: pointsPreview.amount_cents, dailyPin, idempotencyKey, receiptNumber });
        setPointsQrReference(null); setPointsPreview(null); setReceiptNumber(""); setBillAmount(0);
        setMessage(`${result.points_added} Punkte wurden gutgeschrieben.`);
        setView("home");
      },
    });
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await findCustomerFromSearch(query);
  }

  function resetRedemptionFlow() {
    setRedemptionDigits(Array(6).fill(""));
    setRedemptionStep("entry");
    setRedemptionPreview(null);
    setRedemptionResult(null);
    setRedemptionErrorKind(null);
    setMessage(null);
    window.setTimeout(() => redemptionInputRefs.current[0]?.focus(), 0);
  }

  function updateRedemptionDigits(startIndex: number, value: string) {
    setMessage(null);
    const incomingDigits = value.replace(/\D/g, "").slice(0, 6 - startIndex).split("");
    if (incomingDigits.length === 0) {
      setRedemptionDigits((current) => current.map((digit, index) => (index === startIndex ? "" : digit)));
      return;
    }

    setRedemptionDigits((current) => {
      const next = [...current];
      incomingDigits.forEach((digit, offset) => {
        next[startIndex + offset] = digit;
      });
      return next;
    });

    const nextIndex = Math.min(startIndex + incomingDigits.length, 5);
    redemptionInputRefs.current[nextIndex]?.focus();
  }

  function handleRedemptionKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !redemptionDigits[index] && index > 0) {
      event.preventDefault();
      setRedemptionDigits((current) => current.map((digit, digitIndex) => (digitIndex === index - 1 ? "" : digit)));
      redemptionInputRefs.current[index - 1]?.focus();
    }
  }

  function handleRedemptionPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedDigits) return;
    event.preventDefault();
    setMessage(null);
    setRedemptionDigits(Array.from({ length: 6 }, (_, index) => pastedDigits[index] ?? ""));
    redemptionInputRefs.current[Math.min(pastedDigits.length, 6) - 1]?.focus();
  }

  function showRedemptionError(error: unknown, phase: "preview" | "consume") {
    setRedemptionPreview(null);
    setRedemptionResult(null);
    setRedemptionErrorKind(classifyStaffRedemptionError(error, phase));
    setRedemptionStep("error");
    setMessage(null);
  }

  async function runRedemptionPreview() {
    if (!restaurantId || checkingRedemptionCode) return;
    if (!/^\d{6}$/.test(redemptionCode)) {
      setMessage("Bitte gib den sechsstelligen Einlösecode ein.");
      const firstEmptyIndex = Math.max(0, redemptionDigits.findIndex((digit) => !digit));
      window.setTimeout(() => redemptionInputRefs.current[firstEmptyIndex]?.focus(), 0);
      return;
    }

    setCheckingRedemptionCode(true);
    setMessage(null);
    setRedemptionErrorKind(null);
    try {
      const preview = await inspectRedemptionCode(restaurantId, redemptionCode);
      setRedemptionPreview(preview);
      setRedemptionStep("preview");
    } catch (error) {
      showRedemptionError(error, "preview");
    } finally {
      setCheckingRedemptionCode(false);
    }
  }

  async function handleRedemptionCode(event: FormEvent) {
    event.preventDefault();
    await runRedemptionPreview();
  }

  async function confirmRedemptionCode() {
    if (!restaurantId || checkingRedemptionCode || !/^\d{6}$/.test(redemptionCode)) return;
    setCheckingRedemptionCode(true);
    setMessage(null);
    setRedemptionErrorKind(null);
    try {
      const result = await consumeRedemptionCode(restaurantId, redemptionCode);
      setRedemptionResult(result);
      setRedemptionStep("result");
      if (selectedCustomerId) {
        const nextRewards = await loadStaffCustomerRewards(restaurantId, selectedCustomerId);
        setStaffRewards(nextRewards);
      }
    } catch (error) {
      showRedemptionError(error, "consume");
    } finally {
      setCheckingRedemptionCode(false);
    }
  }

  function handleRedemptionErrorPrimaryAction() {
    if (redemptionErrorKind === "unauthorized") {
      openStaffView("home");
      return;
    }

    if (redemptionErrorKind === "preview_network_error" || redemptionErrorKind === "consume_unknown") {
      void runRedemptionPreview();
      return;
    }

    resetRedemptionFlow();
  }

  useEffect(() => {
    if (view !== "redeem" || redemptionStep !== "error") return;
    window.setTimeout(() => redemptionErrorHeadingRef.current?.focus(), 0);
  }, [redemptionErrorKind, redemptionStep, view]);

  useEffect(() => {
    if (view !== "redeem" || redemptionStep === "entry" || checkingRedemptionCode) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setRedemptionDigits(Array(6).fill(""));
      setRedemptionStep("entry");
      setRedemptionPreview(null);
      setRedemptionResult(null);
      setRedemptionErrorKind(null);
      setMessage(null);
      window.setTimeout(() => redemptionInputRefs.current[0]?.focus(), 0);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [checkingRedemptionCode, redemptionStep, view]);

  function selectCustomer(customerId: string, nextView: StaffView = "search") {
    setSelectedCustomerId(customerId);
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
          <span><ShieldCheck aria-hidden="true" size={16} />Mitarbeiterbereich</span>
          <time dateTime={new Date().toISOString().slice(0, 10)}><CalendarDays aria-hidden="true" size={16} />{currentDateLabel}</time>
        </div>
      </header>

      <div className="staff-premium-workspace">
        {view === "home" ? (
          <>
            <section className="staff-premium-intro">
              <span className="staff-premium-kicker">Heute im Service</span>
              <h2>Bereit für den nächsten Gast.</h2>
              <p>Tages-PIN zeigen, Einlösecode prüfen oder einen Gast schnell finden.</p>
            </section>

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
              <span className="staff-premium-pin-copy">Nur für heutige Punktebuchungen.</span>
              <span className="staff-premium-pin-valid"><Clock3 aria-hidden="true" size={16} />Gültig bis heute 23:59<ChevronRight aria-hidden="true" size={18} /></span>
            </button>

            <button className="staff-premium-primary-action" onClick={() => openStaffView("redeem")} type="button">
              <span><Gift aria-hidden="true" size={24} /></span>
              <strong>Einlösecode prüfen</strong>
              <small>Sechsstelligen Kundencode sicher prüfen</small>
              <ChevronRight aria-hidden="true" size={22} />
            </button>

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
                {restaurantControlledEnabled ? <button onClick={() => void startQrScanner()} type="button"><QrCode aria-hidden="true" size={22} /><span><strong>Kunden-QR scannen</strong><small>Punkte sicher gutschreiben</small></span><ChevronRight aria-hidden="true" size={18} /></button> : null}
                <button onClick={() => openStaffView("search")} type="button"><UserSearch aria-hidden="true" size={22} /><span><strong>Gast suchen</strong><small>Name oder Code</small></span><ChevronRight aria-hidden="true" size={18} /></button>
                {customerInitiatedStaffToolsEnabled ? <button onClick={() => openStaffView("earn")} type="button"><HandCoins aria-hidden="true" size={22} /><span><strong>Punkte geben</strong><small>Tages-PIN nötig</small></span><ChevronRight aria-hidden="true" size={18} /></button> : null}
              </div>
            </section>
          </>
        ) : (
          <button className="staff-premium-back" onClick={() => openStaffView("home")} type="button"><Home aria-hidden="true" size={18} />Zur Startseite</button>
        )}

      {view !== "home" && view !== "redeem" ? <section className="grid two staff-premium-existing-grid">
        <article className="card">
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
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button className="button" type="submit">
              <Search size={18} />
              Gast suchen
            </button>
          </form>

          {view === "search" ? (
            <div className="rule-list compact-list">
              {scannerOpen ? (
                <section className="scanner-panel" aria-live="polite">
                  <div className="scanner-head">
                    <strong>QR scannen</strong>
                    <button className="icon-button" onClick={closeScanner} type="button" aria-label="Scanner schließen">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="scanner-video-frame">
                    <video
                      ref={scannerVideoRef}
                      className="scanner-video"
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

        <article className="card">
          <h2>{selectedCustomer?.name ?? "Kein Gast gewählt"}</h2>
          {selectedCustomer ? (
            <>
              <p className="muted">
                <QrCode size={16} /> {selectedCustomer.customer_code}
              </p>
              <p>
                <span className="pill">{selectedCustomer.points_balance} Punkte</span>{" "}
                <span className="pill">{selectedCustomer.stamp_balance} Stempel</span>{" "}
                <span className="pill">{unlockedRewards.length} Punkteeinlösungen</span>
              </p>
            </>
          ) : (
            <p className="muted">Bitte QR scannen oder Gast suchen.</p>
          )}
        </article>
      </section> : null}

      {view === "earn" ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>{pointsQrReference ? "Punkte gutschreiben" : "Punkte/Stempel geben"}</h2>
          {pointsQrReference ? <div className="restaurant-controlled-credit">
            <p className="muted">Erfasse nur den direkt im Restaurant bezahlten Betrag nach Rabatten. Trinkgeld, Gutscheinkäufe und Lieferplattformen zählen nicht.</p>
            <div className="grid two">
              <div className="field"><FormLabel htmlFor="controlled-bill-amount" required>Bonusberechtigter Betrag</FormLabel><input aria-required="true" className="input" id="controlled-bill-amount" inputMode="decimal" max={(settings.points_collection_max_amount_cents ?? 30000) / 100} min="0.01" onChange={(event) => { setBillAmount(Number(event.target.value) || 0); setPointsPreview(null); }} required step="0.01" type="number" value={billAmount || ""} /></div>
              <div className="field"><FormLabel htmlFor="controlled-receipt" optional>Bonnummer</FormLabel><input className="input" id="controlled-receipt" onChange={(event) => setReceiptNumber(event.target.value)} value={receiptNumber} /></div>
            </div>
            {!pointsPreview ? <button className="button" disabled={saving || billAmount <= 0} onClick={() => void handleRestaurantControlledPreview()} type="button">Punkte serverseitig berechnen</button> : <div className="settings-info-card">
              <span>{pointsPreview.customer_label} · aktuell {pointsPreview.points_balance} Punkte</span>
              <strong>+{pointsPreview.expected_points} Punkte</strong>
              {pointsPreview.boost_multiplier > 1 ? <p className="muted">{pointsPreview.base_points} Basispunkte · {pointsPreview.boost_multiplier}× Freundschaftsbonus</p> : null}
              {pointsPreview.high_amount_warning ? <p className="status-message">Hoher Betrag: Bitte Rechnung und Bonnummer sorgfältig prüfen.</p> : null}
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

      {view === "redeem" ? (
        <section className="staff-redemption-workflow" aria-labelledby="staff-redemption-title">
          {redemptionStep === "entry" ? (
            <form className="staff-redemption-step" onSubmit={handleRedemptionCode}>
              <div className="staff-redemption-heading">
                <span className="staff-redemption-icon"><Gift aria-hidden="true" size={24} /></span>
                <span className="staff-premium-kicker">Punkteeinlösung</span>
                <h2 id="staff-redemption-title">Einlösecode prüfen</h2>
                <p>Bitte gib den sechsstelligen Code ein, den der Gast auf seinem Smartphone zeigt.</p>
              </div>

              <fieldset className="staff-code-fieldset">
                <legend>Sechsstelliger Einlösecode<span aria-hidden="true" className="required-field-marker"> *</span><span className="sr-only"> Pflichtfeld</span></legend>
                <div className="staff-code-inputs" onPaste={handleRedemptionPaste}>
                  {redemptionDigits.map((digit, index) => (
                    <input
                      aria-label={`Ziffer ${index + 1} des Einlösecodes`}
                      aria-required="true"
                      autoComplete="one-time-code"
                      autoFocus={index === 0}
                      inputMode="numeric"
                      key={index}
                      maxLength={1}
                      onChange={(event) => updateRedemptionDigits(index, event.target.value)}
                      onKeyDown={(event) => handleRedemptionKeyDown(index, event)}
                      ref={(element) => { redemptionInputRefs.current[index] = element; }}
                      required
                      type="text"
                      value={digit}
                    />
                  ))}
                </div>
                <p><ShieldCheck aria-hidden="true" size={17} />Für die Einlösung ist keine Tages-PIN erforderlich. Die Prüfung verbraucht den Code noch nicht.</p>
              </fieldset>

              {message ? <p className="staff-redemption-inline-error" role="alert">{message}</p> : null}

              <div className="staff-redemption-actions">
                <button className="staff-redemption-primary" disabled={checkingRedemptionCode || redemptionCode.length !== 6} type="submit">
                  {checkingRedemptionCode ? <><span className="staff-redemption-spinner" aria-hidden="true" />Code wird geprüft …</> : <>Code sicher prüfen
                  <ChevronRight aria-hidden="true" size={20} />
                  </>}
                </button>
                <button className="staff-redemption-secondary" onClick={() => openStaffView("home")} type="button">Abbrechen</button>
              </div>
            </form>
          ) : null}

          {redemptionStep === "preview" && redemptionPreview ? (
            <div className="staff-redemption-step staff-redemption-confirmation">
              <div className="staff-redemption-heading">
                <span className="staff-redemption-icon"><ShieldCheck aria-hidden="true" size={24} /></span>
                <span className="staff-premium-kicker">Code gültig</span>
                <h2 id="staff-redemption-title">{redemptionPreview.title}</h2>
                <p>Prüfe die Punkteeinlösung gemeinsam mit dem Gast. Erst die folgende Bestätigung verbraucht den Code.</p>
              </div>

              <div className="staff-redemption-review-card">
                <div><span>Kategorie</span><strong>{redemptionPreview.category ?? (redemptionPreview.redemption_type === "points_redemption" ? "Punkteeinlösung" : "Geschenk")}</strong></div>
                {redemptionPreview.product_price !== null ? <div><span>Produktwert</span><strong>Wert bis {new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(redemptionPreview.product_price)}</strong></div> : null}
                {redemptionPreview.description ? <div><span>Bedingung</span><strong>{redemptionPreview.description}</strong></div> : null}
                <div><span>Restaurant</span><strong>{redemptionPreview.restaurant_name}</strong></div>
                <div><span>Status</span><strong className="staff-redemption-valid-status">Code gültig</strong></div>
                <div><span>Gültig bis</span><strong>{new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(new Date(redemptionPreview.expires_at))} Uhr</strong></div>
              </div>

              <aside className="staff-redemption-notice">
                <Clock3 aria-hidden="true" size={20} />
                <p>Der Server prüft Status, Ablauf und Restaurant bei der finalen Bestätigung erneut.</p>
              </aside>

              {message ? <p className="staff-redemption-inline-error" role="alert">{message}</p> : null}

              <div className="staff-redemption-actions">
                <button className="staff-redemption-primary" disabled={checkingRedemptionCode} onClick={() => void confirmRedemptionCode()} type="button">
                  {checkingRedemptionCode ? <><span className="staff-redemption-spinner" aria-hidden="true" />Einlösung wird bestätigt …</> : <>Einlösung bestätigen<BadgeCheck aria-hidden="true" size={20} /></>}
                </button>
                <button className="staff-redemption-secondary" disabled={checkingRedemptionCode} onClick={() => { setRedemptionPreview(null); setRedemptionStep("entry"); }} type="button">Zurück</button>
              </div>
            </div>
          ) : null}

          {redemptionStep === "result" && redemptionResult ? (
            <div className="staff-redemption-step staff-redemption-result">
              <div className="staff-redemption-heading">
                <span className="staff-redemption-icon staff-redemption-icon-success"><BadgeCheck aria-hidden="true" size={25} /></span>
                <span className="staff-premium-kicker">Serverseitig bestätigt</span>
                <h2 id="staff-redemption-title">Gültige Punkteeinlösung</h2>
                <p>Der Code wurde geprüft und verbindlich als verwendet markiert.</p>
              </div>

              <article className="staff-redemption-reward-card">
                <span className="staff-redemption-reward-visual"><Gift aria-hidden="true" size={30} /></span>
                <div><span>{redemptionResult.redemption_type === "points_redemption" ? "Punkteeinlösung" : "Geschenk"}</span><h3>{redemptionResult.title}</h3></div>
                <dl>
                  <div><dt>Restaurant</dt><dd>{staffRestaurant?.name ?? "Restaurant"}</dd></div>
                  <div><dt>Status</dt><dd>Bestätigt</dd></div>
                  <div><dt>Zeitpunkt</dt><dd>{new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(new Date(redemptionResult.redeemed_at))} Uhr</dd></div>
                </dl>
              </article>

              <div className="staff-redemption-actions">
                <button className="staff-redemption-primary" onClick={resetRedemptionFlow} type="button">Nächsten Code prüfen<ChevronRight aria-hidden="true" size={20} /></button>
                <button className="staff-redemption-secondary" onClick={() => openStaffView("home")} type="button">Zur Startseite</button>
              </div>
            </div>
          ) : null}

          {redemptionStep === "error" && redemptionErrorKind ? (
            <div
              aria-live="assertive"
              className={"staff-redemption-step staff-redemption-error staff-redemption-error-" + staffRedemptionErrorContent[redemptionErrorKind].tone}
              role="alert"
            >
              <div className="staff-redemption-heading">
                <span className="staff-redemption-icon staff-redemption-error-icon">
                  {redemptionErrorKind === "preview_network_error" || redemptionErrorKind === "consume_unknown" ? <WifiOff aria-hidden="true" size={24} /> : null}
                  {redemptionErrorKind === "unauthorized" ? <LockKeyhole aria-hidden="true" size={24} /> : null}
                  {redemptionErrorKind === "not_found" ? <SearchX aria-hidden="true" size={24} /> : null}
                  {redemptionErrorKind === "expired" ? <Clock3 aria-hidden="true" size={24} /> : null}
                  {!["preview_network_error", "consume_unknown", "unauthorized", "not_found", "expired"].includes(redemptionErrorKind) ? <CircleAlert aria-hidden="true" size={24} /> : null}
                </span>
                <span className="staff-premium-kicker">{staffRedemptionErrorContent[redemptionErrorKind].eyebrow}</span>
                <h2 id="staff-redemption-title" ref={redemptionErrorHeadingRef} tabIndex={-1}>{staffRedemptionErrorContent[redemptionErrorKind].title}</h2>
                <p>{staffRedemptionErrorContent[redemptionErrorKind].text}</p>
              </div>

              {redemptionErrorKind === "consume_unknown" ? (
                <aside className="staff-redemption-notice">
                  <ShieldCheck aria-hidden="true" size={20} />
                  <p>Die erneute Prüfung fragt nur den aktuellen Serverstatus ab. Sie bestätigt die Einlösung nicht automatisch erneut.</p>
                </aside>
              ) : null}

              <div className="staff-redemption-actions">
                <button className="staff-redemption-primary" disabled={checkingRedemptionCode} onClick={handleRedemptionErrorPrimaryAction} type="button">
                  {checkingRedemptionCode ? <><span className="staff-redemption-spinner" aria-hidden="true" />Status wird geprüft …</> : <>{staffRedemptionErrorContent[redemptionErrorKind].primaryAction}<ChevronRight aria-hidden="true" size={20} /></>}
                </button>
                {staffRedemptionErrorContent[redemptionErrorKind].secondaryAction ? (
                  <button className="staff-redemption-secondary" disabled={checkingRedemptionCode} onClick={() => openStaffView("home")} type="button">
                    {staffRedemptionErrorContent[redemptionErrorKind].secondaryAction}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      </div>

      <nav aria-label="Mitarbeiter-Navigation" className="staff-premium-bottom-nav">
        <button
          aria-current={view === "home" ? "page" : undefined}
          className={view === "home" ? "active" : ""}
          onClick={() => openStaffView("home")}
          type="button"
        >
          <Home aria-hidden="true" size={21} />
          <span>Start</span>
        </button>
        <button
          aria-current={view === "redeem" ? "page" : undefined}
          className={view === "redeem" ? "active" : ""}
          onClick={() => openStaffView("redeem")}
          type="button"
        >
          <Gift aria-hidden="true" size={21} />
          <span>Code prüfen</span>
        </button>
        <button onClick={() => setPinDetailOpen(true)} type="button">
          <KeyRound aria-hidden="true" size={21} />
          <span>Tages-PIN</span>
        </button>
        <button aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} type="button">
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

      {message && view !== "redeem" ? <p className="status-message">{message}</p> : null}

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
