const statusPresentation = {
  healthy: { label: "Betriebsbereit", tone: "success" },
  no_recent_events: { label: "Keine aktuellen Ereignisse", tone: "neutral" },
  degraded: { label: "Eingeschränkt", tone: "warning" },
  error: { label: "Fehler", tone: "danger" },
  unavailable: { label: "Nicht verfügbar", tone: "neutral" },
};

const reasonPresentation = {
  expected_jobs_missing: "Nicht alle sieben erwarteten Jobs sind konfiguriert.",
  expected_jobs_disabled: "Mindestens ein erwarteter Job ist deaktiviert.",
  latest_known_run_failed: "Der letzte bekannte Lauf ist fehlgeschlagen.",
  recent_failures_present: "In den letzten 24 Stunden sind Fehler aufgetreten.",
  no_job_run_history: "Für die konfigurierten Jobs liegt noch kein Laufnachweis vor.",
  cron_configuration_source_unavailable: "Die Scheduler-Konfiguration ist nicht verfügbar.",
  cron_run_history_source_unavailable: "Die Scheduler-Laufhistorie ist nicht verfügbar.",
  failed_deliveries_present: "In der Versandwarteschlange liegen fehlgeschlagene Zustellungen vor.",
  deliveries_waiting: "In der Versandwarteschlange warten Nachrichten auf Verarbeitung.",
  no_recent_delivery_events: "In den letzten sieben Tagen wurden keine Versandereignisse erfasst.",
  transactional_email_source_unavailable: "Die Versandquelle ist nicht verfügbar.",
  repeated_recent_registration_failures: "In den letzten 24 Stunden wurden wiederholt fehlgeschlagene Registrierungsversuche erfasst.",
  registration_failures_present: "In den letzten 24 Stunden wurden fehlgeschlagene Registrierungsversuche erfasst.",
  no_recent_registration_events: "In den letzten sieben Tagen wurden keine Registrierungen erfasst.",
  registration_audit_source_unavailable: "Die Registrierungsquelle ist nicht verfügbar.",
};

export function getOperationalStatusPresentation(status) {
  return statusPresentation[status] ?? statusPresentation.unavailable;
}

export function getOperationalReasonLabel(reason) {
  if (!reason) return null;
  return reasonPresentation[reason] ?? "Der Betriebsnachweis ist derzeit nicht eindeutig verfügbar.";
}

export function formatOperationalDateTime(value) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
