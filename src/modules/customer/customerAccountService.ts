import { supabase } from "../../shared/lib/supabase";
import type { RestaurantOffer } from "../offers/restaurantOfferService";
import { readStoredCustomerToken, removeStoredCustomerToken, saveStoredCustomerToken } from "./customerTokenStorage";

export type CustomerAccountReward = {
  id: string;
  title: string;
  required_points: number;
  missing_points?: number;
  image_url: string | null;
  expires_at: string | null;
};

export type CustomerAccountMembership = {
  restaurant_id: string;
  branch_id: string | null;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  opening_hours: unknown;
  special_days: unknown;
  holidays: unknown;
  membership_status: string;
  points_balance: number;
  visits_count: number;
  last_visit_at: string | null;
  available_rewards: CustomerAccountReward[];
  next_reward: CustomerAccountReward | null;
  active_gifts: number;
  new_offer_count: number;
  email_preference: "NEVER" | "WEEKLY" | "MONTHLY";
  email_consent_status: "NOT_GRANTED" | "PENDING_CONFIRMATION" | "ACTIVE" | "PAUSED" | "WITHDRAWN";
};

export type CustomerAccount = {
  profile: {
    first_name: string;
    phone_masked: string | null;
    birthday_masked: string | null;
    email: string | null;
    email_status: "NOT_PROVIDED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "SUPPRESSED";
  };
  memberships: CustomerAccountMembership[];
  offers: RestaurantOffer[];
  email_delivery: {
    available: boolean;
    provider_status: "NOT_CONFIGURED" | "STAGING_ONLY" | "ACTIVE" | "PAUSED";
  };
};

export type CustomerRestaurantContext = {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string;
  membership_exists: boolean;
  legal_ready: boolean;
  token_valid?: boolean;
};

function requireClient() {
  if (!supabase) throw new Error("Dein Gästeportal ist gerade nicht verfügbar.");
  return supabase;
}

export async function loadCustomerAccount(): Promise<CustomerAccount | null> {
  const { data, error } = await requireClient().rpc("get_customer_account");
  if (error) {
    throw new Error("Dein Gästeportal konnte gerade nicht geladen werden.");
  }
  return data as CustomerAccount;
}

export async function openCustomerMembership(restaurantId: string) {
  const { data, error } = await requireClient().rpc("open_customer_account_membership", {
    input_restaurant_id: restaurantId,
  });
  if (error) {
    if (error.message.includes("CUSTOMER_MEMBERSHIP_INACTIVE")) {
      throw new Error("Diese Mitgliedschaft ist derzeit nicht aktiv.");
    }
    throw new Error("Das Bonuskonto konnte gerade nicht geöffnet werden.");
  }
  const result = data as { restaurant_slug: string };
  return result.restaurant_slug;
}

