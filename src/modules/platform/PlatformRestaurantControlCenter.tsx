import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Network,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import type {
  PaymentStatus,
  PlatformMetric,
  PlatformRestaurant,
  PlatformRestaurantControlCenter,
  SubscriptionStatus,
} from "./platformAdminService";
import {
  formatPlatformMetric,
  getHealthPresentation,
  getOverallHealthPresentation,
  getReferralDurationPresentation,
  getRestaurantStatusLabel,
  getSetupLabel,
} from "./platformControlCenterView.mjs";
import { buildStaffLoginPath } from "../auth/staffLoginFlow.mjs";
import { PlatformOperationsPanel } from "./PlatformOperationsPanel";

type UpdatePayload = {
  subscriptionStatus?: SubscriptionStatus | null;
  paymentStatus?: PaymentStatus | null;
  trialExtensionDays?: number | null;
  reason?: string | null;
};

type PendingAction = {
  actionLabel: string;
  description: string;
  impact: string;
  payload: UpdatePayload;
  title: string;
};

type PlatformRestaurantControlCenterProps = {
  canWrite: boolean;
  data: PlatformRestaurantControlCenter | null;
  error: string;
  loading: boolean;
  onAction: (actionLabel: string, payload: UpdatePayload) => Promise<void>;
  onRetry: () => void;
  restaurant: PlatformRestaurant;
  saving: boolean;
};

const subscriptionLabels: Record<SubscriptionStatus, string> = {
  trialing: "Testphase",
  active: "Aktiv",
  past_due: "Überfällig",
  unpaid: "Unbezahlt",
  cancelled: "Gekündigt",
  paused: "Pausiert",
};

