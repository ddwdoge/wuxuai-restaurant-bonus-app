import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Calculator, Camera, Gift, HandCoins, QrCode, Search, Stamp, UserSearch, X } from "lucide-react";
import { useParams } from "react-router-dom";
import type { Customer, LoyaltyRule, LoyaltySettings } from "../../shared/types/domain";
import {
  applyStaffLoyaltyAction,
  defaultSettingsForMode,
  loadTodayRestaurantPin,
  loadCustomers,
  loadLoyaltyRules,
  loadLoyaltySettings,
  resolveCustomerQrToken,
  rulesForMode,
  type TodayRestaurantPin,
} from "../loyalty/loyaltyService";
import {
  consumeRedemptionCode,
  loadStaffCustomerRewards,
  type StaffCustomerRewardView,
} from "../rewards/rewardService";
import { useTenant } from "../tenant/TenantProvider";

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

export function StaffTablet() {
  const { slug } = useParams<{ slug: string }>();
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
  const [staffRewardsLoading, setStaffRewardsLoading] = useState(false);
  const [staffRewardsError, setStaffRewardsError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [billAmount, setBillAmount] = useState(0);
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
  const [redemptionCode, setRedemptionCode] = useState("");
  const [checkingRedemptionCode, setCheckingRedemptionCode] = useState(false);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerAnimationRef = useRef<number | null>(null);
  const scannerActiveRef = useRef(false);

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
      setStaffRewardsError(null);
      setStaffRewardsLoading(false);
      return;
    }

    let cancelled = false;
    setStaffRewardsLoading(true);
    setStaffRewardsError(null);

    loadStaffCustomerRewards(restaurantId, selectedCustomerId)
      .then((nextRewards) => {
        if (!cancelled) setStaffRewards(nextRewards);
      })
      .catch((error) => {
        console.error("Punkteeinlösungen konnten nicht geladen werden.", error);
        if (!cancelled) {
          setStaffRewards([]);
          setStaffRewardsError("Punkteeinlösungen konnten gerade nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) setStaffRewardsLoading(false);
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
  const stampRules = activeRules.filter((rule) => rule.stamps > 0);
  const unlockedRewards = staffRewards.filter((offer) => offer.status === "unlocked");
  const lockedWelcomeGift = staffRewards.find((offer) => offer.status === "locked" && offer.is_starter_reward) ?? null;

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

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await findCustomerFromSearch(query);
  }

  async function handleRedemptionCode(event: FormEvent) {
    event.preventDefault();
    if (!restaurantId) return;
    if (!/^\d{6}$/.test(redemptionCode)) {
      setMessage("Bitte gib den sechsstelligen Einlösecode ein.");
      return;
    }

    setCheckingRedemptionCode(true);
    setMessage(null);
    try {
      const result = await consumeRedemptionCode(restaurantId, redemptionCode);
      setMessage(`${result.title}: Einlösung erfolgreich bestätigt.`);
      setRedemptionCode("");
      if (selectedCustomerId) {
        const nextRewards = await loadStaffCustomerRewards(restaurantId, selectedCustomerId);
        setStaffRewards(nextRewards);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
      if (errorMessage.includes("abgelaufen")) {
        setMessage("Der Einlösecode ist abgelaufen.");
      } else if (errorMessage.includes("bereits verwendet")) {
        setMessage("Der Einlösecode wurde bereits verwendet.");
      } else {
        setMessage("Der Einlösecode ist nicht gültig.");
      }
    } finally {
      setCheckingRedemptionCode(false);
    }
  }

  function selectCustomer(customerId: string, nextView: StaffView = "search") {
    setSelectedCustomerId(customerId);
    setView(nextView);
  }

  return (
    <main className="tablet-shell">
      <header className="page-header">
        <div className="restaurant-brand-header">
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
            <h1 className="restaurant-brand-title">{staffRestaurant?.name ?? "Restaurant"} Mitarbeiter</h1>
            <p className="restaurant-brand-subtitle">QR scannen, Gast finden, Punkteeinlösung prüfen.</p>
          </div>
        </div>
        <span className="pill">Bonusprogramm</span>
      </header>

      <section className="card daily-pin-card">
        <span className="pill">Heutige Tages-PIN</span>
        {todayPinLoading ? <p className="daily-pin-state">Tages-PIN wird geladen...</p> : null}
        {!todayPinLoading && todayPinError ? <p className="daily-pin-state error">{todayPinError}</p> : null}
        {!todayPinLoading && !todayPinError && todayPin ? (
          <strong className="daily-pin-code">{todayPin.pin_code}</strong>
        ) : null}
        <p className="muted">Diese PIN wird benötigt, wenn Gäste Punkte sammeln.</p>
        <p className="muted">Gültig bis heute 23:59.</p>
      </section>

      <section className="tablet-actions staff-home-actions">
        <button className="large-action" onClick={() => void startQrScanner()} type="button">
          <QrCode size={34} />
          QR scannen
          <span className="muted">Kamera öffnen</span>
        </button>
        <button className="large-action" onClick={() => setView("search")} type="button">
          <UserSearch size={34} />
          Gast suchen
          <span className="muted">Name, Telefon, Code</span>
        </button>
        <button className="large-action" onClick={() => setView("earn")} type="button">
          <HandCoins size={34} />
          Punkte/Stempel geben
          <span className="muted">Tages-PIN erforderlich</span>
        </button>
        <button className="large-action" onClick={() => setView("redeem")} type="button">
          <Gift size={34} />
          Punkteeinlösung prüfen
          <span className="muted">{unlockedRewards.length} verfügbar</span>
        </button>
      </section>

      <section className="grid two" style={{ marginTop: 16 }}>
        <article className="card">
          <form className="form" onSubmit={handleSearch}>
            <div className="field">
              <label htmlFor="customer-search">Schnellsuche</label>
              <input
                className="input"
                id="customer-search"
                placeholder="QR, Telefon, Name oder Gästecode"
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
                    <label htmlFor="scanner-manual-input">QR-Code manuell eingeben</label>
                    <div className="row-actions">
                      <input
                        className="input"
                        id="scanner-manual-input"
                        placeholder="QR-Code, Telefon, Name oder Gästecode"
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
      </section>

      {view === "earn" ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Punkte/Stempel geben</h2>
          {settings.loyalty_mode === "amount_based" ? (
            <div className="grid two">
              <div className="field">
                <label htmlFor="bill-amount">Rechnungsbetrag</label>
                <input
                  className="input"
                  id="bill-amount"
                  min="0"
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

          {settings.loyalty_mode === "stamp_based" ? (
            <div className="grid two">
              <div className="field">
                <label htmlFor="stamp-rule">Stempel-Regel</label>
                <select
                  className="select"
                  id="stamp-rule"
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

          {settings.loyalty_mode === "menu_points" ? (
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
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Punkteeinlösung prüfen</h2>
          <form className="redemption-code-check" onSubmit={handleRedemptionCode}>
            <div className="field">
              <label htmlFor="redemption-code">Sechsstelliger Einlösecode</label>
              <input
                className="input redemption-code-input"
                id="redemption-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setRedemptionCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                value={redemptionCode}
              />
            </div>
            <button className="button" disabled={checkingRedemptionCode || redemptionCode.length !== 6} type="submit">
              {checkingRedemptionCode ? "Code wird geprüft..." : "Einlösung bestätigen"}
            </button>
            <p className="muted">Für die Einlösung ist keine Tages-PIN erforderlich.</p>
          </form>
          <h3>Verfügbare Punkteeinlösungen</h3>
          <div className="tablet-actions" style={{ marginTop: 16 }}>
            {staffRewardsLoading ? <p className="muted">Punkteeinlösungen werden geladen...</p> : null}
            {!staffRewardsLoading && staffRewardsError ? <p className="status-message error">{staffRewardsError}</p> : null}
            {unlockedRewards.map((offer) => (
              <article
                className="large-action staff-reward-card"
                key={offer.customer_reward_id}
              >
                <Gift size={32} />
                {offer.title}
                <span className="pill">Zum Einlösen bereit</span>
                <span className="muted">{offer.category ?? offer.product_group ?? "Punkteeinlösung"}</span>
              </article>
            ))}
            {!staffRewardsLoading && !staffRewardsError && unlockedRewards.length === 0 ? (
              <p className="muted">Keine verfügbare Punkteeinlösung.</p>
            ) : null}
          </div>
          {lockedWelcomeGift ? (
            <aside className="staff-how-box">
              <h3>Willkommensgeschenk noch gesperrt.</h3>
              <p className="muted">Es wird nach der ersten Punktebuchung freigeschaltet.</p>
            </aside>
          ) : null}
          <aside className="staff-how-box">
            <h3>So funktioniert's</h3>
            <p className="muted">Bereits verwendete Punkteeinlösungen werden hier nicht mehr angezeigt.</p>
          </aside>
        </section>
      ) : null}

      {message ? <p className="status-message">{message}</p> : null}

      {pendingPinAction ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="pin-modal card"
            onSubmit={(event) => {
              event.preventDefault();
              void executePinAction(pendingPinAction, pinDraft);
            }}
          >
            <h2>{pendingPinAction.title}</h2>
            <p className="muted">{pendingPinAction.detail}</p>
            <div className="field">
              <label htmlFor="staff-pin-modal">{pendingPinAction.pinLabel}</label>
              <input
                autoFocus
                className="input"
                id="staff-pin-modal"
                inputMode="numeric"
                maxLength={4}
                placeholder="Tages-PIN eingeben"
                type="password"
                value={pinDraft}
                onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <p className="muted">{pendingPinAction.pinHelp}</p>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => setPendingPinAction(null)} type="button">
                Abbrechen
              </button>
              <button className="button" disabled={!pinDraft || saving} type="submit">
                Bestätigen
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
