const DEFAULT_TIME_ZONE = "Europe/Vienna";
const MAX_RESTAURANT_SEGMENT_LENGTH = 80;
const LOWERCASE_CONNECTORS = new Set(["am", "an", "auf", "bei", "der", "die", "im", "in", "und", "vom", "von", "zu", "zum", "zur"]);

function localIsoDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeStarterKitRestaurantName(value) {
  const transliterated = String(value ?? "")
    .trim()
    .replaceAll("Ä", "Ae")
    .replaceAll("Ö", "Oe")
    .replaceAll("Ü", "Ue")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const readable = transliterated
    .split("-")
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && LOWERCASE_CONNECTORS.has(word.toLowerCase())) return word.toLowerCase();
      if (word === word.toLowerCase()) return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
      return word;
    })
    .join("-");

  return readable.slice(0, MAX_RESTAURANT_SEGMENT_LENGTH).replace(/-+$/g, "");
}

export function buildStarterKitFilename(restaurantName, date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const safeRestaurantName = normalizeStarterKitRestaurantName(restaurantName);
  const restaurantSegment = safeRestaurantName ? `_${safeRestaurantName}` : "";
  return `WUXUAI-Starter-Kit${restaurantSegment}_${localIsoDate(date, timeZone)}.pdf`;
}
