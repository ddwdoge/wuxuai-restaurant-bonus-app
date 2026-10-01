export function parseStaffAmountToCents(rawValue, maxAmountCents) {
  const value = String(rawValue ?? "").trim();
  const maxCents = Number.isSafeInteger(maxAmountCents) && maxAmountCents > 0 ? maxAmountCents : 0;
  if (!value) return { ok: false, reason: "required", cents: null };
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return { ok: false, reason: "format", cents: null };

  const [eurosText, fractionText = ""] = value.replace(",", ".").split(".");
  const euros = Number(eurosText);
  const cents = (euros * 100) + Number(fractionText.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > maxCents) {
    return { ok: false, reason: "range", cents: null };
  }
  return { ok: true, reason: null, cents };
}

export function formatStaffAmountFromCents(amountCents, decimalSeparator = ",") {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) return "";
  const euros = Math.floor(amountCents / 100);
  const cents = String(amountCents % 100).padStart(2, "0");
  return `${euros}${decimalSeparator}${cents}`;
}
