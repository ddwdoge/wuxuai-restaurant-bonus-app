export const STARTER_KIT_FOOTER = "Powered by WUXUAI Bonus";

export const STARTER_KIT_LAYOUT = Object.freeze({
  canvas: { height: 1748, width: 1240 },
  contentMargin: 96,
  logo: { height: 208, width: 598, x: 321, y: 106 },
  restaurantName: { fontSize: 44, lineHeight: 50, maxLines: 1, minFontSize: 30, y: 326 },
  audience: { fontSize: 27, y: 388 },
  headline: { fontSize: 70, lineHeight: 78, maxLines: 1, minFontSize: 44, y: 428 },
  description: { fontSize: 31, lineHeight: 38, maxLines: 1, minFontSize: 24, y: 512 },
  qr: { frameInset: 44, frameRadius: 30, size: 680, x: 280, y: 610 },
  secondaryNote: { fontSize: 23, lineHeight: 30, y: 1360 },
  referral: { height: 260, y: 1352 },
  footer: { fontSize: 26, y: 1650 },
});

const STAFF_TEXT_LAYOUT = Object.freeze({
  description: { ...STARTER_KIT_LAYOUT.description, fontSize: 29, lineHeight: 34, maxLines: 2, y: 448 },
  headline: { ...STARTER_KIT_LAYOUT.headline, y: 378 },
});

export function getStarterKitPageLayout(page) {
  if (page.id !== "staff") {
    return {
      description: STARTER_KIT_LAYOUT.description,
      headline: STARTER_KIT_LAYOUT.headline,
    };
  }
  return STAFF_TEXT_LAYOUT;
}

export function starterKitSingleLineFontSize(text, options) {
  const normalizedLength = Math.max(1, Array.from(String(text).trim()).length);
  const estimatedWidth = normalizedLength * options.fontSize * 0.56;
  if (estimatedWidth <= options.maxWidth) return options.fontSize;
  return Math.max(options.minFontSize, Math.floor(options.fontSize * options.maxWidth / estimatedWidth));
}

export function starterKitEstimatedLineCount(text, options) {
  const normalizedLength = Math.max(1, Array.from(String(text).trim()).length);
  return Math.max(1, Math.ceil(normalizedLength * options.fontSize * 0.56 / options.maxWidth));
}

export const STARTER_KIT_REFERRAL = Object.freeze({
  title: "Freunde einladen lohnt sich",
  benefits: [
    { icon: "🔥", label: "Du bekommst", value: "2× Punkte" },
    { icon: "👥", label: "Dein Freund bekommt", value: "2× Punkte" },
  ],
  note: "Aktiv nach dem ersten qualifizierten Besuch deines Freundes.",
});

const CORE_PAGES = Object.freeze([
  {
    audienceLabel: "Bonus für Gäste",
    headline: "Neu hier?",
    id: "welcome",
    qrKind: "restaurant",
    referralHint: true,
    subheadline: "Scanne den QR-Code und sichere dir dein Willkommensgeschenk.",
  },
  {
    audienceLabel: "Bonus für Gäste",
    headline: "Bonusprogramm entdecken",
    id: "discover",
    qrKind: "restaurant",
    referralHint: true,
    subheadline: "Scanne den QR-Code und werde Gast in unserem Bonusprogramm.",
  },
  {
    headline: "Mitarbeiterbereich",
    id: "staff",
    qrKind: "staff",
    secondaryNote: "Nur für Mitarbeiter · Nicht für Gäste",
    subheadline: "Anmelden für Tages-PIN, Gästeprüfung und Restaurant-Service.",
  },
]);

const COMPATIBILITY_PAGE = Object.freeze({
  audienceLabel: "Bonus für Gäste",
  headline: "Punkte sammeln",
  id: "collect",
  qrKind: "bonus",
  secondaryNote: "Tages-PIN erforderlich.",
  subheadline: "Nach dem Bezahlen scannen und Bonuspunkte sichern.",
});

export function getStarterKitPageDefinitions(includeCustomerCollectCompatibility = false) {
  if (!includeCustomerCollectCompatibility) return CORE_PAGES.map((page) => ({ ...page }));
  return [CORE_PAGES[0], CORE_PAGES[1], COMPATIBILITY_PAGE, CORE_PAGES[2]].map((page) => ({ ...page }));
}
