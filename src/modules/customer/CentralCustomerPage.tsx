import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  Gift,
  Info,
  Mail,
  MapPin,
  Route,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { partnerOpeningStatus } from "../../shared/openingHours.mjs";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { RestaurantLogoStage } from "../../shared/components/RestaurantLogoStage";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { useAuth } from "../auth/AuthProvider";
import {
  AppShell,
  CustomerLanguageAction,
  EmptyState,
  ErrorState,
  LoadingState,
  PremiumCard,
  PrimaryButton,
  StatusBadge,
} from "./components/PremiumCustomerUi";
import { CentralCustomerNavigation } from "./components/CentralCustomerNavigation";
import {
  loadCustomerAccount,
  openCustomerAccountMembership,
  pauseAllCustomerOfferEmails,
  type CustomerAccount,
  type CustomerAccountMembership,
} from "./customerAccountService";
import {
  customerActivationUiState,
  customerActivationSummary,
  customerInstallState,
  customerPushState,
  defaultCustomerActivationPreference,
  dismissCustomerActivation,
  readCustomerActivationPreference,
  resetCustomerActivationPreference,
  shouldAutoOpenCustomerActivation,
  shouldShowCustomerActivationBanner,
  snoozeCustomerActivation,
  writeCustomerActivationPreference,
  type CustomerActivationPreference,
  type CustomerInstallState,
  type CustomerPushState,
} from "./customerActivationSetup.mjs";
import { customerPushAvailable } from "./retentionService";
import "./central-customer.css";

export type CentralCustomerView = "home" | "locations" | "account";
type LocationFilter = "all" | "points" | "near_reward" | "offers" | "open";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const filters: Array<{ value: LocationFilter; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "points", label: "Mit Punkten" },
  { value: "near_reward", label: "Belohnung bald erreichbar" },
  { value: "offers", label: "Neues Angebot" },
  { value: "open", label: "Jetzt geöffnet" },
];

function locationAddress(membership: CustomerAccountMembership) {
  return [membership.address, `${membership.postal_code ?? ""} ${membership.city ?? ""}`.trim()].filter(Boolean).join(", ");
}

function routeUrl(membership: CustomerAccountMembership) {
  const query = locationAddress(membership) || membership.name;
  const params = new URLSearchParams({ api: "1", query });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function lastVisitLabel(value: string | null) {
  if (!value) return "Noch kein Besuch gespeichert";
  return `Zuletzt am ${new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))}`;
}

function membershipPriority(left: CustomerAccountMembership, right: CustomerAccountMembership) {
  const leftVisit = left.last_visit_at ? new Date(left.last_visit_at).getTime() : 0;
  const rightVisit = right.last_visit_at ? new Date(right.last_visit_at).getTime() : 0;
  if (leftVisit !== rightVisit) return rightVisit - leftVisit;
  const leftMissing = left.next_reward?.missing_points ?? Number.POSITIVE_INFINITY;
  const rightMissing = right.next_reward?.missing_points ?? Number.POSITIVE_INFINITY;
  if (leftMissing !== rightMissing) return leftMissing - rightMissing;
  if (left.new_offer_count !== right.new_offer_count) return right.new_offer_count - left.new_offer_count;
  return left.name.localeCompare(right.name, "de");
}

function currentInstallState(promptAvailable: boolean): CustomerInstallState {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const userAgent = navigator.userAgent.toLowerCase();
  const iosDevice = /iphone|ipad|ipod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const embeddedBrowser = /\b(?:fban|fbav|instagram)\b|; wv\)|\bwv\b/.test(userAgent);
  return customerInstallState({
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    iosStandalone: navigatorWithStandalone.standalone === true,
    promptAvailable,
    isIos: iosDevice,
    isEmbeddedBrowser: embeddedBrowser,
  });
}

function currentPushState(): CustomerPushState {
  const available = customerPushAvailable();
  return customerPushState({
    available,
    permission: available ? Notification.permission : "unsupported",
  });
}

