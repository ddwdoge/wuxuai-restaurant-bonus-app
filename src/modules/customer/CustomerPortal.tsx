import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  CakeSlice,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Flame,
  Gift,
  IdCard,
  LockKeyhole,
  LogOut,
  MapPinned,
  QrCode,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useSearchParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import { AppDrawer } from "../../shared/components/AppDrawer";
import type { Restaurant, RestaurantBranding } from "../../shared/types/domain";
import { loadCustomerRedemptionStatus, startCustomerRedemption } from "../rewards/rewardService";
import {
  legalCenterStateFromResponse,
  loadPublicLegalCenter,
  type LegalCenterState,
} from "../legal/legalService";
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
  isUsableRestaurantSlug,
  loadPortalForRestaurant,
  persistScopedActiveRedemption,
  removeScopedActiveRedemption,
  restoreScopedActiveRedemption,
  type ScopedActiveRedemption,
} from "./customerRedemptionSession.mjs";
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
  type RewardCardState,
} from "./components/PremiumCustomerUi";
import { RewardImageFrame } from "../../shared/components/RewardImageFrame";
import { rewardImageCropFromRecord } from "../../shared/rewardImageCrop";
import { CustomerRestaurantScanner } from "./components/CustomerRestaurantScanner";
import {
  customerPushAvailable,
  disableCustomerPush,
  drawCustomerBirthdayGift,
  enableCustomerPush,
  loadCustomerIdentitySummary,
  loadCustomerRetentionStatus,
  markExpiryReminder,
  type CustomerIdentitySummary,
  type CustomerRetentionStatus,
  type ExpiryReminder,
} from "./retentionService";
import {
  customerRegistrationCanSubmit,
  emptyCustomerRegistrationForm,
  isValidCustomerFirstName,
  isValidCustomerPhone,
} from "./customerRegistration.mjs";

type GuestStep = "welcome" | "register" | "success";
type CollectStep = "entry" | "tier" | "pin";
type RewardFilter = "all" | "mine";
type RedemptionSheetStep = "detail" | "confirm";
type AccountSheet = "profile" | "membership" | "qr" | "save" | "restaurant" | "help" | "logout" | null;
type RedemptionOutcome = {
  kind: "redeemed" | "expired" | "error";
  pointsSpent: number;
  title: string;
};

type ActiveRedemptionCode = ScopedActiveRedemption;

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

function rewardState(reward: PublicCustomerOfferView, nowMs: number, activeCode: ActiveRedemptionCode | null): RewardCardState {
  const expiresAt = reward.valid_until ?? reward.expires_at;
  if (expiresAt && new Date(expiresAt).getTime() <= nowMs) return "expired";
  if (reward.status === "redeemed") return "redeemed";
  if (reward.status === "redemption_started" || activeCode?.rewardId === reward.id) return "redeeming";
  return reward.status === "unlocked" ? "available" : "locked";
}

