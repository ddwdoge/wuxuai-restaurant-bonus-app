export type StaffPointsFailureCategory =
  | "transport"
  | "session_expired"
  | "staff_unauthorized"
  | "daily_pin"
  | "customer_membership"
  | "amount_invalid"
  | "duplicate"
  | "booking_rejected"
  | "notification_sidepath"
  | "unknown";
export function classifyStaffPointsFailure(failure: unknown): {
  category: StaffPointsFailureCategory;
  safeCode: string;
};
