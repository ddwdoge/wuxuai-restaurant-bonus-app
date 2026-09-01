export const STAFF_INVITE_MARKER_KEY = "staff_invite_in_progress";

function invalidInviteError() {
  return new Error("Diese Einladung ist ungültig oder abgelaufen.");
}

function requireSession(result) {
  if (result?.error) throw result.error;
  if (!result?.data?.session?.user) throw invalidInviteError();
  return result.data.session;
}

export function parseStaffInviteUrl(urlLike) {
  const url = urlLike instanceof globalThis.URL ? urlLike : new globalThis.URL(String(urlLike), "http://localhost");
  const hash = new globalThis.URLSearchParams(url.hash.replace(/^#/, ""));
  return {
    accessToken: hash.get("access_token"),
    code: url.searchParams.get("code"),
    error: url.searchParams.get("error_code") ?? hash.get("error_code"),
    refreshToken: hash.get("refresh_token"),
    staffMemberId: url.searchParams.get("staff"),
    type: url.searchParams.get("type") ?? hash.get("type"),
  };
}

export async function establishStaffInviteSessionCore({ auth, storage, url }) {
  const payload = parseStaffInviteUrl(url);
  if (payload.error) throw invalidInviteError();
  const marker = storage?.getItem(STAFF_INVITE_MARKER_KEY);
  const storedStaffMemberId = marker && marker !== "1" ? JSON.parse(marker)?.staffMemberId : null;
  const staffMemberId = payload.staffMemberId ?? storedStaffMemberId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffMemberId ?? "")) {
    throw invalidInviteError();
  }

  if (payload.code) {
    const session = requireSession(await auth.exchangeCodeForSession(payload.code));
    storage?.setItem(STAFF_INVITE_MARKER_KEY, JSON.stringify({ staffMemberId }));
    return { session, staffMemberId };
  }
  if (payload.accessToken || payload.refreshToken) {
    if (!["invite", "magiclink", "recovery"].includes(payload.type) || !payload.accessToken || !payload.refreshToken) {
      throw invalidInviteError();
    }
    const session = requireSession(await auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    }));
    storage?.setItem(STAFF_INVITE_MARKER_KEY, JSON.stringify({ staffMemberId }));
    return { session, staffMemberId };
  }
  if (marker) {
    const session = requireSession(await auth.getSession());
    return { session, staffMemberId };
  }
  throw invalidInviteError();
}

export function validateStaffInvitePassword(password, confirmation) {
  if (String(password).length < 8) return { valid: false, message: "Das Passwort muss mindestens 8 Zeichen lang sein." };
  if (password !== confirmation) return { valid: false, message: "Passwörter stimmen nicht überein." };
  return { valid: true, message: "" };
}
