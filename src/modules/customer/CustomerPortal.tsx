import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Gift, Info, QrCode, UserPlus, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import type { LoyaltySettings, Restaurant, RestaurantBranding } from "../../shared/types/domain";
import { startCustomerRedemption } from "../rewards/rewardService";
import {
  collectBonusPoints,
  calculateBonusTierPoints,
  createReferralLink,
  defaultBonusAmountTiers,
  loadCustomerPortalData,
  registerRestaurantGuest,
  type BonusPointCollectionResult,
  type GuestRegistrationResult,
  type PublicCustomerOfferView,
  type PublicLoyaltySettings,
  type PublicPortalCustomer,
} from "../loyalty/loyaltyService";
import {
  isInvalidCustomerTokenError,
  readStoredCustomerToken,
  removeStoredCustomerToken,
  saveStoredCustomerToken,
} from "./customerTokenStorage";

type GuestStep = "welcome" | "register" | "success";

type ActiveRedemptionCode = {
  code: string;
  expiresAt: string;
  rewardId: string;
  assignmentId: string | null;
  title: string;
  redemptionType: "welcome_gift" | "birthday_gift" | "points_redemption";
  pointsSpent: number;
};

function formatBoostRemaining(activeUntil: string, remainingDays: number | undefined, nowMs: number) {
  const remainingMs = new Date(activeUntil).getTime() - nowMs;
  if (remainingMs <= 0) return "Boost abgelaufen";
  if (remainingMs < 86_400_000) return "Nur noch heute aktiv";
  const days = Math.max(1, remainingDays ?? Math.ceil(remainingMs / 86_400_000));
  return days === 1 ? "Noch 1 Tag gültig" : `Noch ${days} Tage gültig`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatEuroSuffix(value: number) {
  return `${new Intl.NumberFormat("de-AT", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)} €`;
}

function welcomeGiftDetail(reward: {
  product_price?: number | null;
  welcome_gift_mode?: "value_limit" | "fixed_product";
  fixed_product_name?: string | null;
  available_products?: string[] | null;
  product_group?: string | null;
}) {
  if (reward.welcome_gift_mode === "fixed_product" && reward.fixed_product_name) {
    return reward.fixed_product_name;
  }
  if (reward.product_price) {
    return `bis ${formatEuro(reward.product_price)}`;
  }
  if (reward.available_products?.length) {
    return reward.available_products.join(", ");
  }
  return reward.product_group ?? null;
}

const rewardAssets: Record<string, { icon: string; asset: string }> = {
  Getränk: { icon: "🥤", asset: "drink" },
  Kaffee: { icon: "☕", asset: "coffee" },
  Dessert: { icon: "🍰", asset: "dessert" },
  Vorspeise: { icon: "🥗", asset: "appetizer" },
  Hauptspeise: { icon: "🍽️", asset: "main" },
  Sushi: { icon: "🍣", asset: "sushi" },
  Menü: { icon: "🍱", asset: "menu" },
  Belohnung: { icon: "🎁", asset: "custom" },
  Punkteeinlösung: { icon: "🎁", asset: "custom" },
};

function standardRewardAsset(category: string | null | undefined, title: string) {
  const asset = rewardAssets[category ?? ""] ?? rewardAssets.Punkteeinlösung;

  return (
    <span className={`standard-asset customer-reward-asset ${asset.asset}`} aria-label={`Standardbild ${title}`}>
      {asset.icon}
    </span>
  );
}

function parseBillAmount(value: string) {
  const normalized = value.replace(",", ".").replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function bonusTierForAmount(amount: number | null, tiers: PublicLoyaltySettings["bonus_amount_tiers"]) {
  if (amount === null || !tiers?.length) return null;
  const sortedTiers = [...tiers].sort((left, right) => left.min - right.min);
  return sortedTiers.find((tier) => amount >= tier.min && (tier.max === null || amount < tier.max)) ?? sortedTiers[0] ?? null;
}

function rewardImage(reward: PublicCustomerOfferView) {
  return (
    <div className="customer-reward-image">
      {reward.image_url ? <img alt={reward.title} src={reward.image_url} /> : standardRewardAsset(reward.category, reward.title)}
    </div>
  );
}

export function CustomerPortal() {
  const { slug } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerToken = searchParams.get("token");
  const [guestStep, setGuestStep] = useState<GuestStep>("welcome");
  const [restaurant, setRestaurant] = useState<Pick<Restaurant, "name" | "slug" | "status"> | null>(null);
  const [branding, setBranding] = useState<Pick<RestaurantBranding, "logo_url" | "primary_color" | "secondary_color" | "button_color" | "font_family"> | null>(null);
  const [settings, setSettings] = useState<PublicLoyaltySettings | null>(null);
  const [customer, setCustomer] = useState<PublicPortalCustomer | null>(null);
  const [rewards, setRewards] = useState<PublicCustomerOfferView[]>([]);
  const [registration, setRegistration] = useState<GuestRegistrationResult | null>(null);
  const [redeemOffer, setRedeemOffer] = useState<PublicCustomerOfferView | null>(null);
  const [redemptionStatus, setRedemptionStatus] = useState<string | null>(null);
  const [redemptionCompleted, setRedemptionCompleted] = useState(false);
  const [activeRedemptionCode, setActiveRedemptionCode] = useState<ActiveRedemptionCode | null>(null);
  const [redeemingReward, setRedeemingReward] = useState(false);
  const [storedCustomerToken, setStoredCustomerToken] = useState<string | null>(null);
  const [tokenAutoLoaded, setTokenAutoLoaded] = useState(false);
  const [billAmountInput, setBillAmountInput] = useState("");
  const [dailyPin, setDailyPin] = useState("");
  const [collectionResult, setCollectionResult] = useState<BonusPointCollectionResult | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", phone: "", birthday: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [creatingReferral, setCreatingReferral] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshToken, setRefreshToken] = useState(0);
  const collectionInFlightRef = useRef(false);
  const redemptionInFlightRef = useRef(false);
  const restaurantSlug = slug ?? restaurant?.slug ?? "";
  const activeToken = registration?.customer.customer_qr_token ?? customerToken ?? storedCustomerToken;
  const isBonusCollection = location.pathname.startsWith("/w/");
  const portalUrl = `${window.location.origin}/customer/${restaurantSlug}${activeToken ? `?token=${encodeURIComponent(activeToken)}` : ""}`;
  const missingRevenueForReward = (reward: PublicCustomerOfferView) =>
    settings ? Math.max(0, reward.remaining_points * settings.amount_per_point) : 0;

  useEffect(() => {
    if (!restaurantSlug) return;
    setStoredCustomerToken(readStoredCustomerToken(restaurantSlug));
    setTokenAutoLoaded(false);
  }, [restaurantSlug]);

  useEffect(() => {
    if (!restaurantSlug || !activeToken || !customer) return;
    saveStoredCustomerToken(restaurantSlug, {
      customer_token: activeToken,
      restaurant_id: null,
      customer_name: customer.name,
    });
  }, [activeToken, customer, restaurantSlug]);

  useEffect(() => {
    let cancelled = false;

    async function loadPortal() {
      const data = await loadCustomerPortalData(slug, activeToken);
      if (!cancelled) {
        setRestaurant(data.restaurant);
        setBranding(data.branding);
        setSettings(data.settings);
        setCustomer(data.customer);
        setRewards(data.offers);
        if (data.customer) {
          setGuestStep("welcome");
          setTokenAutoLoaded(Boolean(activeToken && !customerToken));
        }
      }
    }

    loadPortal().catch((error) => {
      if (!cancelled) {
        console.error("Kundenportal konnte nicht geladen werden.", error);
        if (activeToken && isInvalidCustomerTokenError(error)) {
          removeStoredCustomerToken(restaurantSlug);
          setStoredCustomerToken(null);
          setCustomer(null);
          setRewards([]);
          setRegistration(null);
          setGuestStep("welcome");
          setTokenAutoLoaded(false);
          setMessage("Du bist auf diesem Gerät noch nicht angemeldet.");
          return;
        }
        setMessage(error instanceof Error ? error.message : "Live-Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Verbindung.");
        setCustomer(null);
        setRewards([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeToken, customerToken, refreshToken, restaurantSlug, slug]);

  useEffect(() => {
    if (!customerToken) return;

    function refreshOnFocus() {
      setRefreshToken((current) => current + 1);
    }

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [customerToken]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleRewards = useMemo<PublicCustomerOfferView[]>(
    () => rewards.filter((offer) => offer.active && offer.status !== "redeemed" && offer.status !== "redemption_started"),
    [rewards],
  );
  const pointRedemptions = visibleRewards.filter((offer) => offer.source === "reward" && !offer.is_starter_reward);
  const activeWelcomeGift = visibleRewards.find((offer) => offer.is_starter_reward && offer.gift_type !== "birthday") ?? null;
  const activeBirthdayGift = visibleRewards.find((offer) => offer.is_starter_reward && offer.gift_type === "birthday") ?? null;
  const pointsLabel = settings?.loyalty_mode === "stamp_based" ? "Stempel" : "Punkte";
  const pointsTitle = settings?.loyalty_mode === "stamp_based" ? "Deine Stempel" : "Deine Punkte";
  const pointsValue = settings?.loyalty_mode === "stamp_based"
    ? `${customer?.stamp_balance ?? 0}/${settings.stamps_required}`
    : String(customer?.points_balance ?? 0);
  const bonusTiers = settings?.bonus_amount_tiers?.length ? settings.bonus_amount_tiers : defaultBonusAmountTiers;
  const sortedBonusTiers = [...bonusTiers].sort((left, right) => left.min - right.min);
  const billAmount = parseBillAmount(billAmountInput);
  const selectedTier = bonusTierForAmount(billAmount, sortedBonusTiers);
  const selectedTierIndex = selectedTier ? sortedBonusTiers.findIndex((tier) => tier.key === selectedTier.key) : -1;
  const nextTier = selectedTierIndex >= 0 ? sortedBonusTiers[selectedTierIndex + 1] ?? null : null;
  const rawActiveBoost = customer?.bonus_boost ?? null;
  const referralBoostEnabled = settings?.referral_boost_enabled ?? true;
  const referralBoostMultiplier = settings?.referral_boost_multiplier ?? 2;
  const referralBoostDurationDays = settings?.referral_boost_duration_days ?? 30;
  const rawBoostEndsAtMs = rawActiveBoost ? new Date(rawActiveBoost.active_until).getTime() : 0;
  const activeBoost = rawActiveBoost && rawBoostEndsAtMs > nowMs ? rawActiveBoost : null;
  const activePointMultiplier = activeBoost?.multiplier ?? 1;
  const boostRemainingLabel = activeBoost ? formatBoostRemaining(activeBoost.active_until, activeBoost.remaining_days, nowMs) : null;
  const boostEndsAtMs = activeBoost ? new Date(activeBoost.active_until).getTime() : 0;
  const boostStartedAtMs = activeBoost?.active_from
    ? new Date(activeBoost.active_from).getTime()
    : boostEndsAtMs - referralBoostDurationDays * 86_400_000;
  const boostTotalMs = Math.max(1, boostEndsAtMs - boostStartedAtMs);
  const boostRemainingMs = Math.max(0, boostEndsAtMs - nowMs);
  const boostProgress = activeBoost ? clampPercent((boostRemainingMs / boostTotalMs) * 100) : 0;
  const previewPoints = selectedTier && settings
    ? calculateBonusTierPoints(selectedTier, settings.amount_per_point, activePointMultiplier)
    : 0;
  const nextTierPoints = nextTier && settings
    ? calculateBonusTierPoints(nextTier, settings.amount_per_point, activePointMultiplier)
    : 0;
  const eurosToNextTier = billAmount !== null && nextTier
    ? Math.max(0, nextTier.min - billAmount)
    : null;
  const showNextTierHint = Boolean(selectedTier && nextTier && eurosToNextTier !== null);
  const reasonToJoin = `${restaurant?.name ?? "Dieses Restaurant"} belohnt treue Gäste.`;
  const explanation = [
    `${restaurant?.name ?? "Das Restaurant"} wurde über deinen QR automatisch erkannt.`,
    isBonusCollection
      ? `Gib nach dem Bezahlen deinen Rechnungsbetrag ein.`
      : "Du bekommst deinen persönlichen Bonus-QR.",
    isBonusCollection
      ? `Dieses Restaurant belohnt höhere Rechnungsstufen mit mehr Bonuspunkten.`
      : settings?.loyalty_mode === "stamp_based"
        ? `Sammle Stempel bis zur nächsten Punkteeinlösung.`
        : `Sammle Punkte bei jedem Besuch.`,
    "🔥 Bonus Boost",
    activeBoost
      ? `Wenn dein Bonus Boost aktiv ist, sammelst du für begrenzte Zeit doppelte Punkte.`
      : `Lade einen Freund ein. Ihr sammelt beide ${referralBoostDurationDays} Tage lang ${referralBoostMultiplier}× Punkte, sobald dein Freund erstmals Punkte sammelt.`,
    activeBoost
      ? `Normal: 50 Punkte. Mit Bonus Boost: ${Math.round(50 * activeBoost.multiplier)} Punkte.`
      : `Normal: 50 Punkte. Mit Bonus Boost: ${Math.round(50 * referralBoostMultiplier)} Punkte.`,
    activeBoost
      ? `Du siehst oben, wie lange dein Boost noch gültig ist.`
      : `Dein Bonus Boost startet erst nach der ersten Punktebuchung deines Freundes.`,
    isBonusCollection
      ? `Bitte Mitarbeiter um die Tages-PIN. Pro Rechnung ist eine Punktebuchung möglich.`
      : activeBoost
        ? `Bonus Boost ist aktiv: Du sammelst ${activeBoost.multiplier}× Punkte bis ${new Date(activeBoost.active_until).toLocaleDateString("de-AT")}. Lade Freunde ein und verlängere um ${referralBoostDurationDays} Tage.`
      : referralBoostEnabled
        ? `Bonus Boost startet erst, wenn dein eingeladener Freund erstmals Punkte sammelt: ${referralBoostMultiplier}× Punkte für ${referralBoostDurationDays} Tage.`
      : pointRedemptions.some((offer) => offer.status === "unlocked")
        ? `Zeige eine einlösbare Punkteeinlösung im Restaurant. Das Team bestätigt die Einlösung.`
        : "Punkteeinlösungen erscheinen automatisch, sobald sie bereit sind.",
  ];
  const collectionBasePoints = collectionResult?.base_points ?? collectionResult?.points_added ?? 0;
  const collectionTotalPoints = collectionResult?.points_added ?? 0;
  const collectionBoostPoints = Math.max(0, collectionTotalPoints - collectionBasePoints);
  const redemptionSecondsRemaining = activeRedemptionCode
    ? Math.max(0, Math.ceil((new Date(activeRedemptionCode.expiresAt).getTime() - nowMs) / 1_000))
    : 0;

  useEffect(() => {
    if (!restaurantSlug) return;
    const storageKey = `wuxuai-active-redemption:${restaurantSlug}`;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as ActiveRedemptionCode;
      if (new Date(parsed.expiresAt).getTime() > Date.now() && /^\d{6}$/.test(parsed.code)) {
        setActiveRedemptionCode(parsed);
        setRedemptionCompleted(true);
      } else {
        window.sessionStorage.removeItem(storageKey);
      }
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [restaurantSlug]);

  useEffect(() => {
    if (!activeRedemptionCode || redemptionSecondsRemaining > 0 || !restaurantSlug) return;
    window.sessionStorage.removeItem(`wuxuai-active-redemption:${restaurantSlug}`);
  }, [activeRedemptionCode, redemptionSecondsRemaining, restaurantSlug]);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (!restaurantSlug || !form.firstName.trim() || !form.phone.trim()) {
      setMessage("Vorname und Telefonnummer sind erforderlich.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const result = await registerRestaurantGuest({
        restaurantSlug,
        firstName: form.firstName.trim(),
        phone: form.phone.trim(),
        birthday: form.birthday || null,
        deviceId: getWebDeviceId(),
      });
      saveStoredCustomerToken(restaurantSlug, {
        customer_token: result.customer.customer_qr_token,
        restaurant_id: null,
        customer_name: result.customer.name,
      });
      setStoredCustomerToken(result.customer.customer_qr_token);
      setRegistration(result);
      setGuestStep("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registrierung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  function openMemberHome() {
    if (!registration?.customer.customer_qr_token) return;
    saveStoredCustomerToken(restaurantSlug, {
      customer_token: registration.customer.customer_qr_token,
      restaurant_id: null,
      customer_name: registration.customer.name,
    });
    setStoredCustomerToken(registration.customer.customer_qr_token);
    setSearchParams({ token: registration.customer.customer_qr_token });
    setRegistration(null);
  }

  async function handleCollectPoints() {
    if (collectionInFlightRef.current) return;
    if (!selectedTier || billAmount === null) {
      setMessage("Bitte gib deinen Rechnungsbetrag ein.");
      return;
    }

    if (!restaurantSlug || !activeToken) {
      setMessage("Öffne zuerst deinen persönlichen Bonus.");
      return;
    }

    if (!dailyPin.trim()) {
      setMessage("Bitte gib die Tages-PIN ein.");
      return;
    }

    collectionInFlightRef.current = true;
    setCollecting(true);
    setMessage(null);

    try {
      const result = await collectBonusPoints({
        restaurantSlug,
        customerToken: activeToken,
        amountTierKey: selectedTier.key,
        dailyPin: dailyPin.trim(),
        deviceId: getWebDeviceId(),
        idempotencyKey: crypto.randomUUID(),
      });
      setCollectionResult(result);
      setCustomer((current) => current ? { ...current, points_balance: result.points_balance } : current);
      setMessage("Punkte gesammelt!");
      setDailyPin("");
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Punkte konnten gerade nicht gutgeschrieben werden. Bitte versuche es erneut.");
    } finally {
      collectionInFlightRef.current = false;
      setCollecting(false);
    }
  }

  async function handleCreateReferralLink() {
    if (!restaurantSlug || !activeToken) {
      setMessage("Öffne zuerst deinen persönlichen Bonus.");
      return;
    }

    setCreatingReferral(true);
    setMessage(null);

    try {
      const result = await createReferralLink(restaurantSlug, activeToken, getWebDeviceId());
      setReferralLink(`${window.location.origin}/r/${restaurantSlug}/${encodeURIComponent(result.referral_token)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Einladung konnte nicht erstellt werden.");
    } finally {
      setCreatingReferral(false);
    }
  }

  async function copyPortalLink() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setMessage("Link wurde kopiert.");
    } catch {
      setMessage("Link konnte nicht kopiert werden. Bitte kopiere die Adresse aus deinem Browser.");
    }
  }

  async function openRewardRedemption(reward: PublicCustomerOfferView) {
    if (!activeToken) {
      setMessage("Öffne zuerst deinen persönlichen Bonus.");
      return;
    }

    if (reward.source !== "reward") {
      setMessage("Diese Punkteeinlösung ist nicht mehr verfügbar.");
      return;
    }

    setRedeemOffer(reward);
    setRedemptionCompleted(false);
    setRedemptionStatus(null);
  }

  async function handleRedeemCustomerReward() {
    if (!activeToken || !redeemOffer || redemptionInFlightRef.current) return;
    redemptionInFlightRef.current = true;
    setRedeemingReward(true);
    setRedemptionStatus(null);

    try {
      const result = await startCustomerRedemption({
        customerToken: activeToken,
        rewardId: redeemOffer.id,
        customerRewardId: redeemOffer.assignment_id ?? null,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.redemption_code) {
        setRedemptionStatus("Für diese Einlösung ist bereits ein Code aktiv. Bitte zeige den bereits geöffneten Code.");
        return;
      }
      const nextActiveCode: ActiveRedemptionCode = {
        code: result.redemption_code,
        expiresAt: result.expires_at,
        rewardId: redeemOffer.id,
        assignmentId: redeemOffer.assignment_id ?? null,
        title: redeemOffer.title,
        redemptionType: result.redemption_type,
        pointsSpent: result.points_spent ?? redeemOffer.required_points,
      };
      setActiveRedemptionCode(nextActiveCode);
      window.sessionStorage.setItem(`wuxuai-active-redemption:${restaurantSlug}`, JSON.stringify(nextActiveCode));
      setCustomer((current) => current
        ? { ...current, points_balance: result.points_balance, stamp_balance: result.stamp_balance }
        : current);
      setRewards((current) => {
        if (redeemOffer.is_starter_reward) {
          return current.filter((reward) =>
            (reward.assignment_id ?? reward.id) !== (redeemOffer.assignment_id ?? redeemOffer.id));
        }

        return current.map((reward) => {
          if (reward.id !== redeemOffer.id || reward.is_starter_reward) return reward;
          const remainingPoints = Math.max(0, reward.required_points - result.points_balance);
          const remainingStamps = Math.max(0, reward.required_stamps - result.stamp_balance);
          return {
            ...reward,
            status: remainingPoints === 0 && remainingStamps === 0 ? "unlocked" : "locked",
            remaining_points: remainingPoints,
            remaining_stamps: remainingStamps,
          };
        });
      });
      setRedemptionStatus("Einlösung verbindlich bestätigt. Zeige den Code jetzt dem Mitarbeiter.");
      setRedemptionCompleted(true);
      setRefreshToken((current) => current + 1);
    } catch (error) {
      console.error("Punkteeinlösung konnte nicht verwendet werden.", error);
      setRedemptionStatus(error instanceof Error ? error.message : "Diese Punkteeinlösung ist nicht mehr verfügbar.");
    } finally {
      redemptionInFlightRef.current = false;
      setRedeemingReward(false);
    }
  }

  if (!settings || !restaurant || !branding) {
    return (
      <main className="customer-shell">
        <section className="customer-card">
          <p className="muted">{message ?? "Bonus lädt."}</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="customer-shell"
      style={{
        color: "#17202a",
        fontFamily: branding.font_family,
      }}
    >
      <section className="customer-card guest-flow-card">
        <header className="customer-brand-header restaurant-brand-header">
          <span className="restaurant-logo-frame">
            {branding.logo_url ? (
              <img alt={`${restaurant.name} Logo`} className="customer-logo restaurant-logo-image" src={branding.logo_url} />
            ) : (
              <span className="restaurant-logo-placeholder" style={{ background: branding.primary_color }}>
                {(restaurant.name.trim().charAt(0) || "W").toUpperCase()}
              </span>
            )}
          </span>
          <div className="restaurant-brand-copy">
            <h1 className="restaurant-brand-title">{restaurant.name}</h1>
            <p className="restaurant-brand-subtitle">Bonus für Gäste</p>
          </div>
          <button
            aria-label="So funktioniert's öffnen"
            className="icon-button customer-info-button"
            onClick={() => setInfoOpen(true)}
            type="button"
          >
            <Info size={22} />
          </button>
        </header>

        {infoOpen ? (
          <div className="modal-backdrop customer-info-backdrop" onClick={() => setInfoOpen(false)} role="presentation">
            <section
              aria-labelledby="customer-info-title"
              aria-modal="true"
              className="how-modal customer-info-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-header">
                <h2 id="customer-info-title">So funktioniert's</h2>
                <button
                  aria-label="So funktioniert's schließen"
                  className="icon-button customer-info-button"
                  onClick={() => setInfoOpen(false)}
                  type="button"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="rule-list">
                {explanation.map((line) => (
                  <p className="muted" key={line}>{line}</p>
                ))}
              </div>
              <button className="button customer-primary-button" onClick={() => setInfoOpen(false)} type="button">
                Schließen
              </button>
            </section>
          </div>
        ) : null}

        {!customer && guestStep === "welcome" && !activeToken && !isBonusCollection ? (
          <article className="customer-hero-card">
            <span className="pill">Mein Bonus</span>
            <h2>Du bist auf diesem Gerät noch nicht angemeldet.</h2>
            <p className="muted">
              Wenn du bereits Mitglied bist, öffne deinen persönlichen Bonus-Link. Du kannst sonst neu beitreten.
            </p>
            <button className="button customer-primary-button" onClick={() => setGuestStep("register")} type="button">
              <UserPlus size={22} />
              Restaurant-QR scannen oder neu beitreten
            </button>
          </article>
        ) : null}

        {!customer && guestStep === "welcome" && (activeToken || isBonusCollection) ? (
          <article className="customer-hero-card">
            <span className="pill">Mein Bonus</span>
            <h2>{isBonusCollection ? `Willkommen bei ${restaurant.name}` : "Willkommen"}</h2>
            <p className="muted">{reasonToJoin}</p>
            <button className="button customer-primary-button" onClick={() => setGuestStep("register")} type="button">
              <UserPlus size={22} />
              {isBonusCollection ? "Jetzt kostenlos beitreten" : "Jetzt Mitglied werden"}
            </button>
          </article>
        ) : null}

        {!customer && guestStep === "register" ? (
          <article className="customer-hero-card">
            <h2>Mitglied werden</h2>
            <form className="form compact-customer-form" onSubmit={handleRegister}>
              <div className="field">
                <label htmlFor="guest-first-name">Vorname</label>
                <input
                  autoFocus
                  className="input input-large"
                  id="guest-first-name"
                  value={form.firstName}
                  onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="guest-phone">Telefonnummer</label>
                <input
                  className="input input-large"
                  id="guest-phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="guest-birthday">Geburtstag optional</label>
                <input
                  className="input input-large"
                  id="guest-birthday"
                  type="date"
                  value={form.birthday}
                  onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))}
                />
              </div>
              <div className="grid two">
                <button className="button secondary" onClick={() => setGuestStep("welcome")} type="button">
                  Zurück
                </button>
                <button className="button" disabled={submitting} type="submit">
                  <CheckCircle2 size={20} />
                  Fertig
                </button>
              </div>
            </form>
          </article>
        ) : null}

        {!customer && guestStep === "success" && registration ? (
          <article className="customer-hero-card">
            <span className="pill">Fertig</span>
            <h2>Dein Bonuskonto ist gespeichert</h2>
            <p className="muted">Du kannst deine Punkte jederzeit auf diesem Handy ansehen.</p>
            <p className="muted">Wenn du diesen Restaurant-QR später wieder scannst, wirst du automatisch erkannt.</p>
            {registration.welcome_reward ? (
              <article className="welcome-reward-preview">
                <div className="customer-reward-image">
                  {registration.welcome_reward.image_url ? (
                    <img alt={registration.welcome_reward.title} src={registration.welcome_reward.image_url} />
                  ) : (
                    standardRewardAsset(registration.welcome_reward.category, registration.welcome_reward.title)
                  )}
                </div>
                <strong>Dein Willkommensgeschenk</strong>
                <h3>{registration.welcome_reward.title}</h3>
                <p>Dein Willkommensgeschenk wurde für dich reserviert.</p>
                <p className="muted">Es wird nach deiner ersten bezahlten Bestellung freigeschaltet.</p>
                {welcomeGiftDetail(registration.welcome_reward) ? (
                  <p>{welcomeGiftDetail(registration.welcome_reward)}</p>
                ) : null}
                {registration.welcome_reward.category ? (
                  <p className="muted">Kategorie: {registration.welcome_reward.category}</p>
                ) : null}
                {registration.welcome_reward.available_products?.length && !welcomeGiftDetail(registration.welcome_reward) ? (
                  <p className="muted">Produkte: {registration.welcome_reward.available_products.join(", ")}</p>
                ) : null}
              </article>
            ) : null}
            <div className="qr-box qr-box-large" aria-label="Persönlicher QR-Code">
              <strong>Dein persönlicher Bonus-QR</strong>
              <QRCodeSVG value={portalUrl} size={220} level="M" />
              <p className="muted">Mit diesem QR kommst du jederzeit zurück zu deinem Bonuskonto.</p>
              <p className="muted">Speichere ihn oder öffne dein Bonuskonto direkt über diesen Link.</p>
              <p className="muted">
                <QrCode size={16} /> {registration.customer.customer_code}
              </p>
            </div>
            <div className="grid two">
              <button className="button customer-primary-button" onClick={openMemberHome} type="button">
                Mein Bonus öffnen
              </button>
              <button className="button secondary" onClick={copyPortalLink} type="button">
                Link kopieren
              </button>
            </div>
            <p className="muted">Du kannst diese Seite auch auf deinem Home-Bildschirm speichern.</p>
          </article>
        ) : null}

        {customer && isBonusCollection ? (
          <section className="bonus-collect-flow">
            {collectionResult ? (
              <article className="customer-hero-card collect-success-card">
                <span className="pill">Fertig</span>
                <h2>🎉</h2>
                <p className="status-message" role="status">Punkte gesammelt!</p>
                {collectionResult.bonus_multiplier > 1 ? (
                  <>
                    <strong>Gesamt: {collectionTotalPoints} Punkte 🔥</strong>
                    <div className="boost-success-grid">
                      <div>
                        <span className="pill">Normal</span>
                        <strong>{collectionBasePoints} Punkte</strong>
                      </div>
                      <div>
                        <span className="pill">Bonus Boost</span>
                        <strong>+{collectionBoostPoints} Punkte</strong>
                      </div>
                      <div>
                        <span className="pill">Gesamt</span>
                        <strong>{collectionTotalPoints} Punkte 🔥</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <strong>{collectionTotalPoints} Punkte wurden gutgeschrieben.</strong>
                )}
                <p className="muted">Aktuell: {collectionResult.points_balance} Punkte</p>
                {collectionResult.welcome_gift_unlocked ? (
                  <p className="muted">🎉 Dein Willkommensgeschenk ist jetzt freigeschaltet.</p>
                ) : null}
                {collectionResult.next_reward ? (
                  <p className="muted">
                    Noch {collectionResult.next_reward.remaining_points} Punkte bis {collectionResult.next_reward.title}.
                  </p>
                ) : (
                  <p className="muted">Deine nächsten Punkteeinlösungen sind im Bonus sichtbar.</p>
                )}
                <a className="button customer-primary-button" href={portalUrl}>
                  Mein Bonus
                </a>
              </article>
            ) : (
              <>
                <article className="customer-hero-card">
                  <span className="pill">Nach dem Bezahlen</span>
                  <h2>{tokenAutoLoaded ? `Willkommen zurück, ${customer.name.split(" ")[0]}` : "Punkte sammeln"}</h2>
                  <p className="muted">Gib deinen Rechnungsbetrag ein. Der Kassierer kann kurz mitschauen.</p>
                </article>

                <section className="calculation-card">
                  <label className="field" htmlFor="bill-amount">
                    <span>Rechnungsbetrag</span>
                    <input
                      className="input input-large"
                      id="bill-amount"
                      inputMode="decimal"
                      onChange={(event) => setBillAmountInput(event.target.value)}
                      placeholder="z. B. 82,50 €"
                      value={billAmountInput}
                    />
                  </label>
                  <label className="field" htmlFor="daily-pin">
                    <span>Tages-PIN</span>
                    <input
                      className="input input-large"
                      id="daily-pin"
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => setDailyPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="Bitte Mitarbeiter um die Tages-PIN."
                      type="password"
                      value={dailyPin}
                    />
                  </label>
                  <p className="muted">Bitte Mitarbeiter um die Tages-PIN.</p>
                  {!selectedTier ? (
                    <button className="button customer-primary-button" disabled={collecting} onClick={handleCollectPoints} type="button">
                      {collecting ? "Punkte werden gutgeschrieben..." : "Punkte sammeln"}
                    </button>
                  ) : null}
                </section>

                {selectedTier ? (
                  <article className="calculation-card">
                    <p className="muted">Ausgewählt</p>
                    <h2>{selectedTier.label}</h2>
                    <strong>{previewPoints} Punkte</strong>
                    {showNextTierHint && nextTier && eurosToNextTier !== null ? (
                      <div className="smart-upsell-box">
                        <p className="muted">Noch {formatEuroSuffix(eurosToNextTier)} bis zur nächsten Bonusstufe</p>
                        <div className="grid two">
                          <div>
                            <span className="pill">Aktuell</span>
                            <strong>{selectedTier.label}</strong>
                            <p className="muted">{previewPoints} Punkte</p>
                          </div>
                          <div>
                            <span className="pill">Nächste Stufe</span>
                            <strong>{nextTier?.label}</strong>
                            <p className="muted">{nextTierPoints} Punkte</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="muted">Höchste Bonusstufe erreicht</p>
                    )}
                    <button className="button customer-primary-button" disabled={collecting} onClick={handleCollectPoints} type="button">
                      {collecting ? "Punkte werden gutgeschrieben..." : "Punkte sammeln"}
                    </button>
                  </article>
                ) : null}
                {message ? <p className="status-message" role="alert">{message}</p> : null}
              </>
            )}
          </section>
        ) : null}

        {customer && !isBonusCollection ? (
          <>
            <article className={`bonus-boost-banner${activeBoost ? " active" : " inactive"}`}>
              <div>
                <span className="pill">Bonus Boost</span>
                <h2>{activeBoost ? `🔥 ${activeBoost.multiplier}× Punkte aktiv` : "🔥 Lade einen Freund ein"}</h2>
                <p className="muted">
                  {activeBoost
                    ? activeBoost.multiplier === 2
                      ? "Du sammelst aktuell doppelte Punkte."
                      : `Du sammelst aktuell ${activeBoost.multiplier}× Punkte.`
                    : `Ihr sammelt beide ${referralBoostDurationDays} Tage lang ${referralBoostMultiplier}× Punkte, sobald dein Freund erstmals Punkte sammelt.`}
                </p>
              </div>
              <div className="boost-banner-stats">
                <div>
                  <span className="muted">Multiplikator</span>
                  <strong>{activeBoost?.multiplier ?? referralBoostMultiplier}×</strong>
                </div>
                <div>
                  <span className="muted">Rest</span>
                  <strong>{activeBoost ? boostRemainingLabel : `+${referralBoostDurationDays} Tage`}</strong>
                </div>
                <div>
                  <span className="muted">Restzeit</span>
                  <strong>{boostRemainingLabel ?? "Startbereit"}</strong>
                </div>
              </div>
              <div className="boost-progress-track" aria-label="Bonus Boost Restzeit">
                <span style={{ width: `${boostProgress}%` }} />
              </div>
              {referralBoostEnabled ? (
                <button className="button customer-primary-button" disabled={creatingReferral} onClick={handleCreateReferralLink} type="button">
                  Freund einladen
                </button>
              ) : null}
              {referralLink ? (
                <div className="referral-share-box">
                  <QRCodeSVG value={referralLink} size={156} level="M" />
                  <p className="muted">Dein Bonus Boost startet erst, wenn dein Freund erstmals Punkte sammelt.</p>
                  <a href={referralLink}>{referralLink}</a>
                </div>
              ) : null}
            </article>

            <article className="customer-points-hero">
              <span className="pill">{pointsLabel}</span>
              <h2>{pointsTitle}</h2>
              <strong>{activeBoost ? `${pointsValue} 🔥` : pointsValue}</strong>
              {activeBoost ? (
                <span className="boost-points-badge">{activeBoost.multiplier}× Bonus Boost aktiv</span>
              ) : null}
              <p className="muted">
                {activeBoost
                  ? activeBoost.multiplier === 2
                    ? "Jede Punktebuchung zählt aktuell doppelt."
                    : `Jede Punktebuchung zählt aktuell ${activeBoost.multiplier}×.`
                  : settings?.loyalty_mode === "stamp_based"
                  ? "Diese Stempel zeigen deinen Fortschritt."
                  : "Diese Punkte kannst du für Punkteeinlösungen verwenden."}
              </p>
            </article>

            <article className="card point-redemption-section">
              <h2>
                <Gift size={18} /> Mit Punkten einlösbar
              </h2>
              <p className="muted">Diese Produkte kannst du aktuell mit deinen Punkten einlösen.</p>
              <div className="point-redemption-grid">
                {pointRedemptions.map((reward) => (
                  <div
                    className={`reward-progress-card${reward.status === "unlocked" ? " unlocked" : ""}`}
                    key={`${reward.source}-${reward.assignment_id ?? reward.id}`}
                  >
                    <div className="reward-image-shell">
                      {rewardImage(reward)}
                      {reward.status !== "unlocked" ? <span className="reward-lock-badge" aria-label="Noch gesperrt">🔒</span> : null}
                    </div>
                    <strong>{reward.title}</strong>
                    <span className="pill">{reward.category ?? reward.product_group ?? "Punkteeinlösung"}</span>
                    <p className="muted">{reward.required_points} Punkte nötig</p>
                    {reward.status === "unlocked" ? (
                      <p>Einlösbar</p>
                    ) : (
                      <>
                        <p>Noch gesperrt</p>
                        <p>Dir fehlen noch {reward.remaining_points} Punkte.</p>
                        <p className="muted">Nur noch ca. {formatEuro(missingRevenueForReward(reward))} bis zur Einlösung.</p>
                      </>
                    )}
                    {reward.expires_at ? <p className="muted">Gültig bis {reward.expires_at.slice(0, 10)}</p> : null}
                    {reward.status === "unlocked" ? (
                      <button className="button" onClick={() => openRewardRedemption(reward)} type="button">
                        Jetzt Punkte einlösen
                      </button>
                    ) : null}
                  </div>
                ))}
                {pointRedemptions.length === 0 ? <p className="muted">Aktuell sind keine Punkteeinlösungen sichtbar.</p> : null}
              </div>
            </article>

            {activeBirthdayGift ? (
              <article className="card birthday-gift-section">
                <h2>Dein Geburtstagsgeschenk</h2>
                <div className="reward-progress-card unlocked">
                  {rewardImage(activeBirthdayGift)}
                  <strong>{activeBirthdayGift.title}</strong>
                  <span className="pill">Geburtstagsgeschenk</span>
                  <p>Dieses Geschenk wurde automatisch für deinen Geburtstag ausgewählt.</p>
                  {activeBirthdayGift.valid_from && activeBirthdayGift.valid_until ? (
                    <p className="muted">
                      Gültig von {new Date(activeBirthdayGift.valid_from).toLocaleDateString("de-AT")} bis{" "}
                      {new Date(new Date(activeBirthdayGift.valid_until).getTime() - 1).toLocaleDateString("de-AT")}.
                    </p>
                  ) : null}
                  <button className="button" onClick={() => openRewardRedemption(activeBirthdayGift)} type="button">
                    Jetzt einlösen
                  </button>
                </div>
              </article>
            ) : null}

            {activeWelcomeGift ? (
              <article className="card welcome-gift-section">
                <h2>Dein Willkommensgeschenk</h2>
                <div className={`reward-progress-card${activeWelcomeGift.status === "unlocked" ? " unlocked" : ""}`}>
                  {rewardImage(activeWelcomeGift)}
                  <strong>{activeWelcomeGift.title}</strong>
                  <span className="pill">Willkommensgeschenk</span>
                  <p>
                    {activeWelcomeGift.status === "unlocked"
                      ? "Dein Willkommensgeschenk ist freigeschaltet."
                      : "Dieses Geschenk wurde bei deiner Anmeldung für dich reserviert."}
                  </p>
                  {activeWelcomeGift.status === "unlocked" ? (
                    <p className="muted">Du kannst es jetzt einlösen.</p>
                  ) : (
                    <p className="muted">Es wird nach deiner ersten Punktebuchung freigeschaltet.</p>
                  )}
                  {welcomeGiftDetail(activeWelcomeGift) ? <p className="muted">{welcomeGiftDetail(activeWelcomeGift)}</p> : null}
                  {activeWelcomeGift.status === "unlocked" ? (
                    <button className="button" onClick={() => openRewardRedemption(activeWelcomeGift)} type="button">
                      Jetzt einlösen
                    </button>
                  ) : null}
                </div>
              </article>
            ) : null}

            <article className="customer-home-card qr-card customer-qr-lower-card">
              <h2>Dein persönlicher Bonus-QR</h2>
              <QRCodeSVG value={portalUrl} size={176} level="M" />
              <p className="muted">Mit diesem QR kommst du jederzeit zurück zu deinem Bonuskonto.</p>
              <p className="muted">
                <QrCode size={16} /> {customer.customer_code}
              </p>
            </article>

            <article className="card bonus-save-help-card">
              <h2>Bonuskonto speichern</h2>
              <p className="muted">Speichere diese Seite, damit du deine Punkte jederzeit ansehen kannst.</p>
              <button className="button secondary" onClick={copyPortalLink} type="button">
                Link kopieren
              </button>
              <p className="muted">iPhone: Teilen-Symbol drücken → Zum Home-Bildschirm</p>
              <p className="muted">Android: Menü öffnen → Zum Startbildschirm hinzufügen</p>
              <p className="muted">Dieses Gerät ist mit deinem Bonuskonto verbunden.</p>
            </article>

            {activeRedemptionCode ? (
              <article className="card redemption-code-card" aria-live="polite">
                <span className="pill">
                  {activeRedemptionCode.redemptionType === "birthday_gift"
                    ? "Geburtstagsgeschenk"
                    : activeRedemptionCode.redemptionType === "welcome_gift"
                      ? "Willkommensgeschenk"
                      : "Punkteeinlösung"}
                </span>
                <h2>{activeRedemptionCode.title}</h2>
                {redemptionSecondsRemaining > 0 ? (
                  <>
                    <p>Zeige diesen Code jetzt dem Mitarbeiter.</p>
                    <strong className="redemption-code-value">{activeRedemptionCode.code}</strong>
                    <p className="redemption-countdown">
                      Gültig noch {Math.floor(redemptionSecondsRemaining / 60)}:{String(redemptionSecondsRemaining % 60).padStart(2, "0")} Minuten
                    </p>
                    <p className="muted">Der Code kann nur einmal verwendet werden.</p>
                  </>
                ) : (
                  <>
                    <h3>Code abgelaufen</h3>
                    <p className="muted">Dieser Einlösecode kann nicht mehr verwendet werden.</p>
                  </>
                )}
              </article>
            ) : null}

            {redeemOffer && !activeRedemptionCode ? (
              <article className="card redeem-show-card">
                <span className="pill">
                  {redeemOffer.gift_type === "birthday"
                    ? "Geburtstagsgeschenk"
                    : redeemOffer.is_starter_reward
                      ? "Willkommensgeschenk"
                      : "Punkteeinlösung"}
                </span>
                <h2>{redeemOffer.title}</h2>
                <h3>{redeemOffer.is_starter_reward ? "Geschenk wirklich einlösen?" : "Punkte wirklich einlösen?"}</h3>
                <p><strong>Bitte erst direkt vor dem Mitarbeiter bestätigen.</strong></p>
                <p className="muted">
                  {redeemOffer.is_starter_reward
                    ? "Nach der verbindlichen Bestätigung wird ein einmaliger Einlösecode erzeugt."
                    : `Nach der verbindlichen Bestätigung werden ${redeemOffer.required_points} Punkte reserviert und ein einmaliger Einlösecode erzeugt.`}
                </p>

                {redemptionStatus ? <p className="status-message">{redemptionStatus}</p> : null}

                <div className="row-actions">
                  <button
                    className="button secondary"
                    disabled={redeemingReward}
                    onClick={() => {
                      setRedeemOffer(null);
                      setRedemptionStatus(null);
                      setRedemptionCompleted(false);
                    }}
                    type="button"
                  >
                    Abbrechen
                  </button>
                  {!redemptionCompleted ? (
                    <button
                      className="button customer-primary-button"
                      disabled={redeemingReward}
                      onClick={handleRedeemCustomerReward}
                      type="button"
                    >
                      Jetzt verbindlich einlösen
                    </button>
                  ) : null}
                </div>
              </article>
            ) : null}
          </>
        ) : null}

        {message && !(customer && isBonusCollection) ? <p className="status-message" role="alert">{message}</p> : null}
      </section>
    </main>
  );
}
