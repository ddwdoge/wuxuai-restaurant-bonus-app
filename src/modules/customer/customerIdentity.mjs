export function normalizeCustomerPhone(value) {
  let compact = typeof value === "string" ? value.trim().replace(/[^\d+]/g, "") : "";
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (/^0\d+$/.test(compact)) compact = `+43${compact.slice(1)}`;
  if (/^43\d+$/.test(compact)) compact = `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}
