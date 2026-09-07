import { AlertTriangle, CalendarClock, Mail, UserPlus } from "lucide-react";
import type { PlatformOperationalTelemetry as Telemetry } from "./platformAdminService";
import { formatOperationalDateTime, getOperationalReasonLabel, getOperationalStatusPresentation } from "./platformOperationalTelemetryView.mjs";
import { translateStructural } from "../../shared/i18n/catalog.mjs";
import { UiState, UiStatus } from "../../shared/ui";

const t = (key: string) => translateStructural(key, "de");

type Props = {
  data: Telemetry | null;
  error: string;
  loading: boolean;
};

function StatusBadge({ status }: { status: Telemetry["cron"]["status"] }) {
  const presentation = getOperationalStatusPresentation(status);
  const tone = presentation.tone === "danger" ? "error" : presentation.tone;
  return <UiStatus className={`platform-health-badge ${presentation.tone}`} tone={tone}>{presentation.label}</UiStatus>;
}

export function PlatformOperationalTelemetry({ data, error, loading }: Props) {
  if (loading) {
    return <UiState description={t("platform.operationalLoading")} kind="loading" title={t("platform.operationalStatus")} />;
  }

  if (error || !data) {
    return (
      <section className="card platform-operational-telemetry" role="status">
        <div className="section-heading"><h2>{t("platform.operationalStatus")}</h2><p className="muted">Globale Quellen werden niemals als gesund angenommen.</p></div>
        <div className="platform-operational-unavailable"><AlertTriangle aria-hidden="true" size={22} /><div><strong>{t("common.unavailable")}</strong><span>{error || t("platform.telemetryUnavailable")}</span></div></div>
      </section>
    );
  }

  return (
    <section className="card platform-operational-telemetry" aria-labelledby="platform-operational-title">
      <div className="section-heading"><h2 id="platform-operational-title">{t("platform.operationalStatus")}</h2><p className="muted">Belegte Systemsignale. Fehlende Quellen werden ausdrücklich ausgewiesen.</p></div>
      <div className="platform-operational-grid">
        <article>
          <header><div><CalendarClock aria-hidden="true" size={21} /><h3>{t("platform.cron")}</h3></div><StatusBadge status={data.cron.status} /></header>
          <dl>
            <div><dt>{t("platform.configured")}</dt><dd>{data.cron.configured_job_count} von {data.cron.expected_job_count}</dd></div>
            <div><dt>{t("platform.enabled")}</dt><dd>{data.cron.enabled_job_count} von {data.cron.expected_job_count}</dd></div>
            <div><dt>{t("platform.lastSuccess")}</dt><dd>{formatOperationalDateTime(data.cron.last_success_at)}</dd></div>
            <div><dt>{t("platform.failures24h")}</dt><dd>{data.cron.failures_24h}</dd></div>
          </dl>
          {data.cron.reason ? <p className="platform-telemetry-note">{t("platform.evidence")}: {getOperationalReasonLabel(data.cron.reason)}</p> : null}
        </article>

        <article>
          <header><div><Mail aria-hidden="true" size={21} /><h3>{t("platform.email")}</h3></div><StatusBadge status={data.email.status} /></header>
          <dl>
            <div><dt>{t("platform.pending")}</dt><dd>{data.email.pending_count}</dd></div>
            <div><dt>{t("platform.processing")}</dt><dd>{data.email.processing_count}</dd></div>
            <div><dt>{t("common.failed")}</dt><dd>{data.email.failed_count}</dd></div>
            <div><dt>{t("platform.sent24h")}</dt><dd>{data.email.sent_24h_count}</dd></div>
          </dl>
          {data.email.reason ? <p className="platform-telemetry-note">{t("platform.evidence")}: {getOperationalReasonLabel(data.email.reason)}</p> : null}
          <p className="platform-telemetry-note">Versandkonfiguration: Nicht aus der Datenbank prüfbar.</p>
        </article>

        <article>
          <header><div><UserPlus aria-hidden="true" size={21} /><h3>{t("platform.registrations")}</h3></div><StatusBadge status={data.registration.status} /></header>
          <dl>
            <div><dt>{t("platform.success24h")}</dt><dd>{data.registration.success_24h}</dd></div>
            <div><dt>{t("platform.success7d")}</dt><dd>{data.registration.success_7d}</dd></div>
            <div><dt>{t("platform.failures24h")}</dt><dd>{data.registration.failures_24h}</dd></div>
            <div><dt>{t("platform.lastSuccess")}</dt><dd>{formatOperationalDateTime(data.registration.last_success_at)}</dd></div>
          </dl>
          {data.registration.reason ? <p className="platform-telemetry-note">{t("platform.evidence")}: {getOperationalReasonLabel(data.registration.reason)}</p> : null}
        </article>
      </div>
    </section>
  );
}
