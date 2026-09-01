export type EmailConfirmationPayload =
  | { kind: "token_hash"; tokenHash: string; type: "email" | "signup" }
  | { kind: "pkce"; code: string }
  | { kind: "legacy_session"; accessToken: string; refreshToken: string }
  | { kind: "invalid"; reason: string };

export function readEmailConfirmationPayload(locationLike: Pick<Location, "search" | "hash">): EmailConfirmationPayload;
export function emailConfirmationPayloadKey(payload: EmailConfirmationPayload): string;
export function createEmailConfirmationSingleFlight<T = unknown>(): {
  run(key: string, operation: () => Promise<T> | T): Promise<T>;
};

