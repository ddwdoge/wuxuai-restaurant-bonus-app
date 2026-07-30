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
export declare function normalizeOpeningDay(value: unknown, fallback: Pick<OpeningDay, "enabled" | "open" | "close">): OpeningDay;
export declare function validateOpeningDay(day: OpeningDay): string | null;
export declare function todayOpeningHours(value: unknown, date?: Date): string | null;
