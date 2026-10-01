export type StaffAmountParseResult =
  | { ok: true; reason: null; cents: number }
  | { ok: false; reason: "required" | "format" | "range"; cents: null };
export function parseStaffAmountToCents(rawValue: string, maxAmountCents: number): StaffAmountParseResult;
export function formatStaffAmountFromCents(amountCents: number, decimalSeparator?: string): string;
