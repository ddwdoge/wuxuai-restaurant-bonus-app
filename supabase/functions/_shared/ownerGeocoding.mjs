const FIELD_LIMITS = Object.freeze({
  address: 180,
  postalCode: 24,
  city: 100,
  country: 2,
});

function cleanText(value, maximumLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

export function normalizeOwnerAddress(input) {
  const source = input && typeof input === "object" ? input : {};
  const address = cleanText(source.address, FIELD_LIMITS.address);
  const postalCode = cleanText(source.postalCode, FIELD_LIMITS.postalCode);
  const city = cleanText(source.city, FIELD_LIMITS.city);
  const rawCountry = String(source.country ?? "").trim();
  const country = cleanText(rawCountry, FIELD_LIMITS.country).toUpperCase();

  if (!address || !postalCode || !city || rawCountry.length !== 2 || !/^[A-Z]{2}$/.test(country)) {
    throw new Error("ADDRESS_INCOMPLETE");
  }

  return {
    address,
    postalCode,
    city,
    country,
    query: `${address}, ${postalCode} ${city}, ${country}`,
  };
}

export async function hashOwnerAddress(address) {
  const bytes = new TextEncoder().encode(address.query.toLocaleLowerCase("de-AT"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function buildNominatimSearchUrl(address) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address.query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", address.country.toLowerCase());
  return url;
}

function validCoordinate(value, minimum, maximum) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : null;
}

export function normalizeNominatimResults(value, fallbackAddress) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const results = [];

  for (const item of value.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const latitude = validCoordinate(item.lat, -90, 90);
    const longitude = validCoordinate(item.lon, -180, 180);
    if (latitude === null || longitude === null) continue;
    const coordinateKey = `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
    if (seen.has(coordinateKey)) continue;
    seen.add(coordinateKey);

    const providerAddress = item.address && typeof item.address === "object" ? item.address : {};
    const road = cleanText(providerAddress.road || providerAddress.pedestrian || providerAddress.house_name, FIELD_LIMITS.address);
    const houseNumber = cleanText(providerAddress.house_number, 24);
    results.push({
      latitude,
      longitude,
      displayName: cleanText(item.display_name, 260) || fallbackAddress.query,
      address: cleanText([road, houseNumber].filter(Boolean).join(" "), FIELD_LIMITS.address) || fallbackAddress.address,
      postalCode: cleanText(providerAddress.postcode, FIELD_LIMITS.postalCode) || fallbackAddress.postalCode,
      city: cleanText(providerAddress.city || providerAddress.town || providerAddress.village || providerAddress.municipality, FIELD_LIMITS.city)
        || fallbackAddress.city,
      country: cleanText(providerAddress.country_code, FIELD_LIMITS.country).toUpperCase() || fallbackAddress.country,
    });
  }

  return results;
}
