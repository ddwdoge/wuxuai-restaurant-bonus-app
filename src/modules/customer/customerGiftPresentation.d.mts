export type CustomerGiftPresentationRecord = {
  active: boolean;
  assignment_id?: string | null;
  expires_at?: string | null;
  gift_type?: "welcome" | "birthday" | "legacy" | null;
  id: string;
  is_starter_reward?: boolean;
  status: "locked" | "unlocked" | "redemption_started" | "redeemed" | "expired";
  valid_until?: string | null;
};

export function selectCustomerHomeGifts<T extends CustomerGiftPresentationRecord>(rewards: T[]): T[];
