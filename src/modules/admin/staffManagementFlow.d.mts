export const STAFF_STATUS_LABELS: Readonly<Record<"active" | "archived" | "invited" | "suspended", string>>;

export function validateStaffInvitation(input: { email: string; name: string }):
  | { valid: false; message: string }
  | { valid: true; name: string; email: string };

export function staffActionsForStatus(status: string): Array<"resend" | "suspend" | "reactivate" | "archive">;

