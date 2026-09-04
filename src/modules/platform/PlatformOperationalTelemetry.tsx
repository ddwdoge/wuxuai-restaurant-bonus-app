import { AlertTriangle, CalendarClock, Mail, UserPlus } from "lucide-react";
import type { PlatformOperationalTelemetry as Telemetry } from "./platformAdminService";
import { formatOperationalDateTime, getOperationalReasonLabel, getOperationalStatusPresentation } from "./platformOperationalTelemetryView.mjs";

type Props = {
  data: Telemetry | null;
  error: string;
  loading: boolean;
};

function StatusBadge({ status }: { status: Telemetry["cron"]["status"] }) {
  const presentation = getOperationalStatusPresentation(status);
  return <span className={`platform-health-badge ${presentation.tone}`}>{presentation.label}</span>;
}

export function PlatformOperationalTelemetry({ data, error, loading }: Props) {
  if (loading) {
    return <section aria-label="Betriebsstatus wird geladen" className="card platform-operational-telemetry"><p className="muted">Betriebsstatus wird geladen …</p></section>;
  }

  if (error || !data) {
    return (
      <section className="card platform-operational-telemetry" role="status">
        <div className="section-heading"><h2>Betriebsstatus</h2><p className="muted">Globale Quellen werden niemals als gesund angenommen.</p></div>
        <div className="platform-operational-unavailable"><AlertTriangle aria-hidden="true" size={22} /><div><strong>Nicht verfügbar</strong><span>{error || "Die Telemetriequelle hat keine Daten geliefert."}</span></div></div>
      </section>
    );
  }

  return (
    <section className="card platform-operational-telemetry" aria-labelledby="platform-operational-title">
      <div className="section-heading"><h2 id="platform-operational-title">Betriebsstatus</h2><p className="muted">Belegte Systemsignale. Fehlende Quellen werden ausdrücklich ausgewiesen.</p></div>
      <div className="platform-operational-grid">
        <article>
          <header><div><CalendarClock aria-hidden="true" size={21} /><h3>Cron / Scheduler</h3></div><StatusBadge status={data.cron.status} /></header>
          <dl>
            <div><dt>Konfiguriert</dt><dd>{data.cron.configured_job_count} von {data.cron.expected_job_count}</dd></div>
            <div><dt>Aktiv</dt><dd>{data.cron.enabled_job_count} von {data.cron.expected_job_count}</dd></div>
            <div><dt>Letzter Erfolg</dt><dd>{formatOperationalDateTime(data.cron.last_success_at)}</dd></div>
            <div><dt>Fehler · 24 h</dt><dd>{data.cron.failures_24h}</dd></div>
          </dl>
          {data.cron.reason ? <p className="platform-telemetry-note">Nachweis: {getOperationalReasonLabel(data.cron.reason)}</p> : null}
        </article>

        <article>
          <header><div><Mail aria-hidden="true" size={21} /><h3>Transaktions-E-Mail</h3></div><StatusBadge status={data.email.status} /></header>
          <dl>
            <div><dt>Ausstehend</dt><dd>{data.email.pending_count}</dd></div>
            <div><dt>In Verarbeitung</dt><dd>{data.email.processing_count}</dd></div>
            <div><dt>Fehlgeschlagen</dt><dd>{data.email.failed_count}</dd></div>
            <div><dt>Gesendet · 24 h</dt><dd>{data.email.sent_24h_count}</dd></div>
          </dl>
          {data.email.reason ? <p className="platform-telemetry-note">Nachweis: {getOperationalReasonLabel(data.email.reason)}</p> : null}
          <p className="platform-telemetry-note">Versandkonfiguration: Nicht aus der Datenbank prüfbar.</p>
        </article>

        <article>
          <header><div><UserPlus aria-hidden="true" size={21} /><h3>Registrierungen</h3></div><StatusBadge status={data.registration.status} /></header>
          <dl>
            <div><dt>Erfolgreich · 24 h</dt><dd>{data.registration.success_24h}</dd></div>
            <div><dt>Erfolgreich · 7 Tage</dt><dd>{data.registration.success_7d}</dd></div>
            <div><dt>Fehler · 24 h</dt><dd>{data.registration.failures_24h}</dd></div>
            <div><dt>Letzter Erfolg</dt><dd>{formatOperationalDateTime(data.registration.last_success_at)}</dd></div>
          </dl>
          {data.registration.reason ? <p className="platform-telemetry-note">Nachweis: {getOperationalReasonLabel(data.registration.reason)}</p> : null}
        </article>
      </div>
    </section>
  );
}