const paymentLabels: Record<PaymentStatus, string> = {
  not_required: "Nicht erforderlich",
  pending: "Offen",
  paid: "Bezahlt",
  failed: "Fehlgeschlagen",
  manual: "Manuell geführt",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function metricBoolean(metric: PlatformMetric<boolean>) {
  return formatPlatformMetric(metric, (value) => value ? "Ja" : "Nein");
}

function HealthBadge({ status }: { status: "healthy" | "warning" | "error" | "unavailable" }) {
  const health = getHealthPresentation(status);
  return <span className={`platform-health-badge ${health.tone}`}>{health.label}</span>;
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return <article><strong>{value}</strong><span>{label}</span></article>;
}

export function PlatformControlCenterSkeleton() {
  return (
    <section aria-label="Restaurantdaten werden geladen" className="platform-control-center platform-control-skeleton">
      <span />
      <span />
      <div className="platform-control-skeleton-grid"><span /><span /><span /><span /></div>
    </section>
  );
}

export function PlatformRestaurantControlCenter({
  canWrite,
  data,
  error,
  loading,
  onAction,
  onRetry,
  restaurant,
  saving,
}: PlatformRestaurantControlCenterProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    setPendingAction(null);
  }, [data?.account.restaurant_id, restaurant.id]);

  if (loading) return <PlatformControlCenterSkeleton />;

  if (error || !data) {
    return (
      <section className="platform-control-error" role="alert">
        <AlertTriangle aria-hidden="true" size={28} />
        <div>
          <h2>Restaurantdaten konnten nicht geladen werden.</h2>
          <p>Die vorhandenen Werte werden nicht als Null dargestellt.</p>
        </div>
        <button className="button secondary" onClick={onRetry} type="button"><RefreshCw size={18} />Erneut versuchen</button>
      </section>
    );
  }

  const { account, subscription, usage, redemption, referral, health, audit, capabilities } = data;
  const overallHealth = getOverallHealthPresentation(data.overall_health);
  const subscriptionValue = subscription.status === "available" ? subscription.value : null;
  const currentRestaurantStatus = getRestaurantStatusLabel(account.restaurant_status);
  const currentSubscriptionStatus = subscriptionValue?.subscription_status
    ? subscriptionLabels[subscriptionValue.subscription_status]
    : "–";
  const portalOrigin = window.location.origin;
  const internalTest = account.internal_test.status === "available" && account.internal_test.value;

  async function confirmAction() {
    if (!pendingAction) return;
    const action = pendingAction;
    try {
      await onAction(action.actionLabel, action.payload);
      setPendingAction(null);
    } catch {
      // The page-level alert retains the safe error message and the drawer stays open.
    }
  }

  return (
    <section className="platform-control-center">
      <header className="platform-control-header">
        <div>
          <span className="admin-brand-kicker">Restaurant Control Center</span>
          <h2>{account.restaurant_name}</h2>
          <p>{account.owner.name ?? "Betreiber nicht benannt"} · {account.owner.business_email ?? "Geschäftliche E-Mail nicht verfügbar"}</p>
        </div>
        <div className="platform-control-badges" aria-label="Restaurantstatus">
          <span className={`platform-health-badge ${account.restaurant_status === "active" ? "success" : account.restaurant_status === "suspended" ? "danger" : "neutral"}`}>{currentRestaurantStatus}</span>
          <span className="platform-health-badge neutral">{currentSubscriptionStatus}</span>
          <span className={`platform-health-badge ${account.setup_completed ? "success" : "warning"}`}>{getSetupLabel(account.setup_completed)}</span>
          {internalTest ? <span className="platform-health-badge test">Interner Test-Tenant</span> : null}
        </div>
      </header>

      <div className={`platform-overall-health ${overallHealth.tone}`}>
        <ShieldCheck aria-hidden="true" size={21} />
        <span>Systemzustand</span>
        <strong>{overallHealth.label}</strong>
      </div>

      <section className="platform-control-section">
        <div className="section-heading"><h3>Nutzung</h3><p className="muted">Aktuelle restaurantbezogene Kennzahlen.</p></div>
        <div className="platform-metric-grid" aria-label="Nutzungskennzahlen">
          <MetricCard label="Gäste gesamt" value={formatPlatformMetric(usage.customers_total)} />
          <MetricCard label="Neue Gäste · 30 Tage" value={formatPlatformMetric(usage.customers_new_30d)} />
          <MetricCard label="Punkte heute" value={formatPlatformMetric(usage.points_today)} />
          <MetricCard label="Punkte · 30 Tage" value={formatPlatformMetric(usage.points_30d)} />
          <MetricCard label="Einlösungen heute" value={formatPlatformMetric(redemption.redemptions_today)} />
          <MetricCard label="Einlösungen · 30 Tage" value={formatPlatformMetric(redemption.redemptions_30d)} />
          <MetricCard label="Letzte Aktivität" value={formatDateTime(account.last_activity_at)} />
        </div>
      </section>

      <div className="platform-control-columns">
        <section className="platform-control-section">
          <div className="section-heading"><h3>Konto & Vertrag</h3><p className="muted">Restaurant-Testphase und Plattformzugang sind getrennte Sachverhalte.</p></div>
          <dl className="platform-detail-list">
            <DetailRow label="Restaurantstatus" value={currentRestaurantStatus} />
            <DetailRow label="SaaS-Status" value={currentSubscriptionStatus} />
            <DetailRow label="Testphase" value={subscriptionValue?.subscription_status === "trialing" ? "Aktiv" : "–"} />
            <DetailRow label="Testphase Start" value={formatDate(subscriptionValue?.trial_started_at)} />
            <DetailRow label="Testphase Ende" value={formatDate(subscriptionValue?.trial_ends_at)} />
            <DetailRow label="Verbleibende Tage" value={subscriptionValue?.trial_days_remaining ?? "–"} />
            <DetailRow label="Setup abgeschlossen" value={account.setup_completed ? "Ja" : "Nein"} />
            <DetailRow label="Erstellt am" value={formatDate(account.created_at)} />
            <DetailRow label="Letzte Aktivität" value={formatDateTime(account.last_activity_at)} />
          </dl>
        </section>

        <section className="platform-control-section">
          <div className="section-heading"><h3>Abrechnung</h3><p className="muted">Stripe ist in V1 noch nicht aktiviert.</p></div>
          <dl className="platform-detail-list">
            <DetailRow label="Zahlungsanbieter" value="Noch nicht verbunden" />
            <DetailRow label="Stripe" value="Noch nicht aktiviert" />
            <DetailRow label="Aktueller Zahlungsstatus" value={subscriptionValue?.payment_status ? paymentLabels[subscriptionValue.payment_status] : "–"} />
            <DetailRow label="Tarif" value={subscriptionValue?.plan_key ?? "–"} />
          </dl>
          <button className="button secondary" disabled title={capabilities.manual_payment.reason} type="button">Manuelle Zahlung · Noch nicht verfügbar</button>
        </section>
      </div>

      <div className="platform-control-columns">
        <section className="platform-control-section">
          <div className="platform-section-title"><div><h3>Freunde einladen & 2× Bonus</h3><p className="muted">Aktueller V1-Vertrag: Einladender 100 %, Freund 50 %, maximal 2×.</p></div><HealthBadge status={referral.health} /></div>
          {referral.status === "available" ? (
            <dl className="platform-detail-list">
              <DetailRow label="Empfehlungsprogramm" value={referral.enabled ? "Aktiv" : "Inaktiv"} />
              <DetailRow label="Konfigurierte Dauer" value={getReferralDurationPresentation(referral.configured_duration_days, referral.duration_type)} />
              <DetailRow label="Einladungen pro Kunde / Monat" value={referral.monthly_invite_limit} />
              <DetailRow label="Qualifiziert · 30 Tage" value={referral.qualified_referrals_30d} />
              <DetailRow label="Aktive 2× Booster" value={referral.active_boosters} />
              <DetailRow label="Zusätzliche Booster-Punkte · 30 Tage" value={referral.boost_extra_points_30d} />
              <DetailRow label="Letzte Qualifizierung" value={formatDateTime(referral.last_qualified_referral_at)} />
            </dl>
          ) : <><dl className="platform-detail-list"><DetailRow label="Einladungen pro Kunde / Monat" value="–" /></dl><p className="platform-contract-note" title="Keine Daten verfügbar">Keine Daten verfügbar</p></>}
        </section>

        <section className="platform-control-section">
          <div className="platform-section-title"><div><h3>Einlösungen</h3><p className="muted">V1 nutzt das 15-minütige Präsentationsfenster.</p></div><HealthBadge status={redemption.health} /></div>
          <div className="platform-metric-grid compact">
            <MetricCard label="Heute" value={formatPlatformMetric(redemption.redemptions_today)} />
            <MetricCard label="Letzte 30 Tage" value={formatPlatformMetric(redemption.redemptions_30d)} />
            <MetricCard label="Letzte Einlösung" value={formatPlatformMetric(redemption.last_redemption_at, formatDateTime)} />
          </div>
          <dl className="platform-detail-list">
            <DetailRow label="Punkte-Belohnungen · 30 Tage" value={redemption.breakdown_30d.points} />
            <DetailRow label="Willkommensgeschenke · 30 Tage" value={redemption.breakdown_30d.welcome} />
            <DetailRow label="Geburtstagsgeschenke · 30 Tage" value={redemption.breakdown_30d.birthday} />
            <DetailRow label="Fehler · 24 Stunden" value={redemption.failures_24h} />
          </dl>
        </section>
      </div>

      <section className="platform-control-section">
        <div className="section-heading"><h3>Systemgesundheit</h3><p className="muted">Nur verfügbare serverseitige Telemetrie wird bewertet.</p></div>
        <div className="platform-health-grid">
          <article><div><Users size={20} /><h4>Kundenregistrierung</h4></div><HealthBadge status={health.registration.status} /><span>Letzter Erfolg: {formatDateTime(health.registration.last_success)}</span><span>Fehler · 24 h: {health.registration.failures_24h}</span></article>
          <article><div><Mail size={20} /><h4>E-Mail</h4></div><HealthBadge status={health.email.status} /><span>Letzter Erfolg: {formatDateTime(health.email.last_success)}</span><span>Fehler · 24 h: {health.email.failed_24h}</span></article>
          <article><div><MapPin size={20} /><h4>Standort & Karte</h4></div><HealthBadge status={health.geolocation.status} /><span>Adresse vollständig: {health.geolocation.address_complete === null ? "–" : health.geolocation.address_complete ? "Ja" : "Nein"}</span><span>Koordinaten vorhanden: {health.geolocation.coordinates_present === null ? "–" : health.geolocation.coordinates_present ? "Ja" : "Nein"}</span><span>Öffentliche Suche: {health.geolocation.public_search_eligible === null ? "–" : health.geolocation.public_search_eligible ? "Ja" : "Nein"}</span></article>
          <article><div><QrCode size={20} /><h4>Mitarbeiter</h4></div><HealthBadge status={health.staff.status} /><span>Mitarbeiter: {formatPlatformMetric(health.staff.staff_count)}</span><span>Kunden-QR-Scan: {metricBoolean(health.staff.qr_flow_available)}</span><span>Tages-PIN verfügbar: {metricBoolean(health.staff.daily_pin_available)}</span></article>
          <article><div><Clock size={20} /><h4>Cron / Automatisierungen</h4></div><HealthBadge status={health.cron.status} /><span>Keine Telemetrie verfügbar</span></article>
        </div>
      </section>

      <section className="platform-control-section">
        <div className="section-heading"><h3>Portale & QR</h3><p className="muted">Links öffnen reguläre geschützte Flows. Es findet keine Identitätsübernahme statt.</p></div>
        <div className="platform-link-grid" aria-label="Restaurant Links">
          <a className="button secondary" href={`${portalOrigin}/admin`} rel="noreferrer" target="_blank"><ExternalLink size={18} />Restaurant Portal · Anmeldung erforderlich</a>
          <a className="button secondary" href={`${portalOrigin}/customer/${restaurant.slug}`} rel="noreferrer" target="_blank"><ExternalLink size={18} />Gäste-QR-Link öffnen</a>
          <a className="button secondary" href={`${portalOrigin}${buildStaffLoginPath(restaurant.slug)}`} rel="noreferrer" target="_blank"><ExternalLink size={18} />Mitarbeiterbereich · Anmeldung erforderlich</a>
          <a className="button secondary" href={`${portalOrigin}/admin/qr`} rel="noreferrer" target="_blank"><ExternalLink size={18} />QR Center · Anmeldung erforderlich</a>
        </div>
        <div className="platform-qr-contract"><span><CheckCircle2 size={17} />Neuer Gäste-QR aktiv</span><span><CheckCircle2 size={17} />Mitarbeiter-QR aktiv</span><span><AlertTriangle size={17} />Kassa-Aufsteller in V1 nicht aktiv</span></div>
      </section>

      <div className="platform-control-columns">
        <section className="platform-control-section">
          <div className="section-heading"><h3>Vertrag verwalten</h3><p className="muted">Restaurantbetrieb und Veröffentlichung werden getrennt im Bereich Support & Verwaltung gesteuert.</p></div>
          {canWrite ? <div className="platform-actions"><button className="button secondary" disabled={saving} onClick={() => setPendingAction({ title: "Abo aktivieren?", actionLabel: "Abo aktiviert", description: "Der SaaS-Vertragsstatus wird auf Aktiv gesetzt.", impact: "Es wird keine Stripe-Zahlung ausgelöst und kein Zahlungsstatus gesetzt.", payload: { subscriptionStatus: "active", reason: "Abo im WUXUAI Admin aktiviert" }})} type="button">Abo aktivieren</button><button className="button secondary" disabled={saving} onClick={() => setPendingAction({ title: "Abo pausieren?", actionLabel: "Abo pausiert", description: "Der SaaS-Vertragsstatus wird pausiert.", impact: "Restaurantdaten und Betriebsstatus bleiben erhalten.", payload: { subscriptionStatus: "paused", reason: "Abo im WUXUAI Admin pausiert" }})} type="button">Abo pausieren</button><button className="button secondary" disabled={saving || subscription.status !== "available"} onClick={() => setPendingAction({ title: "Testphase verlängern?", actionLabel: "Testphase verlängert", description: `Aktuelles Ende: ${formatDate(subscriptionValue?.trial_ends_at)}. Verlängerung: 14 Tage.`, impact: "Die bestehende Testphase wird über den freigegebenen Vertrag verlängert.", payload: { trialExtensionDays: 14, reason: "Testphase manuell um 14 Tage verlängert" }})} type="button">Testphase um 14 Tage verlängern</button></div> : <p className="muted">Nur Ansicht. Deine Plattformrolle darf keine Änderungen speichern.</p>}
        </section>

        <section className="platform-control-section">
          <div className="section-heading"><h3>Bonusnetzwerk</h3><p className="muted">V2 · noch nicht aktiviert</p></div>
          <div className="platform-network-state"><Network size={24} /><strong>Nicht verbunden</strong><p>Standorte können später nach Zustimmung der beteiligten Betreiber zu einem gemeinsamen Bonusnetzwerk verbunden werden.</p><button className="button secondary" disabled type="button">In V1 nicht verfügbar</button></div>
        </section>
      </div>

      <section className="platform-control-section">
        <div className="platform-section-title"><div><h3>Letzte Aktivitäten</h3><p className="muted">Unveränderbarer, bereinigter Audit-Auszug.</p></div><Activity size={21} /></div>
        {audit.length ? <div className="platform-audit-list">{audit.map((entry) => <article key={entry.id}><strong>{entry.event_label}</strong><span>{formatDateTime(entry.timestamp)}</span><small>{entry.actor_label} · {entry.status === "success" ? "Erfolgreich" : entry.status === "blocked" ? "Blockiert" : "Fehlgeschlagen"}</small></article>)}</div> : <p className="muted">Noch keine Aktivitäten verfügbar.</p>}
      </section>

      <details className="platform-technical-details">
        <summary>Technische Details</summary>
        <dl className="platform-detail-list">
          <DetailRow label="Restaurant-ID" value={account.restaurant_id} />
          <DetailRow label="Betreiber-Zuordnung" value={account.owner.user_id ? "Vorhanden" : "Nicht verfügbar"} />
          <DetailRow label="Setup-Status" value={account.onboarding_status ?? "–"} />
          <DetailRow label="Letzte Aktivität" value={formatDateTime(account.last_activity_at)} />
          <DetailRow label="Backend-Vertrag" value={data.contract_version} />
          <DetailRow label="Stand erzeugt" value={formatDateTime(data.generated_at)} />
          <DetailRow label="Zeitzone" value={data.timezone} />
        </dl>
      </details>

      <PlatformOperationsPanel canWrite={canWrite} restaurantId={account.restaurant_id} />

      <AppDrawer description={`${account.restaurant_name} · ${pendingAction?.description ?? ""}`} dismissOnOverlay={false} footer={pendingAction ? <><button className="button secondary" disabled={saving} onClick={() => setPendingAction(null)} type="button">Abbrechen</button><button className="button" data-drawer-autofocus disabled={saving} onClick={() => void confirmAction()} type="button">{saving ? "Wird gespeichert …" : pendingAction.actionLabel}</button></> : null} onClose={() => setPendingAction(null)} open={Boolean(pendingAction)} size="compact" title={pendingAction?.title ?? "Änderung bestätigen"}>
        <p>{pendingAction?.impact}</p>
      </AppDrawer>
    </section>
  );
}
