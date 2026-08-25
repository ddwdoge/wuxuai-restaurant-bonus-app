import { liveDataUnavailableMessage, staffInviteSupabase } from "../../shared/lib/supabase";
import { establishStaffInviteSessionCore, STAFF_INVITE_MARKER_KEY } from "./staffInviteFlow.mjs";

let establishInFlight: Promise<unknown> | null = null;

function requireClient() {
  if (!staffInviteSupabase) throw new Error(liveDataUnavailableMessage);
  return staffInviteSupabase;
}

export async function establishStaffInviteSession() {
  if (!establishInFlight) {
    establishInFlight = establishStaffInviteSessionCore({
      auth: requireClient().auth,
      storage: window.sessionStorage,
      url: new URL(window.location.href),
    }).finally(() => { establishInFlight = null; });
  }
  return establishInFlight;
}

export async function completeStaffInvite(password: string) {
  const client = requireClient();
  const marker = window.sessionStorage.getItem(STAFF_INVITE_MARKER_KEY);
  const staffMemberId = marker ? JSON.parse(marker)?.staffMemberId : null;
  if (typeof staffMemberId !== "string") throw new Error("Diese Einladung ist ungültig oder abgelaufen.");
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error("Das Passwort konnte nicht gespeichert werden.");
  const { data, error: acceptanceError } = await client.rpc("accept_my_restaurant_staff_invitation", {
    input_staff_member_id: staffMemberId,
  });
  if (acceptanceError || !data?.success) throw new Error("Der Teamzugang konnte nicht aktiviert werden.");
  window.sessionStorage.removeItem(STAFF_INVITE_MARKER_KEY);
  await client.auth.signOut({ scope: "local" });
}

export function clearStaffInviteUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}
