export const STAFF_STATUS_LABELS = Object.freeze({
  active: "Aktiv",
  archived: "Entfernt",
  invited: "Einladung offen",
  suspended: "Gesperrt",
});

export function validateStaffInvitation({ email, name }) {
  const normalizedName = String(name ?? "").trim();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (normalizedName.length < 2 || normalizedName.length > 120) {
    return { valid: false, message: "Bitte gib einen gültigen Namen ein." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { valid: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." };
  }
  return { valid: true, name: normalizedName, email: normalizedEmail };
}

export function staffActionsForStatus(status) {
  if (status === "invited") return ["resend", "archive"];
  if (status === "active") return ["suspend", "archive"];
  if (status === "suspended") return ["reactivate", "archive"];
  return [];
}