export async function openCustomerAccountMembership(membership: CustomerAccountMembership) {
  const slug = await openCustomerMembership(membership.restaurant_id);
  const { error } = await requireClient().rpc("set_customer_portal_context", {
    input_restaurant_slug: slug,
    input_request_id: crypto.randomUUID(),
    input_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new Error("Der Restaurantwechsel konnte gerade nicht abgeschlossen werden.");
  return slug;
}

export async function recordCustomerLoginSuccess(returnTo: string) {
  const match = returnTo.match(/^\/(?:customer|w)\/([^/?#]+)/);
  const { error } = await requireClient().rpc("record_customer_login_success", {
    input_restaurant_slug: match ? decodeURIComponent(match[1]) : null,
  });
  if (error) throw new Error("Die Anmeldung konnte nicht sicher protokolliert werden.");
}

export async function loadCustomerRestaurantContext(restaurantSlug: string) {
  const { data, error } = await requireClient().rpc("get_customer_restaurant_context", {
    input_restaurant_slug: restaurantSlug,
  });
  if (error) throw new Error("Dieses Restaurant konnte gerade nicht geöffnet werden.");
  return data as CustomerRestaurantContext;
}

export async function loadCustomerRestaurantAccess(restaurantSlug: string) {
  const { data, error } = await requireClient().rpc("get_customer_restaurant_access", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: readStoredCustomerToken(restaurantSlug),
  });
  if (error) throw new Error("Dieses Restaurant konnte gerade nicht geöffnet werden.");
  return data as CustomerRestaurantContext;
}

export async function recoverCustomerMembershipToken(restaurantSlug: string) {
  const { data, error } = await requireClient().rpc("recover_customer_membership_token", {
    input_restaurant_slug: restaurantSlug,
    input_request_id: crypto.randomUUID(),
    input_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    if (error.message.includes("RECENT_CUSTOMER_AUTH_REQUIRED") || error.message.includes("CUSTOMER_RECOVERY_REAUTH_REQUIRED")) {
      throw new Error("Bitte melde dich erneut an, bevor du deinen Zugang wiederherstellst.");
    }
    throw new Error("Der Zugang konnte nicht wiederhergestellt werden.");
  }
  const result = data as { restaurant_slug: string; customer_token: string };
  if (result.restaurant_slug !== restaurantSlug || !result.customer_token) {
    throw new Error("Der Zugang konnte nicht wiederhergestellt werden.");
  }
  saveStoredCustomerToken(result.restaurant_slug, { customer_token: result.customer_token, device_id: null });
  return result.restaurant_slug;
}

export async function joinCustomerRestaurant(input: {
  restaurantSlug: string;
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
  deviceId: string;
  existingCustomerToken?: string | null;
}) {
  const join = (existingCustomerToken: string | null) => requireClient().rpc("join_customer_account_restaurant", {
    input_restaurant_slug: input.restaurantSlug,
    input_terms_accepted: input.termsAccepted,
    input_privacy_acknowledged: input.privacyAcknowledged,
    input_device_id: input.deviceId,
    input_existing_customer_token: existingCustomerToken,
  });

  let { data, error } = await join(input.existingCustomerToken ?? null);
  const staleAccess = Boolean(input.existingCustomerToken) && Boolean(error) && [
    "CUSTOMER_ACCESS_TOKEN_INVALID",
    "CUSTOMER_MEMBERSHIP_ALREADY_LINKED",
  ].some((reason) => error?.message.includes(reason));

  if (staleAccess) {
    removeStoredCustomerToken(input.restaurantSlug);
    ({ data, error } = await join(null));
  }

  if (error) {
    if (error.message.includes("CUSTOMER_ACCOUNT_RECOVERY_REQUIRED")) {
      throw new Error("Für diese Telefonnummer besteht bereits eine Mitgliedschaft. Bitte wende dich an den Support, um sie sicher zu verbinden.");
    }
    if (error.message.includes("CUSTOMER_LEGAL_NOT_READY")) {
      throw new Error("Dieses Bonusprogramm ist noch nicht für neue Mitglieder freigegeben.");
    }
    throw new Error("Der Beitritt konnte gerade nicht abgeschlossen werden.");
  }
  const result = data as { joined: boolean; restaurant_slug: string; customer_token: string | null };
  if (result.customer_token) saveStoredCustomerToken(result.restaurant_slug, {
    customer_token: result.customer_token, device_id: input.deviceId,
  });
  return result;
}

export async function joinCustomerReferral(input: {
  restaurantSlug: string;
  referralToken: string;
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
  deviceId: string;
}) {
  const { data, error } = await requireClient().rpc("join_authenticated_customer_referral", {
    input_restaurant_slug: input.restaurantSlug,
    input_referral_token: input.referralToken,
    input_terms_accepted: input.termsAccepted,
    input_privacy_acknowledged: input.privacyAcknowledged,
    input_device_id: input.deviceId,
  });
  if (error) {
    if (error.message.includes("REFERRAL_CUSTOMER_NOT_NEW")) {
      throw new Error("Diese Einladung gilt nur für neue Mitglieder dieses Restaurants.");
    }
    if (error.message.includes("CUSTOMER_LEGAL_NOT_READY")) {
      throw new Error("Dieses Bonusprogramm ist noch nicht für neue Mitglieder freigegeben.");
    }
    if (error.message.includes("REFERRAL_INVALID")) {
      throw new Error("Diese Einladung ist ungültig oder nicht mehr verfügbar.");
    }
    if (error.message.includes("CUSTOMER_ACCOUNT_RECOVERY_REQUIRED")) {
      throw new Error("Für deine Telefonnummer besteht bereits eine Mitgliedschaft. Bitte wende dich an den Support, um sie sicher zu verbinden.");
    }
    throw new Error("Die Einladung konnte gerade nicht angenommen werden.");
  }
  const result = data as {
    restaurant_slug: string;
    customer_token: string | null;
    referral_status: "pending_registered" | "activated";
    welcome_gift_assigned: boolean;
  };
  if (result.customer_token) saveStoredCustomerToken(result.restaurant_slug, {
    customer_token: result.customer_token, device_id: input.deviceId,
  });
  return result;
}

export async function pauseAllCustomerOfferEmails(paused: boolean) {
  const { error } = await requireClient().rpc("pause_all_customer_offer_emails", {
    input_paused: paused,
  });
  if (error) throw new Error("Die E-Mail-Einstellung konnte gerade nicht gespeichert werden.");
}
