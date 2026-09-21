import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, Gauge, PackagePlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { localeTag } from "../../../shared/i18n/formatters.mjs";
import { useI18n } from "../../../shared/i18n/I18nProvider";
import {
  capacityMessage,
  ownerCapacityMessages,
  ownerCapacityPaymentLabel,
} from "../../capacity/ownerCapacityMessages.mjs";
import {
  acknowledgeOwnerCapacityWarning,
  loadOwnerCapacity,
  loadOwnerCapacityWarnings,
  type CapacityAddonCatalog,
  type CapacityMetric,
  type CapacityStatus,
  type OwnerCapacitySnapshot,
  type OwnerCapacityWarning,
} from "../../capacity/ownerCapacityService";
import { useTenant } from "../../tenant/TenantProvider";

function statusTone(status: CapacityStatus) {
  if (status === "OVER_LIMIT") return "danger";
  if (status === "AT_LIMIT" || status === "WARNING_90") return "warning";
  if (status === "WARNING_80") return "attention";
  return "success";
}

export function OwnerCapacityPage() {
  const { language } = useI18n();
  const messages = ownerCapacityMessages(language);
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id;
  const [snapshot, setSnapshot] = useState<OwnerCapacitySnapshot | null>(null);
  const [warnings, setWarnings] = useState<OwnerCapacityWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [acknowledgeError, setAcknowledgeError] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(false);
    try {
      const [capacity, activeWarnings] = await Promise.all([
        loadOwnerCapacity(restaurantId),
        loadOwnerCapacityWarnings(restaurantId),
      ]);
      setSnapshot(capacity);
      setWarnings(activeWarnings);
    } catch {
      setSnapshot(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  const acknowledge = useCallback(async (episodeId: string) => {
    if (!restaurantId || acknowledging) return;
    setAcknowledging(episodeId);
    setAcknowledgeError(false);
    try {
      await acknowledgeOwnerCapacityWarning(restaurantId, episodeId);
      setWarnings((current) => current.map((warning) => (
        warning.episode_id === episodeId ? { ...warning, acknowledged: true } : warning
      )));
    } catch {
      setAcknowledgeError(true);
    } finally {
      setAcknowledging(null);
    }
  }, [acknowledging, restaurantId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <section aria-live="polite" className="card owner-capacity-loading"><Gauge aria-hidden="true" /><p>{messages.loading}</p></section>;
  }
  if (error || !snapshot) {
    return <section className="card owner-capacity-error" role="alert"><AlertTriangle aria-hidden="true" /><p>{messages.error}</p><button className="button secondary" onClick={() => void load()} type="button">{messages.retry}</button></section>;
  }

  const locale = localeTag(language);
  const formatNumber = (value: number) => new Intl.NumberFormat(locale).format(value);
  const formatMoney = (minor: number, currency: string) => new Intl.NumberFormat(locale, {
    style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(minor / 100);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
  const commercialState = snapshot.commercial_release?.release_state === "RELEASED" ? messages.released : messages.locked;
  const paymentStatus = snapshot.plan.payment_status
    ? ownerCapacityPaymentLabel(language, snapshot.plan.payment_status, messages.unavailable)
    : messages.unavailable;

  return (
    <>
      <header className="page-header owner-capacity-header">
        <div><h1>{messages.title}</h1><p className="muted">{messages.description}</p></div>
        <Link className="button secondary" to="/admin/settings"><ArrowLeft aria-hidden="true" size={18} />{messages.back}</Link>
      </header>

      <section className="owner-capacity-summary" aria-label={messages.plan}>
        <article className="card owner-capacity-plan-card">
          <div><span>{messages.plan}</span><strong>{snapshot.plan.plan_key}</strong><small>{capacityMessage(messages.netMonth, { price: formatMoney(snapshot.plan.monthly_price_minor, snapshot.plan.currency) })}</small></div>
          <dl>
            <div><dt>{messages.country}</dt><dd>{snapshot.commercial_release?.country_code || messages.unavailable}</dd></div>
            <div><dt>{messages.commercial}</dt><dd>{commercialState}</dd></div>
            <div><dt>{messages.payment}</dt><dd>{paymentStatus}</dd></div>
          </dl>
        </article>
      </section>

      <section className="owner-capacity-grid">
        <CapacityMetricCard icon={PackagePlus} metric={snapshot.offers} title={messages.offers} messages={messages} formatNumber={formatNumber} />
        <CapacityMetricCard icon={Users} metric={snapshot.active_customers} title={messages.customers} messages={messages} formatNumber={formatNumber} footer={capacityMessage(messages.window, { days: snapshot.active_customers.window_days })} />
      </section>

      <p className="owner-capacity-as-of">{capacityMessage(messages.asOf, { date: formatDate(snapshot.as_of) })}</p>

      <section className="card owner-capacity-warning-contract" aria-labelledby="owner-capacity-warning-title">
        <Bell aria-hidden="true" />
        <div>
          <h2 id="owner-capacity-warning-title">{messages.warningTitle}</h2>
          <p>{messages.warningReady}</p>
          {warnings.length ? <div className="owner-capacity-warning-list">
            {warnings.map((warning) => <CapacityWarningNotice
              acknowledging={acknowledging === warning.episode_id}
              formatNumber={formatNumber}
              key={warning.episode_id}
              messages={messages}
              onAcknowledge={() => void acknowledge(warning.episode_id)}
              warning={warning}
            />)}
          </div> : <p>{messages.noWarnings}</p>}
          {acknowledgeError ? <p className="status-message error" role="alert">{messages.acknowledgeError}</p> : null}
        </div>
      </section>

      <div className="owner-capacity-actions">
        <button className="button" onClick={() => setDrawerOpen(true)} type="button">{messages.increase}</button>
      </div>

      <AppDrawer
        className="owner-mobile-drawer owner-capacity-drawer"
        description={messages.drawerDescription}
        footer={<button className="button secondary" data-drawer-autofocus onClick={() => setDrawerOpen(false)} type="button">{messages.cancel}</button>}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        size="compact"
        title={messages.drawerTitle}
      >
        <div className="owner-capacity-addon-list">
          <AddonInformation addon={snapshot.catalog.offer_addon} formatMoney={formatMoney} formatNumber={formatNumber} label={messages.offerAddon} line={messages.addonLine} />
          <AddonInformation addon={snapshot.catalog.customer_addon} formatMoney={formatMoney} formatNumber={formatNumber} label={messages.customerAddon} line={messages.addonLine} />
          <p className="status-message warning"><AlertTriangle aria-hidden="true" size={18} />{messages.noPurchase}</p>
        </div>
      </AppDrawer>
    </>
  );
}

function CapacityWarningNotice({ acknowledging, formatNumber, messages, onAcknowledge, warning }: {
  acknowledging: boolean;
  formatNumber: (value: number) => string;
  messages: Record<string, string>;
  onAcknowledge: () => void;
  warning: OwnerCapacityWarning;
}) {
  const typeLabel = warning.capacity_type === "offer" ? messages.warningOffer : messages.warningCustomer;
  const sourceLabel = warning.triggered_by === "FORECAST" ? messages.warningForecast : messages.warningActual;
  return <article className="owner-capacity-warning-notice">
    <div>
      <strong>{typeLabel}: {warning.warning_level}</strong>
      <span>{sourceLabel}</span>
      <p>{capacityMessage(messages.used, { usage: formatNumber(warning.usage), limit: formatNumber(warning.effective_limit) })}</p>
      {warning.projected_usage_7d !== null ? <p>{capacityMessage(messages.forecastLabel, { value: formatNumber(warning.projected_usage_7d) })}</p> : null}
    </div>
    <button className="button secondary" disabled={warning.acknowledged || acknowledging} onClick={onAcknowledge} type="button">
      {warning.acknowledged ? messages.acknowledged : messages.acknowledge}
    </button>
  </article>;
}

function CapacityMetricCard({ footer, formatNumber, icon: Icon, messages, metric, title }: {
  footer?: string;
  formatNumber: (value: number) => string;
  icon: typeof PackagePlus;
  messages: Record<string, string>;
  metric: CapacityMetric;
  title: string;
}) {
  const tone = statusTone(metric.status);
  const statusLabel = metric.status === "OVER_LIMIT" ? messages.overLimit
    : metric.status === "AT_LIMIT" ? messages.atLimit
      : metric.status === "WARNING_90" ? messages.warning90
        : metric.status === "WARNING_80" ? messages.warning80
          : messages.available;
  const explanation = metric.status === "OVER_LIMIT"
    ? capacityMessage(title === messages.offers ? messages.offerOver : messages.customerOver, { usage: formatNumber(metric.usage), limit: formatNumber(metric.effective_limit) })
    : metric.status === "AT_LIMIT"
      ? title === messages.offers ? messages.offerAt : messages.customerAt
      : null;

  return <article className={`card owner-capacity-metric owner-capacity-${tone}`}>
    <header><span className="icon-badge"><Icon aria-hidden="true" size={22} /></span><div><h2>{title}</h2><span className={`owner-capacity-status ${tone}`}>{statusLabel}</span></div></header>
    <strong className="owner-capacity-usage">{capacityMessage(messages.used, { usage: formatNumber(metric.usage), limit: formatNumber(metric.effective_limit) })}</strong>
    <div aria-label={capacityMessage(messages.used, { usage: formatNumber(metric.usage), limit: formatNumber(metric.effective_limit) })} aria-valuemax={metric.effective_limit} aria-valuemin={0} aria-valuenow={metric.usage} className="owner-capacity-progress" role="progressbar"><span style={{ width: `${metric.usage_percent}%` }} /></div>
    <dl>
      <div><dt>{capacityMessage(messages.included, { value: formatNumber(metric.base_limit) })}</dt><dd>{formatNumber(metric.base_limit)}</dd></div>
      <div><dt>{capacityMessage(messages.addons, { units: formatNumber(metric.addon_units) })}</dt><dd>{capacityMessage(messages.addonCapacity, { value: formatNumber(metric.addon_capacity) })}</dd></div>
      <div><dt>{capacityMessage(messages.total, { value: formatNumber(metric.effective_limit) })}</dt><dd>{formatNumber(metric.effective_limit)}</dd></div>
    </dl>
    <p className="owner-capacity-remaining"><CheckCircle2 aria-hidden="true" size={18} />{capacityMessage(messages.remaining, { value: formatNumber(metric.remaining) })}</p>
    {footer ? <p className="muted owner-capacity-window">{footer}</p> : null}
    {explanation ? <p className={`status-message ${tone === "danger" ? "error" : "warning"}`}><AlertTriangle aria-hidden="true" size={18} />{explanation}</p> : null}
  </article>;
}

function AddonInformation({ addon, formatMoney, formatNumber, label, line }: {
  addon: CapacityAddonCatalog;
  formatMoney: (minor: number, currency: string) => string;
  formatNumber: (value: number) => string;
  label: string;
  line: string;
}) {
  return <article className="owner-capacity-addon"><h3>{label}</h3><p>{capacityMessage(line, { value: formatNumber(addon.capacity_per_unit), price: formatMoney(addon.monthly_price_minor, addon.currency) })}</p></article>;
}