function MembershipCard({ membership, onOpen }: { membership: CustomerAccountMembership; onOpen: () => void }) {
  const opening = partnerOpeningStatus(membership, new Date());
  const availableReward = membership.available_rewards[0];
  const missingPoints = membership.next_reward?.missing_points ?? 0;
  return (
    <PremiumCard className="central-location-card">
      <div className="central-location-heading">
        <RestaurantLogoStage className="central-location-logo" logoUrl={membership.logo_url} name={membership.name} size="header" />
        <div>
          <h2>{membership.name}</h2>
          <p><MapPin aria-hidden="true" size={15} /> {locationAddress(membership) || "Adresse nicht veröffentlicht"}</p>
        </div>
        <StatusBadge tone={opening.isOpen ? "success" : "neutral"}>{opening.isOpen ? "Geöffnet" : "Geschlossen"}</StatusBadge>
      </div>
      <div className="central-location-stats">
        <div><span>Deine Punkte</span><strong>{membership.points_balance}</strong></div>
        <div><span>Besuche</span><strong>{membership.visits_count}</strong></div>
        <div><span>Geschenke</span><strong>{membership.active_gifts}</strong></div>
        <div><span>Neue Angebote</span><strong>{membership.new_offer_count}</strong></div>
      </div>
      <p className="central-location-progress">
        {availableReward
          ? <><Gift aria-hidden="true" size={17} /> {availableReward.title} ist einlösbar</>
          : membership.next_reward
            ? <><Sparkles aria-hidden="true" size={17} /> Noch {missingPoints} Punkte bis {membership.next_reward.title}</>
            : "Die nächste Belohnung wird vom Restaurant festgelegt."}
      </p>
      <small>{lastVisitLabel(membership.last_visit_at)}</small>
      <div className="central-location-actions">
        <PrimaryButton onClick={onOpen}>Bonus öffnen <ArrowRight aria-hidden="true" size={18} /></PrimaryButton>
        <a className="premium-button premium-button-secondary" href={routeUrl(membership)} rel="noreferrer" target="_blank"><Route aria-hidden="true" size={18} /> Route starten</a>
      </div>
    </PremiumCard>
  );
}

