function recommendation(input) {
  return Object.freeze(input);
}

export function resolveOwnerDashboardRecommendation(input) {
  if (input.statusLoadFailed) {
    return recommendation({
      id: "setup_status_unavailable",
      category: "critical",
      icon: "publication",
      title: "Einrichtungsstatus prüfen",
      description: "Der aktuelle Einrichtungsstatus konnte nicht vollständig geladen werden. Bitte prüfe ihn erneut.",
      ctaLabel: "Erneut prüfen",
    });
  }

  if (!input.emailStatus.confirmed) {
    return recommendation({
      id: "publication_email_unconfirmed",
      category: "critical",
      icon: "publication",
      title: "Restaurant veröffentlichen",
      description: "Bestätige zuerst deine E-Mail-Adresse, damit du die Veröffentlichung sicher abschließen kannst.",
      ctaLabel: "Jetzt einrichten",
      ctaHref: "/auth/confirm-email",
    });
  }

  if (input.onboardingStatus !== "completed" && input.onboardingStatus !== "ready") {
    return recommendation({
      id: "publication_onboarding_incomplete",
      category: "setup",
      icon: "publication",
      title: "Restaurant veröffentlichen",
      description: "Schließe die Einrichtung ab, damit dein Restaurant für Gäste bereit wird.",
      ctaLabel: "Jetzt einrichten",
      ctaHref: "/admin/onboarding",
    });
  }

  if (input.legalStatus?.status !== "green") {
    return recommendation({
      id: "publication_legal_readiness",
      category: "critical",
      icon: "publication",
      title: "Restaurant veröffentlichen",
      description: input.legalStatus?.reason || "Prüfe und veröffentliche deine Pflichtdokumente, damit sich neue Gäste registrieren können.",
      ctaLabel: "Jetzt einrichten",
      ctaHref: "/admin/legal",
    });
  }

  if (!input.restaurantStatus.active) {
    return recommendation({
      id: "publication_restaurant_inactive",
      category: "critical",
      icon: "publication",
      title: "Restaurant veröffentlichen",
      description: "Aktiviere dein Restaurant, damit das Bonusprogramm öffentlich genutzt werden kann.",
      ctaLabel: "Jetzt einrichten",
      ctaHref: "/admin/settings/konto-testphase",
    });
  }

  if (!input.publicationStatus.ready) {
    return recommendation({
      id: "publication_location_incomplete",
      category: "setup",
      icon: "publication",
      title: "Restaurant veröffentlichen",
      description: "Vervollständige deinen Standort und die Veröffentlichung, damit neue Gäste dein Restaurant unter „Entdecken“ finden können.",
      ctaLabel: "Jetzt einrichten",
      ctaHref: "/admin/settings/standort",
    });
  }

  if (!input.rewardStatus.pointsRedemptionReady) {
    return recommendation({
      id: "setup_points_redemption",
      category: "setup",
      icon: "reward",
      title: "Erste Punkteeinlösung erstellen",
      description: "Lege fest, was deine Gäste mit ihren gesammelten Punkten erhalten können.",
      ctaLabel: "Punkteeinlösung erstellen",
      ctaHref: "/admin/rewards",
    });
  }

  if (!input.offerStatus.ready) {
    return recommendation({
      id: "setup_first_offer",
      category: "setup",
      icon: "offer",
      title: "Erstes Angebot veröffentlichen",
      description: "Gib Gästen einen zusätzlichen Grund, dein Restaurant zu besuchen.",
      ctaLabel: "Angebot erstellen",
      ctaHref: "/admin/offers",
    });
  }

  if (!input.rewardStatus.birthdayPoolReady) {
    return recommendation({
      id: "setup_birthday_gift_pool",
      category: "setup",
      icon: "birthday",
      title: "Geburtstagsgeschenk auswählen",
      description: "Wähle mindestens ein aktives Willkommensgeschenk für Geburtstagsgeschenke aus.",
      ctaLabel: "Geschenk auswählen",
      ctaHref: "/admin/welcome-gifts",
    });
  }

  if (!input.qrStatus.ready) {
    return recommendation({
      id: "setup_qr_center",
      category: "setup",
      icon: "qr",
      title: "QR-Codes bereitstellen",
      description: "Lade dein Starter Kit herunter und platziere die QR-Codes im Restaurant.",
      ctaLabel: "QR Center öffnen",
      ctaHref: "/admin/qr",
    });
  }

  if (!input.staffStatus.ready) {
    return recommendation({
      id: "setup_staff_access",
      category: "setup",
      icon: "staff",
      title: "Mitarbeiterzugang einrichten",
      description: "Richte einen Mitarbeiterzugang für Punktebuchungen und den Restaurantbetrieb ein.",
      ctaLabel: "Mitarbeiter einrichten",
      ctaHref: "/admin/staff",
    });
  }

  if (input.actionStatus?.pointAnomalyOpen) {
    return recommendation({
      id: "action_point_anomaly",
      category: "action",
      icon: "warning",
      title: "Ungewöhnlich hohen Buchungsbetrag prüfen",
      description: "Eine Punktebuchung liegt nahe am festgelegten Maximalbetrag. Bitte prüfe die Buchung.",
      ctaLabel: "Prüfen",
    });
  }

  return null;
}
