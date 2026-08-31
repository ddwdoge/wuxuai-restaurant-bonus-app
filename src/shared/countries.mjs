export const ISO_ALPHA_2_COUNTRY_CODES = Object.freeze([
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
]);

const SUPPORTED_DISPLAY_LOCALES = Object.freeze(["de", "en", "fr", "it", "es"]);
const COUNTRY_CODE_SET = new Set(ISO_ALPHA_2_COUNTRY_CODES);
const optionCache = new Map();

function normalizeLocale(locale) {
  const language = String(locale ?? "de").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_DISPLAY_LOCALES.includes(language) ? language : "de";
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function countryDisplayName(code, locale) {
  if (typeof Intl.DisplayNames !== "function") return code;
  return new Intl.DisplayNames([locale], { type: "region" }).of(code) || code;
}

export function isIsoAlpha2CountryCode(value) {
  return COUNTRY_CODE_SET.has(String(value ?? "").trim().toUpperCase());
}

export function getCountryOptions(locale = "de") {
  const normalizedLocale = normalizeLocale(locale);
  if (optionCache.has(normalizedLocale)) return optionCache.get(normalizedLocale);

  const collator = new Intl.Collator(normalizedLocale, { sensitivity: "base" });
  const options = ISO_ALPHA_2_COUNTRY_CODES.map((code) => {
    const label = countryDisplayName(code, normalizedLocale);
    const aliases = SUPPORTED_DISPLAY_LOCALES.map((candidateLocale) => countryDisplayName(code, candidateLocale));
    return Object.freeze({
      code,
      label,
      searchText: normalizeSearchText([code, label, ...aliases].join(" ")),
    });
  }).sort((left, right) => collator.compare(left.label, right.label));

  const frozenOptions = Object.freeze(options);
  optionCache.set(normalizedLocale, frozenOptions);
  return frozenOptions;
}

export function countryNameForCode(code, locale = "de") {
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  return getCountryOptions(locale).find((option) => option.code === normalizedCode)?.label ?? "";
}

export function filterCountryOptions(locale, query, limit = 50) {
  const search = normalizeSearchText(query);
  const options = getCountryOptions(locale);
  if (!search) return options.slice(0, limit);

  return options
    .filter((option) => option.searchText.includes(search))
    .sort((left, right) => {
      const leftLabel = normalizeSearchText(left.label);
      const rightLabel = normalizeSearchText(right.label);
      const leftStarts = leftLabel.startsWith(search) ? 0 : 1;
      const rightStarts = rightLabel.startsWith(search) ? 0 : 1;
      return leftStarts - rightStarts;
    })
    .slice(0, limit);
}