export function CentralCustomerPage({ view }: { view: CentralCustomerView }) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { translateKey: t } = useI18n();
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LocationFilter>("all");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activationOpen, setActivationOpen] = useState(false);
  const [activationShowAll, setActivationShowAll] = useState(false);
  const [activationHelpOpen, setActivationHelpOpen] = useState(false);
  const [activationPreferenceOwnerId, setActivationPreferenceOwnerId] = useState<string | null>(null);
  const [activationPreference, setActivationPreference] = useState<CustomerActivationPreference>(() => defaultCustomerActivationPreference());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [nativePromptOutcome, setNativePromptOutcome] = useState<"accepted" | "declined" | null>(null);
  const [, setRuntimeRevision] = useState(0);
  const [pushRequesting, setPushRequesting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccount(await loadCustomerAccount());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Dein Gästeportal konnte gerade nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const userId = user?.id ?? null;
    setActivationPreference(readCustomerActivationPreference(window.localStorage, userId));
    setActivationPreferenceOwnerId(userId);
  }, [user?.id]);

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setNativePromptOutcome(null);
    }
    function refreshRuntimeState() {
      setRuntimeRevision((current) => current + 1);
    }
    function handleInstalled() {
      setInstallPrompt(null);
      setNativePromptOutcome(null);
      refreshRuntimeState();
    }
    const displayMode = window.matchMedia("(display-mode: standalone)");
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("focus", refreshRuntimeState);
    displayMode.addEventListener?.("change", refreshRuntimeState);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("focus", refreshRuntimeState);
      displayMode.removeEventListener?.("change", refreshRuntimeState);
    };
  }, []);

  const persistActivationPreference = useCallback((next: CustomerActivationPreference) => {
    const userId = user?.id ?? null;
    if (!writeCustomerActivationPreference(window.localStorage, userId, next)) return false;
    setActivationPreference(next);
    setActivationPreferenceOwnerId(userId);
    return true;
  }, [user?.id]);

  const activationPreferenceReady = Boolean(user?.id) && activationPreferenceOwnerId === user?.id;
  const installState = currentInstallState(Boolean(installPrompt));
  const pushState = currentPushState();
  const activationSummary = useMemo(() => customerActivationSummary({
    emailConfirmed: account?.profile.email_status === "CONFIRMED",
    installState,
    pushState,
  }), [account?.profile.email_status, installState, pushState]);
  const activationUiState = customerActivationUiState({
    preferenceReady: activationPreferenceReady,
    setupComplete: activationSummary.complete,
    installState,
    preference: activationPreference,
  });
  const showActivationBanner = shouldShowCustomerActivationBanner({
    preferenceReady: activationPreferenceReady,
    setupComplete: activationSummary.complete,
    installState,
    preference: activationPreference,
  });

  useEffect(() => {
    if (!shouldAutoOpenCustomerActivation({
      accountReady: Boolean(account) && activationPreferenceReady,
      preferenceReady: activationPreferenceReady,
      view,
      setupComplete: activationSummary.complete,
      installState,
      preference: activationPreference,
    })) return;
    setActivationShowAll(false);
    setActivationOpen(true);
  }, [account, activationPreference, activationPreferenceReady, activationSummary.complete, installState, view]);

  useEffect(() => {
    if (installState !== "installed") return;
    setActivationHelpOpen(false);
    setActivationOpen(false);
  }, [installState]);

  const sortedMemberships = useMemo(() => [...(account?.memberships ?? [])].sort(membershipPriority), [account]);
  const visibleMemberships = useMemo(() => sortedMemberships.filter((membership) => {
    if (filter === "points") return membership.points_balance > 0;
    if (filter === "near_reward") return Boolean(membership.available_rewards.length || (membership.next_reward && (membership.next_reward.missing_points ?? Number.POSITIVE_INFINITY) <= 20));
    if (filter === "offers") return membership.new_offer_count > 0;
    if (filter === "open") return partnerOpeningStatus(membership, new Date()).isOpen;
    return true;
  }), [filter, sortedMemberships]);

  async function openMembership(membership: CustomerAccountMembership) {
    if (openingId) return;
    setOpeningId(membership.restaurant_id);
    setStatusMessage(null);
    try {
      const slug = await openCustomerAccountMembership(membership);
      navigate(`/customer/${encodeURIComponent(slug)}`);
    } catch (nextError) {
      setStatusMessage(nextError instanceof Error ? nextError.message : "Das Bonuskonto konnte gerade nicht geöffnet werden.");
    } finally {
      setOpeningId(null);
    }
  }

  async function togglePause() {
    const hasActive = account?.memberships.some((membership) => membership.email_consent_status === "ACTIVE") ?? false;
    const hasPaused = account?.memberships.some((membership) => membership.email_consent_status === "PAUSED") ?? false;
    try {
      await pauseAllCustomerOfferEmails(hasActive && !hasPaused);
      await reload();
    } catch (nextError) {
      setStatusMessage(nextError instanceof Error ? nextError.message : "Die Einstellung konnte nicht gespeichert werden.");
    }
  }

  function snoozeActivation() {
    if (!persistActivationPreference(snoozeCustomerActivation(activationPreference))) return;
    setActivationHelpOpen(false);
    setActivationShowAll(false);
    setActivationOpen(false);
  }

  function dismissActivationPermanently() {
    if (!persistActivationPreference(dismissCustomerActivation(activationPreference))) return;
    setActivationHelpOpen(false);
    setActivationShowAll(false);
    setActivationOpen(false);
  }

  function openActivation(showAll: boolean) {
    setActivationHelpOpen(false);
    setActivationShowAll(showAll);
    setActivationOpen(true);
  }

  function reopenActivationFromSettings() {
    if (activationUiState === "dismissed") {
      if (!persistActivationPreference(resetCustomerActivationPreference())) return;
    }
    openActivation(true);
  }

  async function runInstallAction() {
    if (installState === "prompt_available" && installPrompt) {
      const currentPrompt = installPrompt;
      setInstallPrompt(null);
      setNativePromptOutcome(null);
      try {
        await currentPrompt.prompt();
        const choice = await currentPrompt.userChoice;
        setNativePromptOutcome(choice.outcome === "accepted" ? "accepted" : "declined");
      } catch {
        setNativePromptOutcome("declined");
      } finally {
        setRuntimeRevision((current) => current + 1);
      }
      return;
    }
    if (installState === "manual_ios" || installState === "manual_browser") {
      setNativePromptOutcome(null);
      setActivationHelpOpen(true);
    }
  }

  async function runActivationAction() {
    if (activationSummary.steps.install === "pending") {
      await runInstallAction();
      return;
    }
    if (pushState === "available") {
      setPushRequesting(true);
      try {
        await Notification.requestPermission();
      } finally {
        setPushRequesting(false);
        setRuntimeRevision((current) => current + 1);
      }
      return;
    }
    if (activationSummary.steps.email === "pending") setActivationHelpOpen(true);
  }

  const activationStatus = (state: "complete" | "pending" | "not_applicable", unavailableKey: string) => {
    if (state === "complete") return { label: t("customer.activation.complete"), tone: "success" as const };
    if (state === "pending") return { label: t("customer.activation.pending"), tone: "warning" as const };
    return { label: t(unavailableKey), tone: "neutral" as const };
  };
  const emailActivationStatus = activationStatus(activationSummary.steps.email, "customer.activation.emailUnavailable");
  const installActivationStatus = activationStatus(activationSummary.steps.install, "customer.activation.installUnavailable");
  const pushActivationStatus = pushState === "denied"
    ? { label: t("customer.activation.pushDenied"), tone: "error" as const }
    : activationStatus(activationSummary.steps.push, "customer.activation.pushUnavailable");
  const activationCountLabel = t(activationSummary.incompleteCount === 1
    ? "customer.activation.reminderOne"
    : "customer.activation.reminder").replace("{count}", String(activationSummary.incompleteCount));
  const activationDescription = t(activationSummary.incompleteCount === 1
    ? "customer.activation.descriptionOne"
    : "customer.activation.description").replace("{count}", String(activationSummary.incompleteCount));
  const installActionable = activationSummary.steps.install === "pending"
    && ["prompt_available", "manual_ios", "manual_browser"].includes(installState);
  const installActionLabel = installState === "prompt_available"
    ? t("customer.activation.installApp")
    : t("customer.activation.showInstructions");
  const primaryActionLabel = activationSummary.steps.install === "pending"
    ? installActionLabel
    : t("customer.activation.setupNow");

  const emptyAccess = !loading && !error && !account;
  const heading = view === "locations" ? "Meine Lokale" : view === "account" ? "Konto" : "Meine Vorteile";

  return (
    <AppShell>
      <div className="central-customer-page">
        <header className="central-customer-header">
          <div><span>Dein Gästeportal</span><h1>{heading}</h1><p>{view === "home" ? "Schön, dass du wieder da bist." : view === "locations" ? "Alle deine Bonusprogramme, sauber nach Lokal getrennt." : "Deine Daten und Einstellungen an einem Ort."}</p></div>
          <div className="central-customer-header-actions">
            <CustomerLanguageAction />
            <Link aria-label="Lokale entdecken" className="premium-button premium-button-secondary central-discover-action" to="/customer/restaurants"><Store aria-hidden="true" size={18} /><span>Lokale entdecken</span></Link>
          </div>
        </header>

        {loading ? <LoadingState description="Dein Gästeportal wird geladen." /> : null}
        {error ? <ErrorState action={<button className="premium-button premium-button-secondary" onClick={() => void reload()} type="button">Erneut versuchen</button>} description={error} title="Deine Vorteile konnten nicht geladen werden" /> : null}
        {emptyAccess ? (
          <EmptyState
            action={<Link className="premium-button premium-button-primary" to="/customer/restaurants">Lokale entdecken</Link>}
            description="Scanne den QR-Code im Restaurant, um dein Bonusprogramm zu öffnen. Nach dem ersten Beitritt erscheint das Lokal dauerhaft hier auf diesem Gerät."
            title="Noch kein Bonuskonto verbunden"
          />
        ) : null}

        {!loading && !error && account && view === "home" ? (
          <div className="central-customer-stack">
            <PremiumCard className="central-welcome-card" variant="highlight">
              <div><span>Willkommen zurück</span><h2>{account.profile.first_name}</h2><p>Deine Punkte bei {account.memberships.length} {account.memberships.length === 1 ? "Lokal" : "Lokalen"}</p></div>
              <div className="central-welcome-number"><strong>{account.memberships.length}</strong><span>Mitgliedschaften</span></div>
            </PremiumCard>
            {showActivationBanner ? (
              <button className="central-activation-reminder" onClick={() => openActivation(false)} type="button">
                <BellRing aria-hidden="true" size={18} />
                <span>{activationCountLabel}</span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            ) : null}
            <section className="central-section">
              <header><div><span>Zuletzt besucht</span><h2>Deine Lokale</h2></div><Link to="/customer/locations">Alle ansehen <ChevronRight aria-hidden="true" size={18} /></Link></header>
              <div className="central-location-grid">{sortedMemberships.slice(0, 3).map((membership) => <MembershipCard key={membership.restaurant_id} membership={membership} onOpen={() => void openMembership(membership)} />)}</div>
            </section>
          </div>
        ) : null}

        {!loading && !error && account && view === "locations" ? (
          <div className="central-customer-stack">
            <div aria-label="Meine Lokale filtern" className="central-location-filters" role="group">
              {filters.map((item) => <button aria-pressed={filter === item.value} className={filter === item.value ? "active" : ""} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}
            </div>
            {statusMessage ? <p aria-live="polite" className="central-status-message">{statusMessage}</p> : null}
            {visibleMemberships.length ? <div className="central-location-grid">{visibleMemberships.map((membership) => <MembershipCard key={membership.restaurant_id} membership={membership} onOpen={() => void openMembership(membership)} />)}</div> : <EmptyState description="Für diesen Filter gibt es derzeit kein Lokal." title="Keine passenden Lokale" />}
          </div>
        ) : null}

        {!loading && !error && account && view === "account" ? (
          <div className="central-account-grid">
            <PremiumCard className="central-profile-card">
              <span className="central-profile-avatar" aria-hidden="true">{account.profile.first_name.trim().charAt(0).toUpperCase()}</span>
              <div><span>Dein Profil</span><h2>{account.profile.first_name}</h2><p>{account.profile.phone_masked ?? "Telefonnummer nicht verfügbar"}</p><p>{account.profile.birthday_masked ?? "Geburtstag nicht hinterlegt"}</p></div>
              <UserRound aria-hidden="true" size={24} />
            </PremiumCard>
            <PremiumCard className="central-email-card">
              <div className="central-icon-heading"><Mail aria-hidden="true" size={21} /><div><span>Freiwillig</span><h2>Angebots-E-Mails</h2></div></div>
              <p>Wöchentliche oder monatliche Zusammenfassungen werden immer separat je Lokal bestätigt. Dein Bonuskonto funktioniert vollständig ohne E-Mail.</p>
              <div className="central-email-status"><span>E-Mail-Adresse</span><strong>{account.profile.email ?? "Nicht angegeben"}</strong><small>{account.profile.email_status === "CONFIRMED" ? "Bestätigt" : account.profile.email_status === "PENDING_CONFIRMATION" ? "Bestätigung ausstehend" : "Nicht angegeben"}</small></div>
              {!account.email_delivery.available ? <p className="central-email-unavailable"><ShieldCheck aria-hidden="true" size={17} /> Der Angebotsversand ist noch nicht freigeschaltet. Es wird keine Einwilligung vorausgewählt und keine Marketing-E-Mail versendet.</p> : null}
              {account.memberships.map((membership) => (
                <label className="central-email-preference" key={membership.restaurant_id}>
                  <span><strong>{membership.name}</strong><small>{membership.email_consent_status === "ACTIVE" ? "Bestätigt" : membership.email_consent_status === "PENDING_CONFIRMATION" ? "Bestätigung ausstehend" : "Keine Einwilligung"}</small></span>
                  <select aria-label={`Angebots-E-Mails von ${membership.name}`} disabled value={membership.email_preference}>
                    <option value="NEVER">Nie</option><option value="WEEKLY">Wöchentlich</option><option value="MONTHLY">Monatlich</option>
                  </select>
                </label>
              ))}
              {account.memberships.some((membership) => ["ACTIVE", "PAUSED"].includes(membership.email_consent_status)) ? <button className="premium-button premium-button-secondary" onClick={() => void togglePause()} type="button">Alle Angebots-E-Mails pausieren</button> : null}
              {statusMessage ? <p aria-live="polite" className="central-status-message">{statusMessage}</p> : null}
            </PremiumCard>
            <section aria-label="Konto und Datenschutz" className="central-account-list">
              <button onClick={reopenActivationFromSettings} type="button"><Smartphone aria-hidden="true" size={20} /><span><strong>{t(activationUiState === "dismissed" ? "customer.activation.restoreInstallNotice" : "customer.activation.settings")}</strong><small>{activationSummary.complete ? t("customer.activation.allComplete") : activationCountLabel}</small></span><ChevronRight aria-hidden="true" size={19} /></button>
              <a href="mailto:support@wuxugroup.com?subject=Datenexport%20Mein%20WUXUAI"><CalendarDays aria-hidden="true" size={20} /><span><strong>Datenexport anfragen</strong><small>Über den WUXUAI Support</small></span><ChevronRight aria-hidden="true" size={19} /></a>
              <a href="mailto:support@wuxugroup.com?subject=Konto%20loeschen%20Mein%20WUXUAI"><ShieldCheck aria-hidden="true" size={20} /><span><strong>Konto löschen lassen</strong><small>Memberships und Punkte werden nicht still gelöscht</small></span><ChevronRight aria-hidden="true" size={19} /></a>
              <Link to="/customer/locations"><Store aria-hidden="true" size={20} /><span><strong>Teilnahmebedingungen</strong><small>Je Lokal im Bonuskonto erreichbar</small></span><ChevronRight aria-hidden="true" size={19} /></Link>
              <a href="mailto:support@wuxugroup.com"><UserRound aria-hidden="true" size={20} /><span><strong>Support kontaktieren</strong><small>Telefonnummer und Geburtstag sicher ändern</small></span><ChevronRight aria-hidden="true" size={19} /></a>
              <button onClick={() => void signOut().finally(() => navigate("/customer/login", { replace: true }))} type="button"><UserRound aria-hidden="true" size={20} /><span><strong>Abmelden</strong><small>Kundensitzung auf diesem Gerät beenden</small></span><ChevronRight aria-hidden="true" size={19} /></button>
            </section>
          </div>
        ) : null}
      </div>
      <CentralCustomerNavigation />
      <AppDrawer
        className="central-activation-drawer"
        description={activationSummary.complete
          ? t("customer.activation.allComplete")
          : activationDescription}
        footer={(
          <>
            {!activationSummary.complete ? <PrimaryButton data-drawer-autofocus disabled={pushRequesting} onClick={() => void runActivationAction()} type="button">{pushRequesting ? t("customer.activation.pleaseWait") : primaryActionLabel}</PrimaryButton> : null}
            <button className="premium-button premium-button-secondary" onClick={snoozeActivation} type="button">{t("customer.activation.remindLater")}</button>
            <button className="premium-button central-activation-dismiss" onClick={dismissActivationPermanently} type="button">{t("customer.activation.dismiss")}</button>
          </>
        )}
        onClose={snoozeActivation}
        open={activationOpen}
        size="compact"
        title={t("customer.activation.title")}
      >
        <div className="central-activation-content">
          <div className="central-activation-steps">
            {activationShowAll || activationSummary.steps.email === "pending" ? <div className="central-activation-step">
              <Mail aria-hidden="true" size={20} />
              <span><strong>{t("customer.activation.email")}</strong><small>{account?.profile.email_status === "CONFIRMED" ? t("customer.activation.emailConfirmed") : t("customer.activation.emailPending")}</small></span>
              <StatusBadge tone={emailActivationStatus.tone}>{emailActivationStatus.label}</StatusBadge>
            </div> : null}
            {activationShowAll || activationSummary.steps.install === "pending" ? installActionable ? (
              <button className="central-activation-step central-activation-step-action" onClick={() => void runInstallAction()} type="button">
                <Download aria-hidden="true" size={20} />
                <span><strong>{t("customer.activation.install")}</strong><small>{installState === "prompt_available" ? t("customer.activation.installReady") : t("customer.activation.installManual")}</small><span className="central-activation-task-action">{installActionLabel}</span></span>
                <StatusBadge tone={installActivationStatus.tone}>{installActivationStatus.label}</StatusBadge>
              </button>
            ) : (
              <div className="central-activation-step">
                <Download aria-hidden="true" size={20} />
                <span><strong>{t("customer.activation.install")}</strong><small>{installState === "installed" ? t("customer.activation.installInstalled") : t("customer.activation.installUnavailable")}</small></span>
                <StatusBadge tone={installActivationStatus.tone}>{installActivationStatus.label}</StatusBadge>
              </div>
            ) : null}
            {pushState !== "unavailable" && (activationShowAll || activationSummary.steps.push === "pending") ? (
              <div className="central-activation-step">
                <BellRing aria-hidden="true" size={20} />
                <span><strong>{t("customer.activation.push")}</strong><small>{pushState === "granted" ? t("customer.activation.pushGranted") : pushState === "denied" ? t("customer.activation.pushDeniedHelp") : t("customer.activation.pushReady")}</small></span>
                <StatusBadge tone={pushActivationStatus.tone}>{pushActivationStatus.label}</StatusBadge>
              </div>
            ) : null}
          </div>
          {activationHelpOpen ? (
            <div className="central-activation-help" role="status">
              <Info aria-hidden="true" size={19} />
              {(installState === "manual_ios" || installState === "manual_browser") ? (
                <div><strong>{t("customer.activation.instructionsTitle")}</strong><ol>{installState === "manual_ios" ? <><li>{t("customer.activation.installStepMenu")}</li><li>{t("customer.activation.installStepHome")}</li><li>{t("customer.activation.installStepConfirm")}</li></> : <><li>{t("customer.activation.browserInstallStepMenu")}</li><li>{t("customer.activation.browserInstallStepInstall")}</li><li>{t("customer.activation.browserInstallStepConfirm")}</li></>}</ol></div>
              ) : <p>{t("customer.activation.emailHelp")}</p>}
            </div>
          ) : null}
          {nativePromptOutcome ? <p aria-live="polite" className={`central-activation-install-outcome ${nativePromptOutcome}`}>{t(nativePromptOutcome === "accepted" ? "customer.activation.installAccepted" : "customer.activation.installDismissed")}</p> : null}
          {activationSummary.complete ? <p className="central-activation-complete"><CheckCircle2 aria-hidden="true" size={19} /> {t("customer.activation.completeMessage")}</p> : null}
        </div>
      </AppDrawer>
    </AppShell>
  );
}
