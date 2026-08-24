export function safeReferralFirstName(value: string | null | undefined): string | null;
export function referralInvitationTitle(value: string | null | undefined): string;
export function createReferralCreationToken(cryptoSource?: Pick<Crypto, "getRandomValues">): string;
