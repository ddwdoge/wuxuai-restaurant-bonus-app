import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CakeSlice, CheckCircle2, Copy, Flame, Gift, QrCode, Sparkles, UserPlus, WalletCards } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import { AppDrawer } from "../../shared/components/AppDrawer";
import type { Restaurant, RestaurantBranding } from "../../shared/types/domain";
import { loadCustomerRedemptionStatus, startCustomerRedemption } from "../rewards/rewardService";
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
import {
  AppShell,
  BenefitTile,
  BottomNavigation,
  CustomerHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PointsCard,
  PremiumCard,
  PrimaryButton,
  RewardCard,
  RewardImage,
  SectionHeader,
  SecondaryButton,
  StatusBadge,
  type CustomerView,
} from "./components/PremiumCustomerUi";

type GuestStep = "welcome" | "register" | "success";

type ActiveRedemptionCode = {
  code: string;
  expiresAt: string;
  redemptionId: string;
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

const rewardAssets: Record<string, { asset: string }> = {
  Getränk: { asset: "drink" },
  Kaffee: { asset: "coffee" },
  Dessert: { asset: "dessert" },
  Vorspeise: { asset: "appetizer" },
  Hauptspeise: { asset: "main" },
  Sushi: { asset: "sushi" },
  Menü: { asset: "menu" },
  Belohnung: { asset: "custom" },
  Punkteeinlösung: { asset: "custom" },
};

function standardRewardAsset(category: string | null | undefined, title: string) {
  const asset = rewardAssets[category ?? ""] ?? rewardAssets.Punkteeinlösung;

  return (
    <span className={`standard-asset customer-reward-asset ${asset.asset}`} aria-label={`Standardbild ${title}`}>
      <Gift aria-hidden="true" size={38} />
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

export function CustomerPortal() {
  const { slug } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerToken = searchParams.get("token");
  const [guestStep, setGuestStep] = useState<GuestStep>("welcome");
  const [activeView, setActiveView] = useState<CustomerView>("home");
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
  const [redemptionDrawerOpen, setRedemptionDrawerOpen] = useState(false);
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
  const previewRedemptions = pointRedemptions.slice(0, 2);
  const nextPointRedemption = [...pointRedemptions].sort((left, right) => left.remaining_points - right.remaining_points)[0] ?? null;
  const nextRedemptionProgress = nextPointRedemption?.required_points
    ? clampPercent(((nextPointRedemption.required_points - nextPointRedemption.remaining_points) / nextPointRedemption.required_points) * 100)
    : 0;
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
    "Bonus Boost",
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
    if (!restaurantSlug || !activeToken) return;
    const storageKey = `wuxuai-active-redemption:${restaurantSlug}`;
    const customerTokenForCheck = activeToken;
    let cancelled = false;

    async function restoreActiveRedemption() {
      try {
        const stored = window.sessionStorage.getItem(storageKey);
        if (!stored) return;
        const parsed = JSON.parse(stored) as ActiveRedemptionCode;
        const locallyValid = Boolean(
          parsed.redemptionId
          && /^\d{6}$/.test(parsed.code)
          && new Date(parsed.expiresAt).getTime() > Date.now()
        );
        if (!locallyValid) {
          window.sessionStorage.removeItem(storageKey);
          return;
        }

        const serverStatus = await loadCustomerRedemptionStatus({
          restaurantSlug,
          customerToken: customerTokenForCheck,
          redemptionId: parsed.redemptionId,
        });
        if (cancelled) return;

        if (serverStatus.active && serverStatus.status === "active") {
          setActiveRedemptionCode(parsed);
          setRedemptionCompleted(true);
          setRedemptionDrawerOpen(true);
          return;
        }

        window.sessionStorage.removeItem(storageKey);
        setActiveRedemptionCode(null);
      } catch (error) {
        console.error("Einlösecode konnte nicht serverseitig geprüft werden.", error);
        if (!cancelled) {
          setActiveRedemptionCode(null);
        }
      }
    }

    void restoreActiveRedemption();
    return () => {
      cancelled = true;
    };
  }, [activeToken, restaurantSlug]);

  useEffect(() => {
    if (!activeRedemptionCode || !activeToken || !restaurantSlug) return;
    let cancelled = false;
    let requestRunning = false;
    const storageKey = `wuxuai-active-redemption:${restaurantSlug}`;

    const intervalId = window.setInterval(() => {
      if (requestRunning) return;
      requestRunning = true;
      loadCustomerRedemptionStatus({
        restaurantSlug,
        customerToken: activeToken,
        redemptionId: activeRedemptionCode.redemptionId,
      })
        .then((serverStatus) => {
          if (cancelled || serverStatus.active) return;
          window.sessionStorage.removeItem(storageKey);
          setActiveRedemptionCode(null);
          setRedeemOffer(null);
          setRedemptionDrawerOpen(false);
          setMessage(serverStatus.status === "redeemed"
            ? "Einlösung erfolgreich bestätigt."
            : "Der Einlösecode ist nicht mehr verfügbar.");
          setRefreshToken((current) => current + 1);
        })
        .catch((error) => {
          console.error("Einlösestatus konnte nicht aktualisiert werden.", error);
        })
        .finally(() => {
          requestRunning = false;
        });
    }, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeRedemptionCode, activeToken, restaurantSlug]);

  useEffect(() => {
    if (!activeRedemptionCode || redemptionSecondsRemaining > 0 || !restaurantSlug) return;
    window.sessionStorage.removeItem(`wuxuai-active-redemption:${restaurantSlug}`);
    setActiveRedemptionCode(null);
    setRedeemOffer(null);
    setRedemptionDrawerOpen(false);
    setMessage("Der Einlösecode ist abgelaufen.");
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

  function handleCustomerViewChange(view: CustomerView) {
    if (view === "collect") {
      const tokenQuery = activeToken ? `?token=${encodeURIComponent(activeToken)}` : "";
      window.location.assign(`/w/${restaurantSlug}${tokenQuery}`);
      return;
    }

    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setRedemptionDrawerOpen(true);
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
        redemptionId: result.redemption_id,
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
      <AppShell>
        <PageContainer>
          {message ? (
            <ErrorState description={message} title="Dein Bonus konnte nicht geöffnet werden" />
          ) : (
            <LoadingState description="Dein Bonus wird geladen." />
          )}
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell fontFamily={branding.font_family} primaryColor={branding.primary_color}>
      <PageContainer className="customer-portal-page">
        <CustomerHeader
          compact
          logoUrl={branding.logo_url}
          name={restaurant.name}
          onInfo={() => setInfoOpen(true)}
          primaryColor={branding.primary_color}
          subtitle="Bonus für Gäste"
        />

        <AppDrawer
          footer={(
            <button className="button customer-primary-button" onClick={() => setInfoOpen(false)} type="button">
              Schließen
            </button>
          )}
          onClose={() => setInfoOpen(false)}
          open={infoOpen}
          title="So funktioniert's"
        >
          <div className="rule-list customer-info-rules">
            {explanation.map((line) => (
              <p className="muted" key={line}>{line}</p>
            ))}
          </div>
        </AppDrawer>

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
              <article className="customer-hero-card collect-success-card premium-collect-success">
                <span className="premium-success-icon"><CheckCircle2 aria-hidden="true" size={38} /></span>
                <span className="pill">Fertig</span>
                <p className="status-message" role="status">Punkte gesammelt!</p>
                {collectionResult.bonus_multiplier > 1 ? (
                  <>
                    <strong className="premium-success-total">Gesamt: {collectionTotalPoints} Punkte</strong>
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
                        <strong><Flame aria-hidden="true" size={18} /> {collectionTotalPoints} Punkte</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <strong>{collectionTotalPoints} Punkte wurden gutgeschrieben.</strong>
                )}
                <p className="muted">Aktuell: {collectionResult.points_balance} Punkte</p>
                {collectionResult.welcome_gift_unlocked ? (
                  <p className="muted"><Sparkles aria-hidden="true" size={17} /> Dein Willkommensgeschenk ist jetzt freigeschaltet.</p>
                ) : null}
                {collectionResult.next_reward ? (
                  <p className="muted">
                    Noch {collectionResult.next_reward.remaining_points} Punkte bis {collectionResult.next_reward.title}.
                  </p>
                ) : (
                  <p className="muted">Deine nächsten Punkteeinlösungen sind im Bonus sichtbar.</p>
                )}
                <a className="premium-button premium-button-primary" href={portalUrl}>
                  Mein Bonus
                </a>
              </article>
            ) : (
              <>
                <article className="customer-hero-card premium-collect-intro">
                  <span className="premium-flow-icon"><QrCode aria-hidden="true" size={24} /></span>
                  <span className="pill">Nach dem Bezahlen</span>
                  <h2>{tokenAutoLoaded ? `Willkommen zurück, ${customer.name.split(" ")[0]}` : "Punkte sammeln"}</h2>
                  <p className="muted">Gib deinen Rechnungsbetrag ein. Der Kassierer kann kurz mitschauen.</p>
                </article>

                <section className="calculation-card premium-collect-form">
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
                    <PrimaryButton disabled={collecting} onClick={handleCollectPoints} type="button">
                      {collecting ? "Punkte werden gutgeschrieben..." : "Punkte sammeln"}
                    </PrimaryButton>
                  ) : null}
                </section>

                {selectedTier ? (
                  <article className="calculation-card premium-calculation-result">
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
                    <PrimaryButton disabled={collecting} onClick={handleCollectPoints} type="button">
                      {collecting ? "Punkte werden gutgeschrieben..." : "Punkte sammeln"}
                    </PrimaryButton>
                  </article>
                ) : null}
                {message ? <p className="status-message" role="alert">{message}</p> : null}
              </>
            )}
          </section>
        ) : null}

        {customer && !isBonusCollection ? (
          <>
            {activeView === "home" ? (
              <section className="premium-view-stack" aria-labelledby="customer-home-title">
                <div className="premium-welcome-copy">
                  <span>Mein Bonus bei {restaurant.name}</span>
                  <h1 id="customer-home-title">Hallo {customer.name.split(" ")[0]},</h1>
                  <p>schön, dass du wieder da bist. Hier siehst du deine Punkte und Vorteile.</p>
                </div>

                <PointsCard
                  boostLabel={activeBoost ? `${activeBoost.multiplier}× Bonus Boost aktiv` : null}
                  label={pointsTitle}
                  note={nextPointRedemption
                    ? nextPointRedemption.remaining_points > 0
                      ? `Noch ${nextPointRedemption.remaining_points} Punkte bis ${nextPointRedemption.title}.`
                      : `${nextPointRedemption.title} ist jetzt einlösbar.`
                    : settings.loyalty_mode === "stamp_based"
                      ? "Diese Stempel zeigen deinen Fortschritt."
                      : "Diese Punkte kannst du für Punkteeinlösungen verwenden."}
                  progress={nextPointRedemption ? nextRedemptionProgress : undefined}
                  value={pointsValue}
                />

                <section className="premium-content-section" aria-label="Deine Vorteile">
                  <SectionHeader subtitle="Alles Wichtige für deinen nächsten Besuch." title="Deine Vorteile" />
                  <div className="premium-benefit-grid">
                    <BenefitTile
                      icon={<Gift size={22} />}
                      label="Willkommensgeschenk"
                      status={activeWelcomeGift
                        ? activeWelcomeGift.status === "unlocked" ? "Einlösbar" : "Reserviert"
                        : "Nicht vorhanden"}
                    />
                    <BenefitTile
                      icon={<CakeSlice size={22} />}
                      label="Geburtstagsgeschenk"
                      status={activeBirthdayGift ? "Einlösbar" : "Nicht vorhanden"}
                    />
                    <BenefitTile
                      icon={<Flame size={22} />}
                      label="Bonus Boost"
                      status={activeBoost ? `${activeBoost.multiplier}× aktiv` : "Nicht aktiv"}
                    />
                    <BenefitTile
                      disabled={creatingReferral}
                      icon={<UserPlus size={22} />}
                      label="Freund einladen"
                      onClick={referralBoostEnabled ? handleCreateReferralLink : undefined}
                      status={referralBoostEnabled ? `${referralBoostMultiplier}× für euch` : "Nicht verfügbar"}
                    />
                  </div>
                </section>

                <section className="premium-content-section">
                  <SectionHeader
                    action={pointRedemptions.length > 2 ? <button className="premium-text-button" onClick={() => setActiveView("redemptions")} type="button">Alle ansehen</button> : null}
                    subtitle="Deine nächsten Möglichkeiten auf einen Blick."
                    title="Mit Punkten einlösbar"
                  />
                  {previewRedemptions.length ? (
                    <div className="premium-reward-grid premium-home-reward-grid">
                      {previewRedemptions.map((reward) => (
                        <RewardCard
                          category={reward.category ?? reward.product_group}
                          imageUrl={reward.image_url}
                          key={`${reward.source}-${reward.assignment_id ?? reward.id}`}
                          locked={reward.status !== "unlocked"}
                          meta={`${reward.required_points} Punkte`}
                          onOpen={reward.status === "unlocked" ? () => openRewardRedemption(reward) : undefined}
                          status={reward.status === "unlocked" ? "Jetzt einlösbar" : `Noch ${reward.remaining_points} Punkte`}
                          title={reward.title}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState description="Sobald das Restaurant eine Punkteeinlösung aktiviert, erscheint sie hier." title="Noch keine Punkteeinlösungen" />
                  )}
                </section>

                {activeWelcomeGift || activeBirthdayGift ? (
                  <section className="premium-content-section premium-gift-preview">
                    <SectionHeader subtitle="Dein persönlicher Vorteil für den nächsten Besuch." title="Dein Geschenk" />
                    <div className="premium-reward-grid">
                      {activeBirthdayGift ? (
                        <RewardCard
                          category="Geburtstagsgeschenk"
                          imageUrl={activeBirthdayGift.image_url}
                          meta="Für deinen Geburtstag"
                          onOpen={() => openRewardRedemption(activeBirthdayGift)}
                          status="Jetzt einlösbar"
                          title={activeBirthdayGift.title}
                        />
                      ) : activeWelcomeGift ? (
                        <RewardCard
                          category="Willkommensgeschenk"
                          imageUrl={activeWelcomeGift.image_url}
                          locked={activeWelcomeGift.status !== "unlocked"}
                          meta={welcomeGiftDetail(activeWelcomeGift) ?? "Für dich reserviert"}
                          onOpen={activeWelcomeGift.status === "unlocked" ? () => openRewardRedemption(activeWelcomeGift) : undefined}
                          status={activeWelcomeGift.status === "unlocked" ? "Jetzt einlösbar" : "Nach der ersten Punktebuchung verfügbar"}
                          title={activeWelcomeGift.title}
                        />
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <PremiumCard className={`premium-boost-card ${activeBoost ? "active" : "inactive"}`} variant="information">
                  <div className="premium-icon-heading">
                    <span><Flame aria-hidden="true" size={22} /></span>
                    <div>
                      <StatusBadge tone={activeBoost ? "warning" : "neutral"}>Bonus Boost</StatusBadge>
                      <h2>{activeBoost ? `${activeBoost.multiplier}× Punkte aktiv` : "Lade einen Freund ein"}</h2>
                    </div>
                  </div>
                  <p>
                    {activeBoost
                      ? activeBoost.multiplier === 2
                        ? "Du sammelst aktuell doppelte Punkte."
                        : `Du sammelst aktuell ${activeBoost.multiplier}× Punkte.`
                      : `Ihr sammelt beide ${referralBoostDurationDays} Tage lang ${referralBoostMultiplier}× Punkte.`}
                  </p>
                  <div className="premium-boost-meta">
                    <strong>{activeBoost?.multiplier ?? referralBoostMultiplier}×</strong>
                    <span>{boostRemainingLabel ?? `+${referralBoostDurationDays} Tage`}</span>
                  </div>
                  {activeBoost ? (
                    <div className="boost-progress-track" aria-label="Bonus Boost Restzeit"><span style={{ width: `${boostProgress}%` }} /></div>
                  ) : null}
                  {referralBoostEnabled ? (
                    <PrimaryButton disabled={creatingReferral} onClick={handleCreateReferralLink}>
                      Freund einladen
                    </PrimaryButton>
                  ) : null}
                  {referralLink ? (
                    <div className="referral-share-box premium-referral-share compact">
                      <p>Dein Einladungslink ist bereit.</p>
                      <a href={referralLink}>Einladungslink öffnen</a>
                    </div>
                  ) : null}
                </PremiumCard>
              </section>
            ) : null}

            {activeView === "redemptions" ? (
              <section className="premium-view-stack" aria-labelledby="redemptions-title">
                <div className="premium-page-heading">
                  <span><Gift aria-hidden="true" size={20} /></span>
                  <div><h1 id="redemptions-title">Punkteeinlösungen</h1><p>Entdecke, was du mit deinen Punkten einlösen kannst.</p></div>
                </div>
                <PointsCard label={pointsTitle} note="Dein aktueller Stand für Punkteeinlösungen." value={pointsValue} />
                {pointRedemptions.length ? (
                  <div className="premium-reward-grid">
                    {pointRedemptions.map((reward) => (
                      <RewardCard
                        category={reward.category ?? reward.product_group}
                        imageUrl={reward.image_url}
                        key={`${reward.source}-${reward.assignment_id ?? reward.id}`}
                        locked={reward.status !== "unlocked"}
                        meta={`${reward.required_points} Punkte`}
                        onOpen={reward.status === "unlocked" ? () => openRewardRedemption(reward) : undefined}
                        status={reward.status === "unlocked" ? "Jetzt einlösbar" : `Dir fehlen noch ${reward.remaining_points} Punkte.`}
                        title={reward.title}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState description="Aktuell hat das Restaurant keine Punkteeinlösung freigeschaltet." title="Noch nichts zum Einlösen" />
                )}
              </section>
            ) : null}

            {activeView === "account" ? (
              <section className="premium-view-stack" aria-labelledby="account-title">
                <div className="premium-page-heading">
                  <span className="premium-customer-avatar">{customer.name.trim().charAt(0).toUpperCase()}</span>
                  <div><h1 id="account-title">Dein Bonuskonto</h1><p>{customer.name}</p></div>
                </div>
                <PremiumCard className="premium-account-summary">
                  <div><span>Restaurant</span><strong>{restaurant.name}</strong></div>
                  <div><span>Mitgliedsstatus</span><strong>{customer.membership_level || "Mitglied"}</strong></div>
                  <div><span>Deine Nummer</span><strong>{customer.customer_code}</strong></div>
                </PremiumCard>
                <PremiumCard className="premium-personal-qr">
                  <SectionHeader subtitle="Mit diesem QR kommst du jederzeit zurück zu deinem Bonuskonto." title="Dein persönlicher Bonus-QR" />
                  <div className="premium-qr-frame"><QRCodeSVG value={portalUrl} size={196} level="M" /></div>
                  <StatusBadge><QrCode aria-hidden="true" size={15} /> {customer.customer_code}</StatusBadge>
                </PremiumCard>
                <PremiumCard className="premium-save-account" variant="information">
                  <div className="premium-icon-heading"><span><WalletCards aria-hidden="true" size={22} /></span><div><h2>Bonuskonto speichern</h2><p>Speichere diese Seite für deinen nächsten Besuch.</p></div></div>
                  <SecondaryButton onClick={copyPortalLink}><Copy aria-hidden="true" size={18} /> Link kopieren</SecondaryButton>
                  <p>iPhone: Teilen und „Zum Home-Bildschirm“ wählen.</p>
                  <p>Android: Browsermenü öffnen und „Zum Startbildschirm“ wählen.</p>
                </PremiumCard>
              </section>
            ) : null}

            <BottomNavigation activeView={activeView} onChange={handleCustomerViewChange} />

            {activeRedemptionCode && !redemptionDrawerOpen ? (
              <button className="premium-active-code" onClick={() => setRedemptionDrawerOpen(true)} type="button">
                <Sparkles aria-hidden="true" size={18} /> Aktiven Einlösecode anzeigen
              </button>
            ) : null}

            <AppDrawer
              description="Bitte bestätige die Einlösung erst direkt vor dem Mitarbeiter."
              onClose={() => setRedemptionDrawerOpen(false)}
              open={redemptionDrawerOpen && Boolean(activeRedemptionCode || redeemOffer)}
              title={activeRedemptionCode?.title ?? redeemOffer?.title ?? "Punkteeinlösung"}
            >
              {activeRedemptionCode ? (
                <article className="redemption-code-card premium-redemption-code" aria-live="polite">
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
                <article className="redeem-show-card premium-redemption-confirmation">
                <RewardImage imageUrl={redeemOffer.image_url} title={redeemOffer.title} />
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
                  <SecondaryButton
                    disabled={redeemingReward}
                    onClick={() => {
                      setRedeemOffer(null);
                      setRedemptionStatus(null);
                      setRedemptionCompleted(false);
                      setRedemptionDrawerOpen(false);
                    }}
                    type="button"
                  >Abbrechen</SecondaryButton>
                  {!redemptionCompleted ? (
                    <PrimaryButton
                      disabled={redeemingReward}
                      onClick={handleRedeemCustomerReward}
                      type="button"
                    >Jetzt verbindlich einlösen</PrimaryButton>
                  ) : null}
                </div>
                </article>
              ) : null}
            </AppDrawer>
          </>
        ) : null}

        {message && !(customer && isBonusCollection) ? <p className="status-message" role="alert">{message}</p> : null}
      </PageContainer>
    </AppShell>
  );
}
