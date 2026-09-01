export const STAFF_INVITE_MARKER_KEY: string;

export type StaffInviteAuth = {
  exchangeCodeForSession(code: string): Promise<unknown>;
  getSession(): Promise<unknown>;
  setSession(session: { access_token: string; refresh_token: string }): Promise<unknown>;
};

export function parseStaffInviteUrl(urlLike: URL | string): {
  accessToken: string | null;
  code: string | null;
  error: string | null;
  refreshToken: string | null;
  staffMemberId: string | null;
  type: string | null;
};

export function establishStaffInviteSessionCore(input: {
  auth: StaffInviteAuth;
  storage: Storage;
  url: URL | string;
}): Promise<{ session: unknown; staffMemberId: string }>;

export function validateStaffInvitePassword(password: string, confirmation: string): {
  valid: boolean;
  message: string;
};
