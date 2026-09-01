const healthLabels = {
  healthy: "Funktioniert",
  warning: "Hinweis",
  error: "Fehler",
  unavailable: "Keine Telemetrie",
};

const overallHealthLabels = {
  healthy: "Alles in Ordnung",
  warning: "Hinweise vorhanden",
  error: "Problem erkannt",
  unknown: "Status teilweise unbekannt",
};

export function formatPlatformMetric(metric, formatter = String) {
  if (!metric || metric.status !== "available") return "–";
  return formatter(metric.value);
}

export function getHealthPresentation(status) {
  return {
    label: healthLabels[status] ?? healthLabels.unavailable,
    tone: status === "healthy" ? "success" : status === "error" ? "danger" : status === "warning" ? "warning" : "neutral",
  };
}

export function getOverallHealthPresentation(status) {
  return {
    label: overallHealthLabels[status] ?? overallHealthLabels.unknown,
    tone: status === "healthy" ? "success" : status === "error" ? "danger" : status === "warning" ? "warning" : "neutral",
  };
}

export function getReferralDurationPresentation(durationDays, durationType) {
  if (durationType === "custom" || ![7, 14, 28].includes(durationDays)) {
    return `Eigener Wert: ${durationDays} Tage`;
  }
  return `${durationDays} Tage`;
}

export function getRestaurantStatusLabel(status) {
  return status === "active" ? "Aktiv" : status === "suspended" ? "Gesperrt" : "Inaktiv";
}

export function getSetupLabel(completed) {
  return completed ? "Setup vollständig" : "Setup unvollständig";
}