function rewardStatusText(reward: PublicCustomerOfferView, state: RewardCardState) {
  if (state === "available") return reward.is_starter_reward ? "Geschenk einlösbar" : "Jetzt einlösbar";
  if (state === "redeeming") return "Einlösecode ist aktiv";
  if (state === "redeemed") return "Bereits eingelöst";
  if (state === "expired") return "Nicht mehr verfügbar";
  if (reward.is_starter_reward) return "Noch nicht freigeschaltet";
  if (reward.remaining_stamps > 0) return `Noch ${reward.remaining_stamps} Stempel`;
  return `Noch ${reward.remaining_points} Punkte`;
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
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

type CustomerPortalProps = {
  isBonusCollection: boolean;
  restaurantSlug: string;
};

export function CustomerPortal({ isBonusCollection, restaurantSlug }: CustomerPortalProps) {
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
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>("all");
  const [redemptionSheetStep, setRedemptionSheetStep] = useState<RedemptionSheetStep>("detail");
  const [redemptionOutcome, setRedemptionOutcome] = useState<RedemptionOutcome | null>(null);
  const [redemptionStatus, setRedemptionStatus] = useState<string | null>(null);
  const [activeRedemptionCode, setActiveRedemptionCode] = useState<ActiveRedemptionCode | null>(null);
  const [redeemingReward, setRedeemingReward] = useState(false);
  const [redemptionDrawerOpen, setRedemptionDrawerOpen] = useState(false);
  const [storedCustomerToken, setStoredCustomerToken] = useState<string | null>(null);
  const [collectStep, setCollectStep] = useState<CollectStep>("entry");
  const [selectedTierKey, setSelectedTierKey] = useState("");
  const [dailyPin, setDailyPin] = useState("");
  const [collectionResult, setCollectionResult] = useState<BonusPointCollectionResult | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [retention, setRetention] = useState<CustomerRetentionStatus | null>(null);
  const [identitySummary, setIdentitySummary] = useState<CustomerIdentitySummary | null>(null);
  const [legalCenterState, setLegalCenterState] = useState<LegalCenterState>({ status: "loading" });
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);
  const [drawingBirthdayGift, setDrawingBirthdayGift] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [accountSheet, setAccountSheet] = useState<AccountSheet>(null);
  const [form, setForm] = useState(() => ({ ...emptyCustomerRegistrationForm }));
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [creatingReferral, setCreatingReferral] = useState(false);
  const [restaurantScannerOpen, setRestaurantScannerOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshToken, setRefreshToken] = useState(0);
  const collectionInFlightRef = useRef(false);
  const dailyPinInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const redemptionInFlightRef = useRef(false);
  const processedReminderDeepLinkRef = useRef<string | null>(null);
  const activeToken = customerToken ?? registration?.customer.customer_qr_token ?? storedCustomerToken;
  const portalUrl = `${window.location.origin}/customer/${restaurantSlug}${activeToken ? `?token=${encodeURIComponent(activeToken)}` : ""}`;
  const legalCenter = legalCenterState.status === "ready" ? legalCenterState.data : null;

  const reloadLegalCenter = useCallback(async () => {
    if (!isUsableRestaurantSlug(restaurantSlug)) {
      setLegalCenterState({ status: "error", message: "Rechtliche Informationen sind für diesen Restaurant-Link nicht verfügbar." });
      return;
    }
    setLegalCenterState({ status: "loading" });
    try {
      const legalData = await loadPublicLegalCenter(restaurantSlug, activeToken);
      setLegalCenterState(legalCenterStateFromResponse(legalData));
    } catch {
      setLegalCenterState({ status: "error", message: "Rechtliche Informationen konnten gerade nicht geladen werden." });
    }
  }, [activeToken, restaurantSlug]);
  useEffect(() => {
    if (!isUsableRestaurantSlug(restaurantSlug)) return;
    setStoredCustomerToken(readStoredCustomerToken(restaurantSlug));
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

    if (!isUsableRestaurantSlug(restaurantSlug)) {
      setRestaurant(null);
      setBranding(null);
      setSettings(null);
      setCustomer(null);
      setRewards([]);
      setRetention(null);
      setLegalCenterState({ status: "error", message: "Rechtliche Informationen sind für diesen Restaurant-Link nicht verfügbar." });
      setActiveRedemptionCode(null);
      setRedeemOffer(null);
      setRedemptionOutcome(null);
      setRedemptionDrawerOpen(false);
      setMessage("Restaurant wurde nicht gefunden.");
      return undefined;
    }

    async function loadPortal() {
      const portalResult = await loadPortalForRestaurant({
        restaurantSlug,
        customerToken: activeToken,
        loadPortal: loadCustomerPortalData,
        maxAttempts: 2,
        retryDelayMs: 450,
        isCancelled: () => cancelled,
        shouldRetry: (error: unknown) => {
          const message = error instanceof Error ? error.message.toLowerCase() : "";
          return !message.includes("restaurant wurde nicht gefunden")
            && !message.includes("customer token not valid");
        },
      });
      if (portalResult.status === "cancelled") return;
      if (portalResult.status !== "loaded") {
        throw portalResult.error ?? new Error("Restaurant wurde nicht gefunden.");
      }
      const data = portalResult.data;
      if (!cancelled) {
        setRestaurant(data.restaurant);
        setBranding(data.branding);
        setSettings(data.settings);
        setCustomer(data.customer);
        setRewards(data.offers);
        setMessage(null);
        if (data.customer) {
          setGuestStep("welcome");
        }
      }
      if (!cancelled) await reloadLegalCenter();
      if (data.customer && activeToken && restaurantSlug) {
        try {
          const [retentionData, identityData] = await Promise.all([
            loadCustomerRetentionStatus(restaurantSlug, activeToken),
            loadCustomerIdentitySummary(restaurantSlug, activeToken),
          ]);
          if (!cancelled) {
            setRetention(retentionData);
            setIdentitySummary(identityData);
          }
        } catch (retentionError) {
          if (!cancelled) {
            console.warn("Zusätzliche Kundenhinweise konnten nicht geladen werden.", retentionError);
            setRetention(null);
            setIdentitySummary(null);
          }
        }
      } else if (!cancelled) {
        setRetention(null);
        setIdentitySummary(null);
      }
    }

    loadPortal().catch((error) => {
      if (!cancelled) {
        console.error("Kundenportal konnte nicht geladen werden.", error);
        setRestaurant(null);
        setBranding(null);
        setSettings(null);
        setCustomer(null);
        setRewards([]);
        setRetention(null);
        setIdentitySummary(null);
        setLegalCenterState({ status: "error", message: "Rechtliche Informationen konnten gerade nicht geladen werden." });
        setActiveRedemptionCode(null);
        setRedeemOffer(null);
        setRedemptionOutcome(null);
        setRedemptionDrawerOpen(false);
        if (activeToken && isInvalidCustomerTokenError(error)) {
          removeStoredCustomerToken(restaurantSlug);
          setStoredCustomerToken(null);
          setRegistration(null);
          setGuestStep("welcome");
          void removeScopedActiveRedemption(window.sessionStorage, {
            restaurantSlug,
            customerToken: activeToken,
          });
          setMessage("Du bist auf diesem Gerät noch nicht angemeldet.");
          return;
        }
        setMessage(error instanceof Error ? error.message : "Live-Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Verbindung.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeToken, customerToken, refreshToken, reloadLegalCenter, restaurantSlug]);

  useEffect(() => {
    if (!activeToken || !customer || !retention?.reminders.length || infoOpen || redemptionDrawerOpen || accountSheet) return;
    const sessionKey = `wuxuai:expiry-reminders:${restaurantSlug}:${customer.customer_code}`;
    if (window.sessionStorage.getItem(sessionKey)) return;
    window.sessionStorage.setItem(sessionKey, "seen");
    setInfoOpen(true);
    retention.reminders.forEach((reminder) => {
      void markExpiryReminder(activeToken, reminder.id, "displayed").catch(() => undefined);
    });
  }, [accountSheet, activeToken, customer, infoOpen, redemptionDrawerOpen, restaurantSlug, retention]);

  useEffect(() => {
    const reminderId = searchParams.get("reminder");
    const rewardId = searchParams.get("reward");
    if (!activeToken || !customer || !reminderId || !rewardId || processedReminderDeepLinkRef.current === reminderId) return;

    const reminder = retention?.reminders.find((entry) => entry.id === reminderId && entry.reward_id === rewardId);
    const reward = rewards.find((entry) => entry.id === rewardId
      && (!reminder?.customer_reward_id || entry.assignment_id === reminder.customer_reward_id));
    if (!reward) return;

    processedReminderDeepLinkRef.current = reminderId;
    if (reminder) void markExpiryReminder(activeToken, reminder.id, "opened").catch(() => undefined);
    setActiveView("redemptions");
    setRedeemOffer(reward);
    setRedemptionSheetStep("detail");
    setRedemptionOutcome(null);
    setRedemptionStatus(null);
    setRedemptionDrawerOpen(true);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("reminder");
    nextSearchParams.delete("reward");
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeToken, customer, retention, rewards, searchParams, setSearchParams]);

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

  useEffect(() => {
    if (!isBonusCollection || collectStep !== "pin") return;
    const frame = window.requestAnimationFrame(() => dailyPinInputRefs.current[0]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [collectStep, isBonusCollection]);

  const visibleRewards = useMemo<PublicCustomerOfferView[]>(
    () => rewards.filter((offer) => offer.active && offer.status !== "redeemed" && offer.status !== "redemption_started"),
    [rewards],
  );
  const pointRedemptions = visibleRewards.filter((offer) => offer.source === "reward" && !offer.is_starter_reward);
  const redemptionCatalog = rewards.filter((offer) => offer.source === "reward" && offer.active);
  const myRedemptions = redemptionCatalog.filter((offer) => offer.is_starter_reward || offer.status !== "locked");
  const filteredRedemptions = rewardFilter === "mine" ? myRedemptions : redemptionCatalog;
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
  const legalTerms = legalCenter?.documents.find((document) => document.document_type === "participation_terms");
  const pointsValidityMonths = Number(legalTerms?.content.points_validity_months);
  const pointsValidityText = Number.isFinite(pointsValidityMonths) && pointsValidityMonths > 0
    ? `Punkte sind nach den aktuellen Teilnahmebedingungen ${pointsValidityMonths} Monate gültig.`
    : "Die Punktegültigkeit ist in den Teilnahmebedingungen des Restaurants beschrieben.";
  const bonusTiers = settings?.bonus_amount_tiers?.length ? settings.bonus_amount_tiers : defaultBonusAmountTiers;
  const sortedBonusTiers = [...bonusTiers].sort((left, right) => left.min - right.min);
  const selectedTier = sortedBonusTiers.find((tier) => tier.key === selectedTierKey) ?? null;
  const rawActiveBoost = customer?.bonus_boost ?? null;
  const referralBoostEnabled = settings?.referral_boost_enabled ?? true;
  const referralBoostMultiplier = Number(settings?.referral_boost_multiplier) || 2;
  const referralBoostDurationDays = Number(settings?.referral_boost_duration_days) || 30;
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
  const reasonToJoin = `${restaurant?.name ?? "Dieses Restaurant"} belohnt treue Gäste.`;
  const explanation = [
    `${restaurant?.name ?? "Das Restaurant"} wurde über deinen QR automatisch erkannt.`,
    isBonusCollection
      ? `Wähle nach dem Bezahlen die passende Bon-Stufe aus.`
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
  const collectionRewardProgress = collectionResult?.next_reward?.required_points
    ? clampPercent(((collectionResult.next_reward.required_points - collectionResult.next_reward.remaining_points)
      / collectionResult.next_reward.required_points) * 100)
    : 0;
  const redemptionSecondsRemaining = activeRedemptionCode
    ? Math.min(15 * 60, Math.max(0, Math.ceil((new Date(activeRedemptionCode.expiresAt).getTime() - nowMs) / 1_000)))
    : 0;

  useEffect(() => {
    setActiveRedemptionCode(null);
    setRedeemOffer(null);
    setRedemptionOutcome(null);
    setRedemptionDrawerOpen(false);
  }, [activeToken, restaurantSlug]);

  useEffect(() => {
    if (!isUsableRestaurantSlug(restaurantSlug) || !activeToken || !customer) return;
    const customerTokenForCheck = activeToken;
    let cancelled = false;

    async function restoreActiveRedemption() {
      try {
        const restored = await restoreScopedActiveRedemption(window.sessionStorage, {
          restaurantSlug,
          customerToken: customerTokenForCheck,
        }, loadCustomerRedemptionStatus);
        if (cancelled) return;
        if (!restored.redemption) return;

        if (restored.state === "active") {
          setActiveRedemptionCode(restored.redemption);
          setRedemptionOutcome(null);
          setRedemptionDrawerOpen(true);
          return;
        }

        setActiveRedemptionCode(null);
        if (restored.state === "redeemed" || restored.state === "expired") {
          setRedemptionOutcome({
            kind: restored.state,
            pointsSpent: restored.redemption.pointsSpent,
            title: restored.redemption.title,
          });
          setRedemptionDrawerOpen(true);
        }
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
  }, [activeToken, customer, restaurantSlug]);

  useEffect(() => {
    if (!activeRedemptionCode || !activeToken || !restaurantSlug) return;
    let cancelled = false;
    let requestRunning = false;
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
          void removeScopedActiveRedemption(window.sessionStorage, {
            restaurantSlug,
            customerToken: activeToken,
            redemptionId: activeRedemptionCode.redemptionId,
          });
          setRedemptionOutcome({
            kind: serverStatus.status === "redeemed" ? "redeemed" : serverStatus.status === "expired" ? "expired" : "error",
            pointsSpent: activeRedemptionCode.pointsSpent,
            title: activeRedemptionCode.title,
          });
          setActiveRedemptionCode(null);
          setRedemptionDrawerOpen(true);
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
    if (!activeRedemptionCode || redemptionSecondsRemaining > 0 || !restaurantSlug || !activeToken) return;
    void removeScopedActiveRedemption(window.sessionStorage, {
      restaurantSlug,
      customerToken: activeToken,
      redemptionId: activeRedemptionCode.redemptionId,
    });
    setRedemptionOutcome({
      kind: "expired",
      pointsSpent: activeRedemptionCode.pointsSpent,
      title: activeRedemptionCode.title,
    });
    setActiveRedemptionCode(null);
    setRedemptionDrawerOpen(true);
    setMessage("Der Einlösecode ist abgelaufen.");
  }, [activeRedemptionCode, activeToken, redemptionSecondsRemaining, restaurantSlug]);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (!restaurantSlug || !isValidCustomerFirstName(form.firstName)) {
      setMessage("Bitte gib einen gültigen Vornamen ein.");
      return;
    }
    if (!isValidCustomerPhone(form.phone)) {
      setMessage("Bitte gib eine gültige Telefonnummer ein.");
      return;
    }
    if (legalCenterState.status !== "ready") {
      setMessage("Teilnahmebedingungen und Datenschutzinformationen müssen vor der Registrierung verfügbar sein. Bitte versuche es erneut.");
      return;
    }
    if (!form.termsAccepted || !form.privacyAcknowledged) {
      setMessage("Bitte akzeptiere die Teilnahmebedingungen und bestätige die Datenschutzerklärung.");
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
        legal: {
          termsAccepted: form.termsAccepted,
          privacyAcknowledged: form.privacyAcknowledged,
          marketingPush: form.marketingPush,
          marketingSms: form.marketingSms,
          marketingEmail: form.marketingEmail,
          birthdayProcessing: form.birthdayProcessing,
        },
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
    if (!selectedTier) {
      setMessage("Bitte wähle eine Bon-Stufe aus.");
      return;
    }

    if (!restaurantSlug || !activeToken) {
      setMessage("Öffne zuerst deinen persönlichen Bonus.");
      return;
    }

    if (!/^\d{4}$/.test(dailyPin)) {
      setMessage("Bitte gib die vierstellige Tages-PIN vollständig ein.");
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

  function selectBonusTier(tierKey: string) {
    setSelectedTierKey(tierKey);
    setMessage(null);
  }

  function updateDailyPinDigit(index: number, input: string) {
    const digit = input.replace(/\D/g, "").slice(-1);
    if (!digit) {
      setDailyPin((current) => current.slice(0, index));
      return;
    }
    const digits = dailyPin.slice(0, index).split("");
    digits[index] = digit;
    setDailyPin(digits.join(""));
    setMessage(null);
    if (digit && index < 3) dailyPinInputRefs.current[index + 1]?.focus();
  }

  function handleDailyPinKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Backspace") return;
    event.preventDefault();
    if (dailyPin[index]) {
      setDailyPin((current) => current.slice(0, index));
      return;
    }
    const previousIndex = Math.max(0, index - 1);
    setDailyPin((current) => current.slice(0, previousIndex));
    dailyPinInputRefs.current[previousIndex]?.focus();
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

  async function handleBirthdayGiftDraw() {
    if (!activeToken || !restaurantSlug || drawingBirthdayGift) return;
    setDrawingBirthdayGift(true);
    setRetentionMessage(null);
    try {
      const gift = await drawCustomerBirthdayGift(restaurantSlug, activeToken, crypto.randomUUID());
      setRetentionMessage(gift.already_drawn
        ? "Deine Geburtstagsüberraschung ist bereits für dich reserviert."
        : `${gift.title} wurde für dich ausgelost.`);
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setRetentionMessage(error instanceof Error ? error.message : "Geburtstagsüberraschung konnte nicht ausgelost werden.");
    } finally {
      setDrawingBirthdayGift(false);
    }
  }

  async function handleEnablePush() {
    if (!activeToken || !restaurantSlug || enablingPush) return;
    setEnablingPush(true);
    setRetentionMessage(null);
    try {
      await enableCustomerPush(restaurantSlug, activeToken);
      setRetention((current) => current ? { ...current, push: { subscribed: true } } : current);
      setRetentionMessage("Ablauf-Erinnerungen sind aktiviert.");
    } catch (error) {
      setRetentionMessage(error instanceof Error ? error.message : "Push-Benachrichtigungen konnten nicht aktiviert werden.");
    } finally {
      setEnablingPush(false);
    }
  }

  async function handleDisablePush() {
    if (!activeToken || !restaurantSlug || enablingPush) return;
    setEnablingPush(true);
    try {
      await disableCustomerPush(restaurantSlug, activeToken);
      setRetention((current) => current ? { ...current, push: { subscribed: false } } : current);
      setRetentionMessage("Push-Erinnerungen sind deaktiviert.");
    } catch {
      setRetentionMessage("Push-Erinnerungen konnten gerade nicht deaktiviert werden.");
    } finally {
      setEnablingPush(false);
    }
  }

  function openExpiryReminder(reminder: ExpiryReminder) {
    const reward = rewards.find((offer) => offer.id === reminder.reward_id
      && (!reminder.customer_reward_id || offer.assignment_id === reminder.customer_reward_id));
    if (!reward) {
      setActiveView("redemptions");
      setInfoOpen(false);
      return;
    }
    if (activeToken) void markExpiryReminder(activeToken, reminder.id, "opened").catch(() => undefined);
    setInfoOpen(false);
    openRewardRedemption(reward);
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

  function openRestaurantScanner() {
    setSelectedTierKey("");
    setDailyPin("");
    setCollectionResult(null);
    setMessage(null);
    setCollectStep("entry");
    setRestaurantScannerOpen(true);
  }

  function cancelRestaurantScanner() {
    setRestaurantScannerOpen(false);
    window.location.assign("/customer");
  }

  function handleRestaurantDetected(_nextRestaurantSlug: string, targetPath: string) {
    setRestaurantScannerOpen(false);
    window.location.assign(targetPath);
  }

  function openMyRedemptions() {
    setRewardFilter("mine");
    setActiveView("redemptions");
  }

  async function handleCustomerLogout() {
    if (!restaurantSlug) return;
    removeStoredCustomerToken(restaurantSlug);
    if (activeToken) {
      await removeScopedActiveRedemption(window.sessionStorage, {
        restaurantSlug,
        customerToken: activeToken,
      });
    }
    window.location.assign(`/customer/${restaurantSlug}`);
  }

  function openRewardRedemption(reward: PublicCustomerOfferView) {
    if (!activeToken) {
      setMessage("Öffne zuerst deinen persönlichen Bonus.");
      return;
    }

    if (reward.source !== "reward") {
      setMessage("Diese Punkteeinlösung ist nicht mehr verfügbar.");
      return;
    }

    setRedeemOffer(reward);
    setRedemptionSheetStep("detail");
    setRedemptionOutcome(null);
    setRedemptionStatus(null);
    setRedemptionDrawerOpen(true);
  }

  function closeRedemptionDrawer() {
    setRedemptionDrawerOpen(false);
    setRedemptionStatus(null);
    setRedemptionSheetStep("detail");
    if (!activeRedemptionCode) {
      setRedeemOffer(null);
      setRedemptionOutcome(null);
    }
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
      setRedemptionOutcome(null);
      await persistScopedActiveRedemption(window.sessionStorage, {
        restaurantSlug,
        customerToken: activeToken,
        redemption: nextActiveCode,
      });
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
      setRefreshToken((current) => current + 1);
    } catch (error) {
      console.error("Punkteeinlösung konnte nicht verwendet werden.", error);
      setRedemptionStatus(error instanceof Error ? error.message : "Diese Punkteeinlösung ist nicht mehr verfügbar.");
    } finally {
      redemptionInFlightRef.current = false;
      setRedeemingReward(false);
    }
  }

  const selectedRewardState = redeemOffer ? rewardState(redeemOffer, nowMs, activeRedemptionCode) : null;
  const redemptionDrawerFooter = activeRedemptionCode || redemptionOutcome ? (
    <PrimaryButton onClick={closeRedemptionDrawer}>Schließen</PrimaryButton>
  ) : redeemOffer && redemptionSheetStep === "confirm" ? (
    <>
      <SecondaryButton disabled={redeemingReward} onClick={() => {
        setRedemptionSheetStep("detail");
        setRedemptionStatus(null);
      }}>Zurück</SecondaryButton>
      <PrimaryButton disabled={redeemingReward} onClick={handleRedeemCustomerReward}>
        {redeemingReward ? "Einlösung wird vorbereitet …" : "Jetzt verbindlich einlösen"}
      </PrimaryButton>
    </>
  ) : redeemOffer ? (
    <>
      <SecondaryButton onClick={closeRedemptionDrawer}>Schließen</SecondaryButton>
      {selectedRewardState === "available" ? (
        <PrimaryButton onClick={() => setRedemptionSheetStep("confirm")}>Jetzt einlösen</PrimaryButton>
      ) : null}
    </>
  ) : null;
  const registrationCanSubmit = customerRegistrationCanSubmit(form, legalCenterState.status === "ready");

  if (!settings || !restaurant || !branding) {
    return (
      <AppShell>
        <PageContainer className={isBonusCollection ? "premium-collect-page premium-collect-loading-page" : undefined}>
          {message ? (
            <ErrorState
              action={isUsableRestaurantSlug(restaurantSlug) ? (
                <PrimaryButton onClick={() => {
                  setMessage(null);
                  setRefreshToken((current) => current + 1);
                }}>
                  Erneut versuchen
                </PrimaryButton>
              ) : undefined}
              description={message}
              title="Dein Bonus konnte nicht geöffnet werden"
            />
          ) : (
            <LoadingState description="Dein Bonus wird geladen." />
          )}
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell fontFamily={branding.font_family} primaryColor={branding.primary_color}>
      <PageContainer className={`customer-portal-page${isBonusCollection ? " premium-collect-page" : ""}${guestStep === "register" ? " customer-registration-page" : ""}`}>
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
            {retention?.reminders.length ? (
              <section className="premium-expiry-reminders" aria-labelledby="expiry-reminders-title">
                <div className="premium-icon-heading">
                  <span><BellRing aria-hidden="true" size={21} /></span>
                  <div><StatusBadge tone="warning">Hinweis</StatusBadge><h2 id="expiry-reminders-title">Bald ablaufend</h2></div>
                </div>
                {retention.reminders.map((reminder) => (
                  <article key={reminder.id}>
                    <div>
                      <strong>{reminder.title}</strong>
                      <span>{reminder.remaining_days === 0
                        ? "Nur noch heute gültig"
                        : `Noch ${reminder.remaining_days} ${reminder.remaining_days === 1 ? "Tag" : "Tage"} gültig`}</span>
                      <small>Ablauf: {new Date(reminder.expires_at).toLocaleDateString("de-AT")}</small>
                    </div>
                    <button className="premium-text-button" onClick={() => openExpiryReminder(reminder)} type="button">Öffnen</button>
                  </article>
                ))}
                {!retention.push.subscribed ? (
                  <button className="button secondary" disabled={enablingPush || !customerPushAvailable()} onClick={handleEnablePush} type="button">
                    <BellRing aria-hidden="true" size={18} />
                    {customerPushAvailable() ? "Push-Erinnerungen aktivieren" : "Push auf diesem Gerät nicht verfügbar"}
                  </button>
                ) : <div className="premium-push-active"><p><CheckCircle2 aria-hidden="true" size={17} /> Push-Erinnerungen sind aktiv.</p><button className="premium-text-button" disabled={enablingPush} onClick={handleDisablePush} type="button">Deaktivieren</button></div>}
              </section>
            ) : null}
            {explanation.map((line) => (
              <p className="muted" key={line}>{line}</p>
            ))}
            {retentionMessage ? <p className="status-message" role="status">{retentionMessage}</p> : null}
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
          <article className="customer-hero-card customer-registration-card">
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
              <section className="customer-registration-legal" aria-labelledby="registration-legal-title">
                <h3 id="registration-legal-title">Deine Teilnahme bei {restaurant.name}</h3>
                <p>Das Restaurant betreibt dieses Bonusprogramm. WUXUAI stellt die technische Plattform bereit.</p>
                <ul>
                  <li>Maximal zwei erfolgreiche Punktebuchungen pro Tag.</li>
                  <li>{pointsValidityText}</li>
                  <li>Punkte haben keinen Geldwert und werden nicht bar ausgezahlt.</li>
                  <li>Punkte und Punkteeinlösungen gelten nur bei {restaurant.name}.</li>
                </ul>
                <p><Link to={`/legal/${encodeURIComponent(restaurant.slug)}#participation_terms`}>Teilnahmebedingungen</Link> · <Link to={`/legal/${encodeURIComponent(restaurant.slug)}#privacy`}>Datenschutzerklärung</Link></p>
                {legalCenterState.status === "loading" ? <p role="status">Rechtliche Informationen werden geladen …</p> : null}
                {legalCenterState.status === "error" || legalCenterState.status === "not_configured" ? (
                  <div className="customer-legal-load-warning" role="alert">
                    <p>{legalCenterState.status === "error" ? legalCenterState.message : "Dieses Restaurant hat die erforderlichen rechtlichen Informationen noch nicht vollständig eingerichtet."}</p>
                    <button className="button secondary" onClick={() => void reloadLegalCenter()} type="button">Erneut versuchen</button>
                  </div>
                ) : null}
                <label><input checked={form.termsAccepted} disabled={legalCenterState.status !== "ready"} onChange={(event) => setForm((current) => ({ ...current, termsAccepted: event.target.checked }))} type="checkbox" /><span>Ich akzeptiere die Teilnahmebedingungen.</span></label>
                <label><input checked={form.privacyAcknowledged} disabled={legalCenterState.status !== "ready"} onChange={(event) => setForm((current) => ({ ...current, privacyAcknowledged: event.target.checked }))} type="checkbox" /><span>Ich habe die Datenschutzerklärung zur Kenntnis genommen.</span></label>
              </section>
              <details className="customer-registration-consents">
                <summary id="registration-consents-title">Freiwillige Einwilligungen <span>Optional</span></summary>
                <p>Diese Auswahl ist freiwillig und für dein Bonuskonto nicht erforderlich.</p>
                <label><input checked={form.birthdayProcessing} onChange={(event) => setForm((current) => ({ ...current, birthdayProcessing: event.target.checked }))} type="checkbox" /><span>Geburtstag für ein mögliches Geburtstagsgeschenk verwenden.</span></label>
                <label><input checked={form.marketingPush} onChange={(event) => setForm((current) => ({ ...current, marketingPush: event.target.checked }))} type="checkbox" /><span>Marketing per Push erhalten.</span></label>
                <label><input checked={form.marketingSms} onChange={(event) => setForm((current) => ({ ...current, marketingSms: event.target.checked }))} type="checkbox" /><span>Marketing per SMS erhalten.</span></label>
                <label><input checked={form.marketingEmail} onChange={(event) => setForm((current) => ({ ...current, marketingEmail: event.target.checked }))} type="checkbox" /><span>Marketing per E-Mail erhalten.</span></label>
              </details>
              {message ? <p className="status-message error" role="alert">{message}</p> : null}
              <div className="grid two customer-registration-actions">
                <button className="button secondary" onClick={() => setGuestStep("welcome")} type="button">
                  Zurück
                </button>
                <button className="button" disabled={submitting || !registrationCanSubmit} type="submit">
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
                    <RewardImageFrame alt={registration.welcome_reward.title} crop={rewardImageCropFromRecord(registration.welcome_reward)} imageUrl={registration.welcome_reward.image_url} />
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
          <section className="bonus-collect-flow premium-collect-flow">
            <div className="premium-collect-toolbar">
              <a aria-label="Zurück zur Startseite" className="premium-collect-back" href={portalUrl}>
                <ArrowLeft aria-hidden="true" size={20} />
              </a>
              <span>{collectionResult ? "Punkte gesammelt" : "Punkte sammeln"}</span>
              <span aria-hidden="true" className="premium-collect-toolbar-spacer" />
            </div>
            {collectionResult ? (
              <article className="premium-collect-success" aria-live="polite">
                <span className="premium-success-icon"><CheckCircle2 aria-hidden="true" size={38} /></span>
                <span className="premium-status-badge success">Buchung erfolgreich</span>
                <h1>Punkte gesammelt!</h1>
                {collectionResult.bonus_multiplier > 1 ? (
                  <>
                    <strong className="premium-success-total">+{collectionTotalPoints}</strong>
                    <span className="premium-success-unit">Punkte</span>
                    <div className="boost-success-grid">
                      <div>
                        <span>Normal</span>
                        <strong>{collectionBasePoints} Punkte</strong>
                      </div>
                      <div>
                        <span>Bonus Boost</span>
                        <strong>+{collectionBoostPoints} Punkte</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <strong className="premium-success-total">+{collectionTotalPoints}</strong>
                    <span className="premium-success-unit">Punkte</span>
                  </>
                )}
                <div className="premium-collect-balance">
                  <span>Dein neuer Punktestand</span>
                  <strong>{collectionResult.points_balance} Punkte</strong>
                </div>
                {collectionResult.welcome_gift_unlocked ? (
                  <div className="premium-collect-unlocked">
                    <Sparkles aria-hidden="true" size={20} />
                    <div>
                      <strong>Geschenk freigeschaltet</strong>
                      <span>Dein Willkommensgeschenk ist jetzt einlösbar.</span>
                    </div>
                  </div>
                ) : null}
                {collectionResult.next_reward ? (
                  <div className="premium-collect-next-reward">
                    <div>
                      <span>{collectionResult.next_reward.remaining_points === 0 ? "Jetzt freigeschaltet" : "Nächste Punkteeinlösung"}</span>
                      <strong>{collectionResult.next_reward.title}</strong>
                    </div>
                    <div className="premium-progress" aria-label={`${Math.round(collectionRewardProgress)} Prozent erreicht`}>
                      <span style={{ width: `${collectionRewardProgress}%` }} />
                    </div>
                    <p>
                      {collectionResult.next_reward.remaining_points === 0
                        ? "Du kannst diese Punkteeinlösung jetzt verwenden."
                        : `Noch ${collectionResult.next_reward.remaining_points} Punkte bis zur Einlösung.`}
                    </p>
                  </div>
                ) : (
                  <p className="premium-collect-success-note">Deine Punkteeinlösungen findest du in deinem Bonuskonto.</p>
                )}
                <a className="premium-button premium-button-primary premium-collect-home-button" href={portalUrl}>
                  Zur Startseite
                </a>
              </article>
            ) : (
              <>
                {collectStep === "entry" ? (
                  <article className="premium-collect-entry">
                    <span className="premium-collect-kicker">Nach dem Bezahlen</span>
                    <div className="premium-scanner-frame" aria-hidden="true">
                      <span className="premium-scanner-corner top-left" />
                      <span className="premium-scanner-corner top-right" />
                      <span className="premium-scanner-corner bottom-left" />
                      <span className="premium-scanner-corner bottom-right" />
                      <ScanLine size={58} />
                    </div>
                    <div className="premium-collect-entry-copy">
                      <h1>Punkte sammeln</h1>
                      <p>Dein Restaurant wurde bereits über den QR-Code erkannt.</p>
                    </div>
                    <div className="premium-restaurant-recognized">
                      <span><Store aria-hidden="true" size={20} /></span>
                      <div>
                        <small>Restaurant erkannt</small>
                        <strong>{restaurant.name}</strong>
                      </div>
                      <CheckCircle2 aria-hidden="true" size={20} />
                    </div>
                    <PrimaryButton onClick={() => {
                      setCollectStep("tier");
                      setMessage(null);
                    }}>Bon-Stufe auswählen</PrimaryButton>
                    <button
                      aria-label="Anderes Restaurant scannen"
                      className="premium-collect-text-button premium-restaurant-rescan-button"
                      onClick={openRestaurantScanner}
                      type="button"
                    >
                      <QrCode aria-hidden="true" size={18} />
                      Anderes Restaurant scannen
                    </button>
                    <p className="premium-collect-security"><ShieldCheck aria-hidden="true" size={16} /> Sicher mit deinem Bonuskonto verbunden</p>
                  </article>
                ) : null}

                {collectStep === "tier" ? (
                  <article className="premium-collect-step premium-tier-step">
                    <div className="premium-collect-step-heading">
                      <span>Schritt 1 von 2</span>
                      <h1>Welche Bon-Stufe passt?</h1>
                      <p>Wähle gemeinsam mit dem Mitarbeiter den Bereich deiner Rechnung.</p>
                    </div>
                    <div className="premium-tier-grid" role="group" aria-label="Bon-Stufe auswählen">
                      {sortedBonusTiers.map((tier) => {
                        const tierPoints = settings
                          ? calculateBonusTierPoints(tier, settings.amount_per_point, activePointMultiplier)
                          : 0;
                        const isSelected = selectedTier?.key === tier.key;
                        return (
                          <button
                            aria-pressed={isSelected}
                            className={isSelected ? "selected" : ""}
                            key={tier.key}
                            onClick={() => selectBonusTier(tier.key)}
                            type="button"
                          >
                            <ReceiptText aria-hidden="true" size={19} />
                            <strong>{tier.label}</strong>
                            <span>{tierPoints} Punkte</span>
                          </button>
                        );
                      })}
                    </div>
                    {message ? <p className="premium-collect-error" role="alert">{message}</p> : null}
                    <PrimaryButton disabled={!selectedTier} onClick={() => {
                      if (!selectedTier) {
                        setMessage("Bitte wähle eine Bon-Stufe aus.");
                        return;
                      }
                      setCollectStep("pin");
                      setMessage(null);
                    }}>Weiter zur Tages-PIN</PrimaryButton>
                    <button className="premium-collect-text-button" onClick={() => setCollectStep("entry")} type="button">
                      Zurück
                    </button>
                  </article>
                ) : null}

                {collectStep === "pin" && selectedTier ? (
                  <article className="premium-collect-step premium-pin-step">
                    <div className="premium-collect-step-heading">
                      <span>Schritt 2 von 2</span>
                      <h1>Tages-PIN eingeben</h1>
                      <p>Bitte den Mitarbeiter um die heutige vierstellige Tages-PIN.</p>
                    </div>
                    <div className="premium-selected-tier">
                      <div>
                        <span>Ausgewählte Bon-Stufe</span>
                        <strong>{selectedTier.label}</strong>
                      </div>
                      <strong>{previewPoints} Punkte</strong>
                    </div>
                    <div className="premium-pin-fields" role="group" aria-label="Vierstellige Tages-PIN">
                      {[0, 1, 2, 3].map((index) => (
                        <input
                          aria-label={`Tages-PIN Ziffer ${index + 1}`}
                          autoComplete="off"
                          inputMode="numeric"
                          key={index}
                          maxLength={1}
                          onChange={(event) => updateDailyPinDigit(index, event.target.value)}
                          onKeyDown={(event) => handleDailyPinKeyDown(index, event)}
                          pattern="[0-9]*"
                          ref={(element) => { dailyPinInputRefs.current[index] = element; }}
                          type="password"
                          value={dailyPin[index] ?? ""}
                        />
                      ))}
                    </div>
                    <p className="premium-pin-hint"><LockKeyhole aria-hidden="true" size={17} /> Die PIN bleibt auf dem Bildschirm verborgen.</p>
                    {message ? <p className="premium-collect-error" role="alert">{message}</p> : null}
                    <PrimaryButton disabled={collecting} onClick={handleCollectPoints}>
                      {collecting ? "Punkte werden gebucht …" : "Punkte jetzt sammeln"}
                    </PrimaryButton>
                    <button className="premium-collect-text-button" disabled={collecting} onClick={() => {
                      setCollectStep("tier");
                      setDailyPin("");
                      setMessage(null);
                    }} type="button">Bon-Stufe ändern</button>
                  </article>
                ) : null}
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
                <p className="premium-legal-notice">Punkte haben keinen Geldwert, sind nicht auszahlbar und gelten nur im Bonusprogramm dieses Restaurants. {pointsValidityText}</p>
                {legalCenterState.status === "error" || legalCenterState.status === "not_configured" ? (
                  <div className="premium-legal-load-warning" role="status">
                    <span>Rechtliche Informationen sind vorübergehend nicht verfügbar. Dein Bonuskonto bleibt nutzbar.</span>
                    <button onClick={() => void reloadLegalCenter()} type="button">Erneut laden</button>
                  </div>
                ) : null}

                {retention?.reminders.length ? (
                  <button className="premium-expiry-summary" onClick={() => setInfoOpen(true)} type="button">
                    <span><BellRing aria-hidden="true" size={20} /></span>
                    <div><strong>Bald ablaufend</strong><small>{retention.reminders.length === 1 ? "Eine Erinnerung ansehen" : `${retention.reminders.length} Erinnerungen ansehen`}</small></div>
                    <ChevronRight aria-hidden="true" size={19} />
                  </button>
                ) : null}

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
                      status={activeBirthdayGift
                        ? "Einlösbar"
                        : retention?.birthday.eligible ? "Überraschung wartet" : "Nicht vorhanden"}
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

                <Link className="premium-restaurant-finder-link" to={`/customer/restaurants?current=${encodeURIComponent(restaurant.slug)}`}>
                  <span><MapPinned aria-hidden="true" size={22} /></span>
                  <div><strong>Restaurants entdecken</strong><small>WUXUAI Partner in deiner Nähe finden</small></div>
                  <ChevronRight aria-hidden="true" size={19} />
                </Link>

                {retention?.birthday.eligible && !activeBirthdayGift && !retention.birthday.gift ? (
                  <PremiumCard className="premium-birthday-draw-card" variant="highlight">
                    <span className="premium-birthday-icon"><CakeSlice aria-hidden="true" size={25} /></span>
                    <div><StatusBadge tone="warning">Für dich</StatusBadge><h2>Alles Gute zum Geburtstag!</h2><p>Deine Geburtstagsüberraschung wartet auf dich.</p></div>
                    <PrimaryButton disabled={drawingBirthdayGift} onClick={handleBirthdayGiftDraw}>
                      <Gift aria-hidden="true" size={19} />
                      {drawingBirthdayGift ? "Geschenk wird ausgewählt …" : "Geschenk abholen"}
                    </PrimaryButton>
                    <p className="premium-legal-note-small">Die Geburtstagsangabe ist freiwillig. Pro Restaurant und Jahr ist höchstens ein Geburtstagsgeschenk vorgesehen.</p>
                    {retentionMessage ? <p className="status-message" role="status">{retentionMessage}</p> : null}
                  </PremiumCard>
                ) : null}

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
                          imageCrop={rewardImageCropFromRecord(reward)}
                          key={`${reward.source}-${reward.assignment_id ?? reward.id}`}
                          meta={`${reward.required_points} Punkte`}
                          onOpen={reward.status === "unlocked" ? () => openRewardRedemption(reward) : undefined}
                          state={rewardState(reward, nowMs, activeRedemptionCode)}
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
                          imageCrop={rewardImageCropFromRecord(activeBirthdayGift)}
                          meta="Für deinen Geburtstag"
                          onOpen={() => openRewardRedemption(activeBirthdayGift)}
                          state={rewardState(activeBirthdayGift, nowMs, activeRedemptionCode)}
                          status="Jetzt einlösbar"
                          title={activeBirthdayGift.title}
                        />
                      ) : activeWelcomeGift ? (
                        <RewardCard
                          category="Willkommensgeschenk"
                          imageUrl={activeWelcomeGift.image_url}
                          imageCrop={rewardImageCropFromRecord(activeWelcomeGift)}
                          meta={welcomeGiftDetail(activeWelcomeGift) ?? "Für dich reserviert"}
                          onOpen={activeWelcomeGift.status === "unlocked" ? () => openRewardRedemption(activeWelcomeGift) : undefined}
                          state={rewardState(activeWelcomeGift, nowMs, activeRedemptionCode)}
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
                  <p className="premium-legal-note-small">Der Bonus Boost gilt ausschließlich für das angezeigte Restaurant und ist nicht übertragbar.</p>
                  {referralLink ? (
                    <div className="referral-share-box premium-referral-share compact">
                      <div className="premium-referral-qr"><QRCodeSVG level="M" size={112} value={referralLink} /></div>
                      <p>Dein Einladungslink und QR-Code sind bereit.</p>
                      <a href={referralLink}>Einladungslink öffnen</a>
                    </div>
                  ) : null}
                  {retention ? <p className="premium-referral-count">{retention.referral.successful_referrals} erfolgreiche {retention.referral.successful_referrals === 1 ? "Empfehlung" : "Empfehlungen"}</p> : null}
                </PremiumCard>
              </section>
            ) : null}

            {activeView === "redemptions" ? (
              <section className="premium-view-stack" aria-labelledby="redemptions-title">
                <div className="premium-page-heading">
                  <span><Gift aria-hidden="true" size={20} /></span>
                  <div><h1 id="redemptions-title">Einlösen</h1><p>Wähle deinen nächsten Vorteil.</p></div>
                </div>
                <div aria-label="Belohnungsansicht" className="premium-segmented-control" role="tablist">
                  <button
                    aria-controls="reward-overview"
                    aria-selected={rewardFilter === "all"}
                    className={rewardFilter === "all" ? "active" : ""}
                    id="reward-tab-all"
                    onClick={() => setRewardFilter("all")}
                    role="tab"
                    type="button"
                  >Alle Belohnungen</button>
                  <button
                    aria-controls="reward-overview"
                    aria-selected={rewardFilter === "mine"}
                    className={rewardFilter === "mine" ? "active" : ""}
                    id="reward-tab-mine"
                    onClick={() => setRewardFilter("mine")}
                    role="tab"
                    type="button"
                  >Meine Belohnungen</button>
                </div>
                <div className="premium-redemption-summary">
                  <div><span>{pointsTitle}</span><strong>{pointsValue}</strong></div>
                  <p>{rewardFilter === "all"
                    ? `${redemptionCatalog.length} ${redemptionCatalog.length === 1 ? "Belohnung" : "Belohnungen"} im Restaurant`
                    : `${myRedemptions.length} ${myRedemptions.length === 1 ? "persönlicher Vorteil" : "persönliche Vorteile"}`}</p>
                </div>
                <p className="premium-legal-notice">Diese Punkteeinlösungen werden vom Restaurant angeboten. Verfügbarkeit und Einlösung richten sich nach den Teilnahmebedingungen des Restaurants.</p>
                {filteredRedemptions.length ? (
                  <div
                    aria-labelledby={rewardFilter === "all" ? "reward-tab-all" : "reward-tab-mine"}
                    className="premium-reward-grid premium-redemption-grid"
                    id="reward-overview"
                    role="tabpanel"
                  >
                    {filteredRedemptions.map((reward) => {
                      const state = rewardState(reward, nowMs, activeRedemptionCode);
                      return (
                      <RewardCard
                        category={reward.category ?? reward.product_group}
                        imageUrl={reward.image_url}
                        imageCrop={rewardImageCropFromRecord(reward)}
                        key={`${reward.source}-${reward.assignment_id ?? reward.id}`}
                        meta={reward.is_starter_reward
                          ? welcomeGiftDetail(reward) ?? "Persönliches Geschenk"
                          : `${reward.required_points} Punkte`}
                        onOpen={() => openRewardRedemption(reward)}
                        state={state}
                        status={rewardStatusText(reward, state)}
                        title={reward.title}
                      />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    description={rewardFilter === "all"
                      ? "Aktuell hat das Restaurant keine Punkteeinlösung freigeschaltet."
                      : "Sobald etwas für dich bereitsteht, erscheint es hier."}
                    title={rewardFilter === "all" ? "Noch nichts zum Einlösen" : "Noch keine persönlichen Belohnungen"}
                  />
                )}
              </section>
            ) : null}

            {activeView === "account" ? (
              <section className="premium-view-stack" aria-labelledby="account-title">
                <div className="premium-account-heading">
                  <span aria-hidden="true" className="premium-customer-avatar">{customer.name.trim().charAt(0).toUpperCase()}</span>
                  <div><span>Dein Konto</span><h1 id="account-title">{customer.name}</h1><p>Bonus-Mitglied bei {restaurant.name}</p></div>
                </div>

                <article className="premium-member-card" aria-label="Digitale Kundenkarte">
                  <div className="premium-member-card-top">
                    <span className="premium-member-card-logo">
                      {branding.logo_url
                        ? <img alt={`${restaurant.name} Logo`} src={branding.logo_url} />
                        : <span aria-hidden="true">{restaurant.name.trim().charAt(0).toUpperCase()}</span>}
                    </span>
                    <div><span>Bonus-Mitglied</span><strong>{restaurant.name}</strong></div>
                    <IdCard aria-hidden="true" size={24} />
                  </div>
                  <div className="premium-member-card-name"><span>Mitglied</span><strong>{customer.name}</strong></div>
                  <div className="premium-member-card-meta">
                    <div><span>Mitglieds-ID</span><strong>{customer.customer_code}</strong></div>
                    <div><span>{settings.loyalty_mode === "stamp_based" ? "Stempel" : "Punkte"}</span><strong>{pointsValue}</strong></div>
                  </div>
                </article>

                <section className="premium-content-section" aria-labelledby="membership-overview-title">
                  <SectionHeader title="Deine Mitgliedschaft" />
                  <div className="premium-account-list">
                    <button onClick={() => setAccountSheet("membership")} type="button">
                      <span className="premium-account-list-icon"><IdCard aria-hidden="true" size={20} /></span>
                      <span><strong id="membership-overview-title">Mitgliedschaft</strong><small>{customer.membership_level || "Mitglied"} · {pointsValue} {settings.loyalty_mode === "stamp_based" ? "Stempel" : "Punkte"}</small></span>
                      <ChevronRight aria-hidden="true" size={19} />
                    </button>
                    <button onClick={() => setAccountSheet("profile")} type="button">
                      <span className="premium-account-list-icon"><UserRound aria-hidden="true" size={20} /></span>
                      <span><strong>Persönliche Daten</strong><small>{customer.name}</small></span>
                      <ChevronRight aria-hidden="true" size={19} />
                    </button>
                  </div>
                </section>

                <p className="premium-legal-notice">Punkte haben keinen Geldwert, sind nicht auszahlbar und gelten nur im Bonusprogramm dieses Restaurants. {pointsValidityText}</p>

                <section className="premium-content-section" aria-labelledby="account-more-title">
                  <SectionHeader subtitle="Schnell zu den wichtigsten Bereichen." title="Mehr" />
                  <div className="premium-account-grid" id="account-more-title">
                    <button onClick={openMyRedemptions} type="button"><Gift aria-hidden="true" size={22} /><strong>Meine Belohnungen</strong><span>Deine Vorteile</span></button>
                    <Link className="premium-account-grid-link" to={`/customer/restaurants?current=${encodeURIComponent(restaurant.slug)}`}><MapPinned aria-hidden="true" size={22} /><strong>Restaurants entdecken</strong><span>WUXUAI Partner</span></Link>
                    <button disabled={creatingReferral || !referralBoostEnabled} onClick={handleCreateReferralLink} type="button"><UserPlus aria-hidden="true" size={22} /><strong>Freund einladen</strong><span>{referralBoostMultiplier}× Punkte</span></button>
                    <button onClick={() => setAccountSheet("qr")} type="button"><QrCode aria-hidden="true" size={22} /><strong>Bonus-QR</strong><span>Persönlich</span></button>
                    <button onClick={() => setAccountSheet("restaurant")} type="button"><Store aria-hidden="true" size={22} /><strong>Restaurant</strong><span>{restaurant.name}</span></button>
                  </div>
                  {referralLink ? (
                    <div className="referral-share-box premium-referral-share compact">
                      <div className="premium-referral-qr"><QRCodeSVG level="M" size={112} value={referralLink} /></div>
                      <p>Dein Einladungslink und QR-Code sind bereit.</p>
                      <a href={referralLink}>Einladungslink öffnen</a>
                    </div>
                  ) : null}
                </section>

                <section className="premium-content-section" aria-label="Konto und Hilfe">
                  <div className="premium-account-list">
                    <button onClick={() => setAccountSheet("save")} type="button">
                      <span className="premium-account-list-icon"><WalletCards aria-hidden="true" size={20} /></span>
                      <span><strong>Bonuskonto speichern</strong><small>Für deinen nächsten Besuch</small></span>
                      <ChevronRight aria-hidden="true" size={19} />
                    </button>
                    <button onClick={() => setAccountSheet("help")} type="button">
                      <span className="premium-account-list-icon"><CircleHelp aria-hidden="true" size={20} /></span>
                      <span><strong>Hilfe & Kontakt</strong><small>Fragen zu deinem Bonus</small></span>
                      <ChevronRight aria-hidden="true" size={19} />
                    </button>
                    <Link className="premium-account-list-link" to={`/legal/${encodeURIComponent(restaurant.slug)}?token=${encodeURIComponent(activeToken ?? "")}`}>
                      <span className="premium-account-list-icon"><ShieldCheck aria-hidden="true" size={20} /></span>
                      <span><strong>Rechtliches & Datenschutz</strong><small>Einwilligungen, Datenexport und Teilnahmebedingungen</small></span>
                      <ChevronRight aria-hidden="true" size={19} />
                    </Link>
                    <button className="danger" onClick={() => setAccountSheet("logout")} type="button">
                      <span className="premium-account-list-icon"><LogOut aria-hidden="true" size={20} /></span>
                      <span><strong>Abmelden</strong><small>Bonuskonto von diesem Gerät entfernen</small></span>
                      <ChevronRight aria-hidden="true" size={19} />
                    </button>
                  </div>
                </section>
              </section>
            ) : null}

            <BottomNavigation activeView={activeView} onChange={handleCustomerViewChange} />

            {activeRedemptionCode && !redemptionDrawerOpen ? (
              <button className="premium-active-code" onClick={() => setRedemptionDrawerOpen(true)} type="button">
                <Sparkles aria-hidden="true" size={18} /> Aktiven Einlösecode anzeigen
              </button>
            ) : null}

            <AppDrawer
              description={activeRedemptionCode
                ? "Zeige den aktiven Code jetzt dem Mitarbeiter."
                : "Alle Details zu deiner Auswahl."}
              footer={redemptionDrawerFooter}
              onClose={closeRedemptionDrawer}
              open={redemptionDrawerOpen && Boolean(activeRedemptionCode || redeemOffer || redemptionOutcome)}
              title={redemptionOutcome?.title ?? activeRedemptionCode?.title ?? redeemOffer?.title ?? "Punkteeinlösung"}
            >
              <div className="premium-redemption-sheet-content">
                {redemptionOutcome ? (
                  <article className={`premium-redemption-outcome ${redemptionOutcome.kind}`} aria-live="polite">
                    <span className="premium-redemption-outcome-icon">
                      {redemptionOutcome.kind === "redeemed"
                        ? <CheckCircle2 aria-hidden="true" size={34} />
                        : redemptionOutcome.kind === "expired"
                          ? <Clock3 aria-hidden="true" size={34} />
                          : <LockKeyhole aria-hidden="true" size={34} />}
                    </span>
                    <StatusBadge tone={redemptionOutcome.kind === "redeemed" ? "success" : "error"}>
                      {redemptionOutcome.kind === "redeemed" ? "Eingelöst" : redemptionOutcome.kind === "expired" ? "Abgelaufen" : "Nicht verfügbar"}
                    </StatusBadge>
                    <h2>{redemptionOutcome.kind === "redeemed" ? "Erfolgreich eingelöst" : "Einlösung beendet"}</h2>
                    <p>{redemptionOutcome.kind === "redeemed"
                      ? redemptionOutcome.pointsSpent > 0
                        ? `${redemptionOutcome.pointsSpent} Punkte wurden eingelöst.`
                        : "Dein Geschenk wurde erfolgreich eingelöst."
                      : redemptionOutcome.kind === "expired"
                        ? "Der Einlösecode ist abgelaufen und kann nicht mehr verwendet werden."
                        : "Diese Einlösung ist nicht mehr verfügbar."}</p>
                    {redemptionOutcome.kind === "redeemed" ? (
                      <p className="premium-redemption-outcome-note">Die Belohnung wurde erfolgreich als verwendet markiert.</p>
                    ) : null}
                  </article>
                ) : null}

                {activeRedemptionCode ? (
                  <article className="redemption-code-card premium-redemption-code" aria-live="polite">
                    <StatusBadge tone="warning">
                      {activeRedemptionCode.redemptionType === "birthday_gift"
                        ? "Geburtstagsgeschenk"
                        : activeRedemptionCode.redemptionType === "welcome_gift"
                          ? "Willkommensgeschenk"
                          : "Punkteeinlösung"}
                    </StatusBadge>
                    <div className="premium-code-heading">
                      <span><Sparkles aria-hidden="true" size={22} /></span>
                      <div><h2>{activeRedemptionCode.title}</h2><p>Zeige diesen Code jetzt dem Mitarbeiter.</p></div>
                    </div>
                    <strong aria-label={`Einlösecode ${activeRedemptionCode.code}`} className="redemption-code-value">
                      {activeRedemptionCode.code.replace(/^(\d{3})(\d{3})$/, "$1 $2")}
                    </strong>
                    <div className="premium-code-countdown">
                      <Clock3 aria-hidden="true" size={18} />
                      <span>Gültig noch</span>
                      <strong>{Math.floor(redemptionSecondsRemaining / 60)}:{String(redemptionSecondsRemaining % 60).padStart(2, "0")} Minuten</strong>
                    </div>
                    <p className="premium-code-security"><LockKeyhole aria-hidden="true" size={16} /> Der Code kann nur einmal verwendet werden.</p>
                    {redemptionStatus ? <p className="status-message" role="status">{redemptionStatus}</p> : null}
                  </article>
                ) : null}

                {redeemOffer && !activeRedemptionCode && !redemptionOutcome && redemptionSheetStep === "detail" ? (
                  <article className="premium-reward-detail">
                    <div className="premium-reward-detail-media"><RewardImage crop={rewardImageCropFromRecord(redeemOffer)} imageUrl={redeemOffer.image_url} title={redeemOffer.title} /></div>
                    <div className="premium-reward-detail-heading">
                      <StatusBadge tone={selectedRewardState === "available" ? "success" : selectedRewardState === "expired" ? "error" : "neutral"}>
                        {selectedRewardState ? rewardStatusText(redeemOffer, selectedRewardState) : "Details"}
                      </StatusBadge>
                      <h2>{redeemOffer.title}</h2>
                      {redeemOffer.description ? <p>{redeemOffer.description}</p> : null}
                    </div>
                    <dl className="premium-reward-facts">
                      <div><dt>Art</dt><dd>{redeemOffer.gift_type === "birthday" ? "Geburtstagsgeschenk" : redeemOffer.is_starter_reward ? "Willkommensgeschenk" : "Punkteeinlösung"}</dd></div>
                      <div><dt>{redeemOffer.is_starter_reward ? "Wert" : "Benötigt"}</dt><dd>{redeemOffer.is_starter_reward ? welcomeGiftDetail(redeemOffer) ?? "Für dich" : `${redeemOffer.required_points} Punkte`}</dd></div>
                      {redeemOffer.category || redeemOffer.product_group ? <div><dt>Kategorie</dt><dd>{redeemOffer.category ?? redeemOffer.product_group}</dd></div> : null}
                      {redeemOffer.valid_until || redeemOffer.expires_at ? <div><dt>Gültig bis</dt><dd>{new Date(redeemOffer.valid_until ?? redeemOffer.expires_at ?? "").toLocaleDateString("de-AT")}</dd></div> : null}
                    </dl>
                    {selectedRewardState === "locked" ? (
                      <div className="premium-reward-notice"><LockKeyhole aria-hidden="true" size={20} /><p>{rewardStatusText(redeemOffer, "locked")}</p></div>
                    ) : null}
                    {selectedRewardState === "redeeming" ? (
                      <div className="premium-reward-notice"><Clock3 aria-hidden="true" size={20} /><p>Für diese Einlösung ist bereits ein Code aktiv.</p></div>
                    ) : null}
                    {selectedRewardState === "expired" ? (
                      <div className="premium-reward-notice error"><Clock3 aria-hidden="true" size={20} /><p>Diese Belohnung ist abgelaufen.</p></div>
                    ) : null}
                    {selectedRewardState === "redeemed" ? (
                      <div className="premium-reward-notice success"><CheckCircle2 aria-hidden="true" size={20} /><p>Diese Belohnung wurde bereits eingelöst.</p></div>
                    ) : null}
                  </article>
                ) : null}

                {redeemOffer && !activeRedemptionCode && !redemptionOutcome && redemptionSheetStep === "confirm" ? (
                  <article className="premium-redemption-confirmation">
                    <span className="premium-confirm-icon"><LockKeyhole aria-hidden="true" size={26} /></span>
                    <StatusBadge tone="warning">Verbindliche Bestätigung</StatusBadge>
                    <h2>{redeemOffer.is_starter_reward ? "Geschenk wirklich einlösen?" : "Punkte wirklich einlösen?"}</h2>
                    <p><strong>Bitte erst direkt vor dem Mitarbeiter bestätigen.</strong></p>
                    <p>
                      {redeemOffer.is_starter_reward
                        ? "Nach deiner Bestätigung wird ein einmaliger Einlösecode erzeugt."
                        : `Nach deiner Bestätigung werden ${redeemOffer.required_points} Punkte reserviert und ein einmaliger Einlösecode erzeugt.`}
                    </p>
                    <div className="premium-confirm-summary">
                      <span>{redeemOffer.title}</span>
                      <strong>{redeemOffer.is_starter_reward ? "Geschenk" : `${redeemOffer.required_points} Punkte`}</strong>
                    </div>
                    {redemptionStatus ? <p className="status-message" role="alert">{redemptionStatus}</p> : null}
                  </article>
                ) : null}
              </div>
            </AppDrawer>

            <AppDrawer
              description={accountSheet === "logout" ? "Dein Bonuskonto bleibt erhalten." : undefined}
              dismissOnOverlay={accountSheet !== "profile"}
              footer={accountSheet === "logout" ? (
                <>
                  <SecondaryButton onClick={() => setAccountSheet(null)}>Abbrechen</SecondaryButton>
                  <PrimaryButton onClick={handleCustomerLogout}>Abmelden</PrimaryButton>
                </>
              ) : <PrimaryButton onClick={() => setAccountSheet(null)}>Schließen</PrimaryButton>}
              onClose={() => setAccountSheet(null)}
              open={Boolean(accountSheet)}
              size={accountSheet === "logout" ? "compact" : "standard"}
              title={accountSheet === "profile"
                ? "Persönliche Daten"
                : accountSheet === "membership"
                  ? "Deine Mitgliedschaft"
                  : accountSheet === "qr"
                    ? "Dein persönlicher Bonus-QR"
                    : accountSheet === "save"
                      ? "Bonuskonto speichern"
                      : accountSheet === "restaurant"
                        ? "Restaurantinformationen"
                        : accountSheet === "help"
                          ? "Hilfe & Kontakt"
                          : "Wirklich abmelden?"}
            >
              <div className="premium-account-sheet-content">
                {accountSheet === "profile" ? (
                  <div className="premium-account-profile-form">
                    <div className="premium-account-detail-list">
                      <div><span>Name</span><strong>{customer.name}</strong></div>
                      <div><span>Telefon</span><strong>{identitySummary?.phone_masked ?? "Nicht verfügbar"}</strong></div>
                      <div><span>Geburtstag</span><strong>{identitySummary?.birthday_masked ?? "Nicht hinterlegt"}</strong></div>
                      <div><span>Mitglieds-ID</span><strong>{customer.customer_code}</strong></div>
                    </div>
                    <section>
                      <div>
                        <h3>Identitätsdaten geschützt</h3>
                        <p>Telefonnummer oder Geburtsdatum ändern? Bitte wende dich direkt an das Restaurant.</p>
                      </div>
                    </section>
                  </div>
                ) : null}
                {accountSheet === "membership" ? (
                  <div className="premium-membership-detail">
                    <span className="premium-account-sheet-icon"><IdCard aria-hidden="true" size={28} /></span>
                    <h3>Bonus-Mitglied</h3>
                    <p>Deine Mitgliedschaft gilt für {restaurant.name}.</p>
                    <div className="premium-account-detail-list">
                      <div><span>Status</span><strong>{customer.membership_level || "Mitglied"}</strong></div>
                      <div><span>{settings.loyalty_mode === "stamp_based" ? "Stempel" : "Punkte"}</span><strong>{pointsValue}</strong></div>
                    </div>
                  </div>
                ) : null}
                {accountSheet === "qr" ? (
                  <div className="premium-account-qr">
                    <p>Mit diesem QR kommst du jederzeit zurück zu deinem Bonuskonto.</p>
                    <div className="premium-qr-frame"><QRCodeSVG value={portalUrl} size={196} level="M" /></div>
                    <StatusBadge><QrCode aria-hidden="true" size={15} /> {customer.customer_code}</StatusBadge>
                  </div>
                ) : null}
                {accountSheet === "save" ? (
                  <div className="premium-account-save">
                    <span className="premium-account-sheet-icon"><WalletCards aria-hidden="true" size={28} /></span>
                    <p>Speichere diese Seite für deinen nächsten Besuch.</p>
                    <SecondaryButton onClick={copyPortalLink}><Copy aria-hidden="true" size={18} /> Link kopieren</SecondaryButton>
                    <ul><li>iPhone: Teilen und „Zum Home-Bildschirm“ wählen.</li><li>Android: Browsermenü öffnen und „Zum Startbildschirm“ wählen.</li></ul>
                  </div>
                ) : null}
                {accountSheet === "restaurant" ? (
                  <div className="premium-restaurant-detail">
                    <span className="premium-account-sheet-logo">
                      {branding.logo_url
                        ? <img alt={`${restaurant.name} Logo`} src={branding.logo_url} />
                        : <span aria-hidden="true">{restaurant.name.trim().charAt(0).toUpperCase()}</span>}
                    </span>
                    <h3>{restaurant.name}</h3>
                    <StatusBadge tone="success">Bonusprogramm aktiv</StatusBadge>
                    <p>Du bist in diesem Restaurant als Bonus-Mitglied gespeichert.</p>
                  </div>
                ) : null}
                {accountSheet === "help" ? (
                  <div className="premium-account-help">
                    <span className="premium-account-sheet-icon"><CircleHelp aria-hidden="true" size={28} /></span>
                    <h3>Fragen zu deinem Bonus?</h3>
                    <p>Wende dich direkt an das Team von {restaurant.name}. Zeige dabei am besten deine Mitglieds-ID.</p>
                    <div className="premium-account-detail-list"><div><span>Mitglieds-ID</span><strong>{customer.customer_code}</strong></div></div>
                  </div>
                ) : null}
                {accountSheet === "logout" ? (
                  <div className="premium-account-logout">
                    <span className="premium-account-sheet-icon danger"><LogOut aria-hidden="true" size={28} /></span>
                    <h3>Bonuskonto abmelden?</h3>
                    <p>Der gespeicherte Zugang wird nur von diesem Gerät entfernt. Deine Punkte und Mitgliedschaft bleiben bestehen.</p>
                  </div>
                ) : null}
              </div>
            </AppDrawer>
          </>
        ) : null}

        {message && !(customer && isBonusCollection) ? <p className="status-message" role="alert">{message}</p> : null}
        <CustomerRestaurantScanner
          onCancel={cancelRestaurantScanner}
          onRestaurantDetected={handleRestaurantDetected}
          open={restaurantScannerOpen}
        />
      </PageContainer>
    </AppShell>
  );
}
