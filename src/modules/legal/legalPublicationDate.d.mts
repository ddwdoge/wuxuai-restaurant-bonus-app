export declare function viennaCalendarDate(date?: Date): string;
export declare function safeLegalRpcError(error: unknown): {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
};
export declare function onboardingCompletionErrorMessage(error: unknown): string;
