import { isPublicReferralPath } from "../auth/authRoutePolicy.mjs";

export function safeCustomerReturnPath(value) {
  const containsControlCharacter = value
    ? Array.from(value).some((character) => character.charCodeAt(0) <= 31)
    : false;
  if (!value || value.startsWith("//") || value.includes("\\") || containsControlCharacter) return "/customer";
  const isCustomerPath = value === "/customer" || value.startsWith("/customer/") || value.startsWith("/customer?");
  const isCollectPath = /^\/w\/[^/?#]+(?:[?#].*)?$/.test(value);
  const isReferralPath = isPublicReferralPath(value);
  return isCustomerPath || isCollectPath || isReferralPath ? value : "/customer";
}
