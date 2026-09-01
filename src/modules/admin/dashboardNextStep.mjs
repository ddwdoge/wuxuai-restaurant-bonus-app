export const DASHBOARD_NOTICE_KEYS = Object.freeze({
  onboardingSuccess: "legal_readiness_completed_v1",
  addLogo: "dashboard_add_logo_v1",
  enableReferral: "dashboard_enable_referral_v1",
});

function step(input) {
  return Object.freeze(input);
}

export function resolveDashboardNextStep(input) {
  const seen = input.seenNoticeIds ?? new Set();

  if (input.legalStatus?.status === "red") {
    return step({
      id: "legal_readiness_blocked",
      priority: 10,
      category: "critical",
      title: input.legalStatus.label || "Rechtliche Pflichtangaben vervollständigen",
      description: input.legalStatus.reason || "Für die Kundenregistrierung fehlen noch rechtliche Pflichtangaben oder aktive Dokumentversionen.",
      ctaLabel: "Rechtliches prüfen",
      ctaHref: "/admin/legal",
      dismissible: false,
    });
  }

  if (!input.emailStatus.confirmed) {
    return step({
      id: "owner_email_unconfirmed",
      priority: 20,
      category: "critical",
      title: "E-Mail-Adresse bestätigen",
      description: "Bestätige deine E-Mail-Adresse, damit dein Restaurantkonto vollständig geschützt und nutzbar ist.",
      ctaLabel: "E-Mail-Bestätigung öffnen",
      ctaHref: "/auth/confirm-email",
      dismissible: false,
    });
  }

  if (!input.restaurantStatus.active) {
    return step({
      id: "restaurant_inactive",
      priority: 30,
      category: "critical",
      title: "Bonusprogramm aktivieren",
      description: "Das Bonusprogramm ist derzeit nicht aktiv. Prüfe den Restaurantstatus, bevor Gäste Punkte sammeln.",
      ctaLabel: "Restaurantstatus prüfen",
      ctaHref: "/admin/settings/konto-testphase",
      dismissible: false,
    });
  }

  if (input.legalStatus?.status === "yellow") {
    return step({
      id: "legal_readiness_warning",
      priority: 40,
      category: "critical",
      title: input.legalStatus.label || "Rechtliche Angaben prüfen",
      description: input.legalStatus.reason || "Für deine rechtlichen Dokumente ist eine offene Aufgabe vorhanden.",
      ctaLabel: "Legal Center öffnen",
      ctaHref: "/admin/legal",
      dismissible: false,
    });
  }

  if (input.statusLoadFailed) {
    return step({
      id: "dashboard_status_unavailable",
      priority: 50,
      category: "critical",
      title: "Einrichtungsstatus prüfen",
      description: "Der aktuelle Einrichtungsstatus konnte nicht vollständig geladen werden. Bitte prüfe die Angaben erneut.",
      ctaLabel: "Erneut prüfen",
      dismissible: false,
    });
  }

  if (input.onboardingStatus !== "completed" && input.onboardingStatus !== "ready") {
    return step({
      id: "complete_onboarding",
      priority: 100,
      category: "setup",
      title: "Einrichtung abschließen",
      description: "Schließe die Restaurant-Einrichtung ab, damit dein Bonusprogramm vollständig genutzt werden kann.",
      ctaLabel: "Einrichtung fortsetzen",
      ctaHref: "/admin/onboarding",
      dismissible: false,
    });
  }

  if (!input.rewardStatus.pointsRedemptionReady) {
    return step({
      id: "setup_points_redemption",
      priority: 110,
      category: "setup",
      title: "Punkte-Einlösung einrichten",
      description: "Richte jetzt die Punkte-Einlösung für dein Restaurant ein. Damit können Mitarbeiter Kundenpunkte sicher bestätigen und Belohnungen einlösen.",
      ctaLabel: "Punkte-Einlösung einrichten",
      ctaHref: "/admin/rewards",
      dismissible: false,
    });
  }

  if (!input.pointsFlowStatus.ready) {
    return step({
      id: "setup_points_collection",
      priority: 120,
      category: "setup",
      title: "Punktevergabe festlegen",
      description: "Lege fest, wie dein Restaurant Punkte bestätigt. Die sichere Tages-PIN wird automatisch erzeugt.",
      ctaLabel: "Punktevergabe einrichten",
      ctaHref: "/admin/settings/punkte-sammeln",
      dismissible: false,
    });
  }

  if (!input.rewardStatus.welcomeGiftReady) {
    return step({
      id: "setup_welcome_gift",
      priority: 130,
      category: "setup",
      title: "Willkommensgeschenk aktivieren",
      description: "Aktiviere ein Willkommensgeschenk, damit neue Gäste nach ihrem ersten gültigen Besuch einen besonderen Vorteil erhalten.",
      ctaLabel: "Willkommensgeschenk einrichten",
      ctaHref: "/admin/welcome-gifts",
      dismissible: false,
    });
  }

  if (!input.qrStatus.ready) {
    return step({
      id: "setup_qr_center",
      priority: 140,
      category: "setup",
      title: "QR-Code vorbereiten",
      description: "Öffne das Starter Kit und bereite den Restaurant-QR für deine Gäste vor.",
      ctaLabel: "QR Center öffnen",
      ctaHref: "/admin/qr",
      dismissible: false,
    });
  }

  if (!input.rewardStatus.birthdayPoolReady) {
    return step({
      id: "setup_birthday_gift_pool",
      priority: 150,
      category: "setup",
      title: "Geburtstagsgeschenk aktivieren",
      description: "Aktiviere eines deiner vorhandenen Geschenke zusätzlich für die jährliche Geburtstagsüberraschung.",
      ctaLabel: "Geschenk auswählen",
      ctaHref: "/admin/welcome-gifts",
      dismissible: false,
    });
  }

  if (input.persistenceAvailable && !input.profileStatus.logoAvailable && !seen.has(DASHBOARD_NOTICE_KEYS.addLogo)) {
    return step({
      id: DASHBOARD_NOTICE_KEYS.addLogo,
      priority: 200,
      category: "optimization",
      title: "Restaurantlogo ergänzen",
      description: "Ein Logo macht dein Bonusprogramm für Gäste leichter wiedererkennbar.",
      ctaLabel: "Aussehen bearbeiten",
      ctaHref: "/admin/settings/aussehen",
      dismissible: true,
    });
  }

  if (input.persistenceAvailable && !input.referralStatus.enabled && !seen.has(DASHBOARD_NOTICE_KEYS.enableReferral)) {
    return step({
      id: DASHBOARD_NOTICE_KEYS.enableReferral,
      priority: 210,
      category: "optimization",
      title: "Freundschaftsbonus aktivieren",
      description: "Aktiviere den Freundschaftsbonus, wenn Gäste dein Restaurant gezielt weiterempfehlen sollen.",
      ctaLabel: "Bonusprogramm öffnen",
      ctaHref: "/admin/settings/bonusprogramm",
      dismissible: true,
    });
  }

  if (
    input.persistenceAvailable
    && input.legalStatus?.status === "green"
    && !seen.has(DASHBOARD_NOTICE_KEYS.onboardingSuccess)
  ) {
    return step({
      id: DASHBOARD_NOTICE_KEYS.onboardingSuccess,
      priority: 300,
      category: "success",
      title: "Dein Bonusprogramm ist startklar.",
      description: "Alle Pflichtangaben und aktiven Dokumentversionen sind verfügbar.",
      dismissible: false,
    });
  }

  return null;
}
