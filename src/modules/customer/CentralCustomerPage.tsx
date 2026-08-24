import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Gift,
  Mail,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { partnerOpeningStatus } from "../../shared/openingHours.mjs";
import { useAuth } from "../auth/AuthProvider";
import {
  AppShell,
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
import "./central-customer.css";

export type CentralCustomerView = "home" | "locations" | "account";
type LocationFilter = "all" | "points" | "near_reward" | "offers" | "open";

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

function MembershipCard({ membership, onOpen }: { membership: CustomerAccountMembership; onOpen: () => void }) {
  const opening = partnerOpeningStatus(membership, new Date());
  const availableReward = membership.available_rewards[0];
  const missingPoints = membership.next_reward?.missing_points ?? 0;
  return (
    <PremiumCard className="central-location-card">
      <div className="central-location-heading">
        <span className="central-location-logo">
          {membership.logo_url ? <img alt={`${membership.name} Logo`} src={membership.logo_url} /> : <Store aria-hidden="true" size={24} />}
        </span>
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
  const { signOut } = useAuth();
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LocationFilter>("all");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccount(await loadCustomerAccount());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Dein Kundenbereich konnte gerade nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

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

  const emptyAccess = !loading && !error && !account;
  const heading = view === "locations" ? "Meine Lokale" : view === "account" ? "Konto" : "Meine Vorteile";

  return (
    <AppShell>
      <div className="central-customer-page">
        <header className="central-customer-header">
          <div><span>Dein Kundenbereich</span><h1>{heading}</h1><p>{view === "home" ? "Schön, dass du wieder da bist." : view === "locations" ? "Alle deine Bonusprogramme, sauber nach Lokal getrennt." : "Deine Daten und Einstellungen an einem Ort."}</p></div>
          <Link className="premium-button premium-button-secondary" to="/customer/restaurants"><Store aria-hidden="true" size={18} /> Lokale entdecken</Link>
        </header>

        {loading ? <LoadingState description="Dein Kundenbereich wird geladen." /> : null}
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
    </AppShell>
  );
}
