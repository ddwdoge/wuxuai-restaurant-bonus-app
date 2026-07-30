import {
  DEFAULT_REDEMPTION_RATE_PERCENT,
  calculateRewardEconomics,
  isAllowedRedemptionRatePercent,
} from "../modules/loyalty/redemptionRate.mjs";

export const DEFAULT_POINTS_PER_EURO = 10;

export const REDEMPTION_TYPE_OPTIONS = Object.freeze([
  { key: "free_item", label: "Gratis Produkt oder Leistung" },
  { key: "percent_discount", label: "Prozent-Rabatt" },
  { key: "fixed_voucher", label: "Fester Gutscheinbetrag" },
  { key: "custom", label: "Individuelle Belohnung" },
]);

export const GENEROSITY_OPTIONS = Object.freeze([
  { key: "economical", label: "Sparsam" },
  { key: "standard", label: "Standard" },
  { key: "generous", label: "Großzügig" },
  { key: "premium", label: "Premium" },
]);

const generosityRates = Object.freeze({
  economical: 3,
  standard: 3,
  generous: 8,
  premium: 10,
});

function optionKey(label) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function gifts(entries) {
  return entries.map(([label, category, estimatedValue, description]) => ({
    key: label === "Eigene Auswahl" ? "custom" : optionKey(label),
    label,
    category,
    estimatedValue,
    description: description ?? `${label} als persönlicher Willkommensvorteil.`,
  }));
}

function makeDefaults(profile, standardRewardCategory, standardRewardTitle, standardValue) {
  const nonCustomGifts = profile.welcomeGiftOptions.filter((option) => option.key !== "custom");
  const categoryAt = (index) => profile.redemptionCategories[Math.min(index, profile.redemptionCategories.length - 2)];
  const giftAt = (index) => nonCustomGifts[Math.min(index, nonCustomGifts.length - 1)];

  return {
    economical: {
      welcomeGiftKey: giftAt(0).key,
      rewardCategory: categoryAt(0),
      rewardTitle: `Gratis ${categoryAt(0)}`,
      estimatedValue: Math.max(1, Math.round(standardValue * 0.7)),
      redemptionRatePercent: generosityRates.economical,
    },
    standard: {
      welcomeGiftKey: giftAt(0).key,
      rewardCategory: standardRewardCategory,
      rewardTitle: standardRewardTitle,
      estimatedValue: standardValue,
      redemptionRatePercent: generosityRates.standard,
    },
    generous: {
      welcomeGiftKey: giftAt(1).key,
      rewardCategory: categoryAt(2),
      rewardTitle: `Gratis ${categoryAt(2)}`,
      estimatedValue: Math.max(2, Math.round(standardValue * 1.4)),
      redemptionRatePercent: generosityRates.generous,
    },
    premium: {
      welcomeGiftKey: giftAt(2).key,
      rewardCategory: categoryAt(3),
      rewardTitle: `Gratis ${categoryAt(3)}`,
      estimatedValue: Math.max(3, Math.round(standardValue * 2)),
      redemptionRatePercent: generosityRates.premium,
    },
  };
}

function profile({ key, label, welcomeGiftOptions, redemptionCategories, standardRewardCategory, standardRewardTitle, standardValue }) {
  const result = {
    key,
    label,
    welcomeGiftOptions: gifts(welcomeGiftOptions),
    redemptionCategories,
    rewardTypes: REDEMPTION_TYPE_OPTIONS,
    generosityDefaults: null,
    examples: [],
  };
  result.generosityDefaults = makeDefaults(result, standardRewardCategory, standardRewardTitle, standardValue);
  result.examples = GENEROSITY_OPTIONS.map((option) => result.generosityDefaults[option.key].rewardTitle);
  return Object.freeze(result);
}

