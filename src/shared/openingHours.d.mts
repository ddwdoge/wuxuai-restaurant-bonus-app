export type OpeningDay = {
  enabled: boolean;
  open: string;
  close: string;
  lunchBreakEnabled: boolean;
  lunchBreakStart: string;
  lunchBreakEnd: string;
  secondOpen: string;
  secondClose: string;
};

export declare const openingDayKeys: readonly string[];
export type LunchBreakSuggestion = {
  firstBlockEnd: string;
  breakStart: string;
  breakEnd: string;
  secondBlockStart: string;
};
export declare function normalizeOpeningDay(value: unknown, fallback: Pick<OpeningDay, "enabled" | "open" | "close">): OpeningDay;
export declare function copyOpeningDayToDays<T extends string>(openingHours: Record<T, OpeningDay>, sourceKey: T, destinationKeys: readonly T[]): Record<T, OpeningDay>;
export declare function openingDaysDiffer<T extends string>(openingHours: Record<T, OpeningDay>, sourceKey: T, destinationKeys: readonly T[]): boolean;
export declare function suggestLunchBreak(openingStart: string, openingEnd: string, standardBreak?: { start: string; end: string } | null): LunchBreakSuggestion | null;
export declare function validateOpeningDay(day: OpeningDay): string | null;
export declare function todayOpeningHours(value: unknown, date?: Date): string | null;
export type PartnerOpeningStatus = {
  isOpen: boolean;
  state: "open" | "closed" | "opens_later" | "lunch_break" | "unknown";
  message: string;
  todayHours: string | null;
};
export declare function partnerOpeningStatus(value: unknown, date?: Date, specialDays?: unknown, holidays?: unknown): PartnerOpeningStatus;
