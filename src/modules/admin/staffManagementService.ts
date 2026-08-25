import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type StaffAccountStatus = "invited" | "active" | "suspended" | "archived";
export type OwnerStaffMember = {
  id: string;
  name: string;
  email: string;
  status: StaffAccountStatus;
  role: "staff";
  invited_at: string | null;
  accepted_at: string | null;
  last_invited_at: string | null;
  last_login_at: string | null;
  last_activity_at: string | null;
  points_actions_count: number;
  last_points_action_at: string | null;
  created_at: string;
};

function requireClient() {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  return supabase;
}

function messageForCode(code?: string) {
  const messages: Record<string, string> = {
    STAFF_EMAIL_ALREADY_EXISTS: "Für diese E-Mail-Adresse gibt es bereits einen Teamzugang.",
    STAFF_MEMBERSHIP_ARCHIVED: "Dieser Teamzugang wurde entfernt und kann nicht erneut eingeladen werden.",
    STAFF_INVITE_DELIVERY_FAILED: "Die Einladung konnte nicht versendet werden. Bitte versuche es später erneut.",
    STAFF_INVITE_RATE_LIMITED: "Bitte warte kurz, bevor du die Einladung erneut sendest.",
    STAFF_MANAGEMENT_NOT_AUTHORIZED: "Du darfst Teamzugänge für dieses Restaurant nicht verwalten.",
    STAFF_ROLE_CONFLICT: "Dieses Konto besitzt bereits eine andere Rolle in diesem Restaurant.",
    STAFF_AUTH_IDENTITY_ROLE_CONFLICT: "Diese E-Mail-Adresse gehört bereits zu einem anderen WUXUAI-Zugang.",
  };
  return messages[code ?? ""] ?? "Der Teamzugang konnte nicht aktualisiert werden.";
}

export async function loadOwnerStaffMembers(restaurantId: string) {
  const { data, error } = await requireClient().rpc("get_owner_staff_members", {
    input_restaurant_id: restaurantId,
  });
  if (error || !data?.success) throw new Error(messageForCode(data?.error_code ?? error?.message));
  return (data.staff ?? []) as OwnerStaffMember[];
}

export async function inviteOwnerStaffMember(restaurantId: string, name: string, email: string) {
  const { data, error } = await requireClient().functions.invoke("owner-staff-invite", {
    body: { action: "invite", restaurantId, name, email },
  });
  if (error || !data?.success) throw new Error(messageForCode(data?.error));
}

export async function resendOwnerStaffInvitation(restaurantId: string, staffMemberId: string) {
  const { data, error } = await requireClient().functions.invoke("owner-staff-invite", {
    body: { action: "resend", restaurantId, staffMemberId },
  });
  if (error || !data?.success) throw new Error(messageForCode(data?.error));
}

export async function changeOwnerStaffStatus(
  restaurantId: string,
  staffMemberId: string,
  action: "suspend" | "reactivate" | "archive",
) {
  const { data, error } = await requireClient().rpc("set_restaurant_staff_membership_status", {
    input_action: action,
    input_restaurant_id: restaurantId,
    input_staff_member_id: staffMemberId,
  });
  if (error || !data?.success) throw new Error(messageForCode(error?.message));
}