export const BUSINESS_PROFILES = Object.freeze({
  restaurant: profile({
    key: "restaurant", label: "Restaurant", standardRewardCategory: "Dessert", standardRewardTitle: "Gratis Dessert", standardValue: 6,
    welcomeGiftOptions: [["Gratis Getränk", "Getränk", 4], ["Gratis Dessert", "Dessert", 6], ["Gratis Vorspeise", "Vorspeise", 6], ["Rabatt auf eine Hauptspeise", "Hauptspeise", 5], ["Gratis Menü", "Menü", 16], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Getränk", "Dessert", "Vorspeise", "Hauptspeise", "Menü", "Eigene Belohnung"],
  }),
  cafe: profile({
    key: "cafe", label: "Café", standardRewardCategory: "Gebäck", standardRewardTitle: "Gratis Gebäck", standardValue: 4,
    welcomeGiftOptions: [["Gratis Kaffee", "Kaffee", 4], ["Gratis Tee", "Heißgetränk", 4], ["Gratis Heißgetränk", "Heißgetränk", 5], ["Gratis Gebäck", "Gebäck", 4], ["Rabatt auf Frühstück", "Frühstück", 5], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Kaffee", "Heißgetränk", "Kaltgetränk", "Gebäck", "Frühstück", "Eigene Belohnung"],
  }),
  bakery: profile({
    key: "bakery", label: "Bäckerei", standardRewardCategory: "Gebäck", standardRewardTitle: "Gratis Gebäck", standardValue: 4,
    welcomeGiftOptions: [["Gratis Gebäck", "Gebäck", 4], ["Gratis Brot", "Brot", 5], ["Gratis Snack", "Snack", 5], ["Gratis Getränk", "Getränk", 4], ["Rabatt auf den nächsten Einkauf", "Gutschein", 5], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Brot", "Gebäck", "Snack", "Getränk", "Gutschein", "Eigene Belohnung"],
  }),
  bubble_tea: profile({
    key: "bubble_tea", label: "Bubble Tea", standardRewardCategory: "Getränk", standardRewardTitle: "Gratis Getränk", standardValue: 6,
    welcomeGiftOptions: [["Gratis Topping", "Topping", 1], ["Gratis Getränk", "Getränk", 6], ["Größen-Upgrade", "Größen-Upgrade", 2], ["Rabatt auf den nächsten Kauf", "Gutschein", 4], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Getränk", "Topping", "Größen-Upgrade", "Gutschein", "Eigene Belohnung"],
  }),
  ice_cream: profile({
    key: "ice_cream", label: "Eisdiele", standardRewardCategory: "Kugel", standardRewardTitle: "Gratis Kugel", standardValue: 3,
    welcomeGiftOptions: [["Gratis Kugel", "Kugel", 3], ["Gratis Topping", "Topping", 1], ["Größen-Upgrade", "Größen-Upgrade", 2], ["Rabatt auf den nächsten Besuch", "Gutschein", 4], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Kugel", "Becher", "Topping", "Größen-Upgrade", "Eigene Belohnung"],
  }),
  retail: profile({
    key: "retail", label: "Einzelhandel", standardRewardCategory: "Einkaufsgutschein", standardRewardTitle: "5 € Einkaufsgutschein", standardValue: 5,
    welcomeGiftOptions: [["5 % Rabatt", "Prozent-Rabatt", 3], ["10 % Rabatt", "Prozent-Rabatt", 5], ["Einkaufsgutschein", "Einkaufsgutschein", 5], ["Gratis Probe", "Gratisprobe", 2], ["Gratis Produkt", "Produkt", 8], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Produkt", "Produktkategorie", "Einkaufsgutschein", "Prozent-Rabatt", "Gratisprobe", "Eigene Belohnung"],
  }),
  hair_salon: profile({
    key: "hair_salon", label: "Friseursalon", standardRewardCategory: "Zusatzleistung", standardRewardTitle: "Gratis Zusatzleistung", standardValue: 8,
    welcomeGiftOptions: [["Rabatt auf den nächsten Termin", "Prozent-Rabatt", 8], ["Pflegeprodukt gratis", "Pflegeprodukt", 10], ["Gratis Zusatzleistung", "Zusatzleistung", 8], ["Gutschein", "Gutschein", 10], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Haarschnitt", "Zusatzleistung", "Pflegeprodukt", "Gutschein", "Prozent-Rabatt", "Eigene Belohnung"],
  }),
  beauty: profile({
    key: "beauty", label: "Kosmetikstudio", standardRewardCategory: "Zusatzbehandlung", standardRewardTitle: "Gratis Zusatzbehandlung", standardValue: 10,
    welcomeGiftOptions: [["Gratis Zusatzbehandlung", "Zusatzbehandlung", 10], ["Rabatt auf den nächsten Termin", "Prozent-Rabatt", 10], ["Pflegeprobe", "Pflegeprodukt", 4], ["Gutschein", "Gutschein", 10], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Behandlung", "Zusatzbehandlung", "Pflegeprodukt", "Gutschein", "Prozent-Rabatt", "Eigene Belohnung"],
  }),
  fitness: profile({
    key: "fitness", label: "Fitnessstudio", standardRewardCategory: "Tagespass", standardRewardTitle: "Gratis Tagespass", standardValue: 12,
    welcomeGiftOptions: [["Gratis Probetraining", "Training", 12], ["Gratis Getränk", "Getränk", 4], ["Rabatt auf Zusatzleistung", "Prozent-Rabatt", 8], ["Gratis Tagespass", "Tagespass", 12], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Training", "Tagespass", "Getränk", "Zusatzleistung", "Gutschein", "Eigene Belohnung"],
  }),
  service: profile({
    key: "service", label: "Dienstleistung", standardRewardCategory: "Gutschein", standardRewardTitle: "5 € Gutschein", standardValue: 5,
    welcomeGiftOptions: [["Prozent-Rabatt", "Prozent-Rabatt", 5], ["Gutschein", "Gutschein", 5], ["Gratis Zusatzleistung", "Zusatzleistung", 8], ["Rabatt auf den nächsten Auftrag", "Prozent-Rabatt", 8], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Leistung", "Produkt", "Gutschein", "Prozent-Rabatt", "Eigene Belohnung"],
  }),
  other: profile({
    key: "other", label: "Sonstiges", standardRewardCategory: "Gutschein", standardRewardTitle: "5 € Gutschein", standardValue: 5,
    welcomeGiftOptions: [["Prozent-Rabatt", "Prozent-Rabatt", 5], ["Gutschein", "Gutschein", 5], ["Gratis Produkt", "Produkt", 6], ["Gratis Leistung", "Leistung", 8], ["Eigene Auswahl", "Eigene Auswahl", 0]],
    redemptionCategories: ["Leistung", "Produkt", "Gutschein", "Prozent-Rabatt", "Eigene Belohnung"],
  }),
});

export const BUSINESS_TYPE_OPTIONS = Object.freeze(Object.values(BUSINESS_PROFILES).map(({ key, label }) => ({ key, label })));

const aliases = new Map([
  ["restaurant", "restaurant"], ["cafe", "cafe"], ["café", "cafe"], ["backerei", "bakery"], ["bäckerei", "bakery"],
  ["bubble tea", "bubble_tea"], ["bubble_tea", "bubble_tea"], ["eisdiele", "ice_cream"], ["ice cream", "ice_cream"],
  ["einzelhandel", "retail"], ["friseursalon", "hair_salon"], ["friseur", "hair_salon"], ["kosmetikstudio", "beauty"],
  ["fitnessstudio", "fitness"], ["dienstleistung", "service"], ["sonstiges", "other"], ["other", "other"],
]);

export function businessProfileKeyFromValue(value) {
  const raw = String(value ?? "").trim();
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return aliases.get(raw.toLowerCase()) ?? aliases.get(normalized) ?? (BUSINESS_PROFILES[raw] ? raw : "other");
}

export function isKnownBusinessType(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  return aliases.has(raw.toLowerCase()) || aliases.has(raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) || Boolean(BUSINESS_PROFILES[raw]);
}

export function getBusinessProfile(value) {
  return BUSINESS_PROFILES[businessProfileKeyFromValue(value)];
}

export function getWelcomeGiftOption(profile, key) {
  return profile.welcomeGiftOptions.find((option) => option.key === key) ?? null;
}

export function isProfileWelcomeGiftKey(key) {
  const candidate = String(key ?? "").trim();
  if (!candidate || candidate === "custom") return false;
  return Object.values(BUSINESS_PROFILES).some((profile) =>
    profile.welcomeGiftOptions.some((option) => option.key === candidate && option.key !== "custom"),
  );
}

export function reconcileBusinessProfileSelections({ businessType, welcomeGiftKey, rewardCategory }) {
  const profile = getBusinessProfile(businessType);
  const welcomeValid = !welcomeGiftKey || welcomeGiftKey === "custom" || Boolean(getWelcomeGiftOption(profile, welcomeGiftKey));
  const categoryValid = !rewardCategory || rewardCategory === "Eigene Belohnung" || profile.redemptionCategories.includes(rewardCategory);
  return {
    welcomeGiftKey: welcomeValid ? welcomeGiftKey : "",
    rewardCategory: categoryValid ? rewardCategory : "",
    changed: !welcomeValid || !categoryValid,
  };
}

export function createBonusProgramSuggestion({
  businessType,
  generosity = "standard",
  averagePurchase,
  pointsPerEuro = DEFAULT_POINTS_PER_EURO,
  redemptionType = "free_item",
  redemptionRatePercent,
}) {
  const profile = getBusinessProfile(businessType);
  const safeGenerosity = GENEROSITY_OPTIONS.some((option) => option.key === generosity) ? generosity : "standard";
  const defaults = profile.generosityDefaults[safeGenerosity];
  const safeRate = isAllowedRedemptionRatePercent(Number(redemptionRatePercent))
    ? Number(redemptionRatePercent)
    : defaults.redemptionRatePercent ?? DEFAULT_REDEMPTION_RATE_PERCENT;
  const safePointsPerEuro = Math.max(1, Math.round(Number(pointsPerEuro) || DEFAULT_POINTS_PER_EURO));
  const safeAveragePurchase = Math.max(1, Number(averagePurchase) || 1);
  const estimatedValue = Math.min(Math.max(1, defaults.estimatedValue), Math.max(1, safeAveragePurchase));
  const economics = calculateRewardEconomics({
    productPrice: estimatedValue,
    redemptionRatePercent: safeRate,
    pointsPerEuro: safePointsPerEuro,
  });

  return {
    businessType: profile.label,
    businessProfileKey: profile.key,
    generosity: safeGenerosity,
    welcomeGift: getWelcomeGiftOption(profile, defaults.welcomeGiftKey),
    rewardCategory: defaults.rewardCategory,
    rewardTitle: defaults.rewardTitle,
    estimatedValue,
    redemptionType,
    redemptionRatePercent: safeRate,
    pointsPerEuro: safePointsPerEuro,
    requiredPoints: economics.requiredPoints,
    estimatedConsumption: economics.estimatedConsumption,
    economicsStatus: economics.status,
    description: `${defaults.rewardTitle} als erste Punkteeinlösung für treue Gäste.`,
  };
}
