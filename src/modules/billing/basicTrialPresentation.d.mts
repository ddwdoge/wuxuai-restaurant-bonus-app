export function formatViennaDateTime(value: string | null | undefined): string;
export function basicTrialDurationLabel(calendarMonths: number | null | undefined): string;
export function inferTrialCalendarMonths(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
): 1 | 3 | null;
export function hasLegacyUtcCalendarBoundary(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
): boolean;
