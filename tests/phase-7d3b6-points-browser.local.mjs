import { createClient } from "@supabase/supabase-js";

export async function runPointsFlow(input) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url !== "http://127.0.0.1:56221") throw new Error("NONLOCAL_URL");
  const client = () => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const owner = client();
  const staff = client();
  const customer = client();
  for (const [role, target] of [["owner", owner], ["staff", staff], ["customer", customer]]) {
    const credential = input.credentials[role];
    const login = await target.auth.signInWithPassword(credential);
    if (login.error || !login.data.session) throw new Error(`${role.toUpperCase()}_LOGIN_FAILED`);
  }
  const opened = await customer.rpc("open_customer_account_membership", {
    input_restaurant_id: input.restaurantId,
  });
  if (opened.error || !opened.data?.customer_token) throw new Error("MEMBERSHIP_OPEN_FAILED");
  const dailyPin = await owner.rpc("get_today_restaurant_pin", {
    input_restaurant_id: input.restaurantId,
  });
  if (dailyPin.error || !/^\d{4}$/.test(dailyPin.data?.pin_code ?? ""))
    throw new Error("OWNER_DAILY_PIN_FAILED");
  for (const amountCents of [1000, 9000]) {
    const qr = await customer.rpc("create_customer_points_credit_qr", {
      input_restaurant_slug: input.slug, input_customer_token: opened.data.customer_token,
    });
    if (qr.error || !qr.data?.qr_token) throw new Error("CUSTOMER_QR_FAILED");
    const preview = await staff.rpc("preview_restaurant_controlled_points", {
      input_restaurant_id: input.restaurantId, input_qr_reference: qr.data.qr_token,
      input_amount_cents: amountCents,
    });
    if (preview.error) throw new Error(`STAFF_PREVIEW_FAILED:${preview.error.code}`);
    const collected = await staff.rpc("confirm_restaurant_controlled_points", {
      input_restaurant_id: input.restaurantId, input_qr_reference: qr.data.qr_token,
      input_amount_cents: amountCents, input_daily_pin: dailyPin.data.pin_code,
      input_idempotency_key: crypto.randomUUID(),
    });
    if (collected.error) throw new Error(`POINTS_COLLECT_FAILED:${collected.error.code}`);
  }
  if (input.redeemPoints === false) return { collected: true };
  const started = await customer.functions.invoke("redemption-confirmation", { body: {
    action: "start", restaurant_slug: input.slug, source_type: "points",
    entitlement_id: input.rewardId, request_id: crypto.randomUUID(),
    correlation_id: crypto.randomUUID(), idempotency_key: crypto.randomUUID(),
  } });
  if (started.error || started.data?.status !== "REQUESTED") {
    let code = null;
    try { code = (await started.error?.context?.clone().json())?.error_code; } catch { /* no payload */ }
    return { collected: true, requested: false, blockCode: code ?? "UNKNOWN" };
  }
  const confirmed = await staff.functions.invoke("redemption-confirmation", { body: {
    action: "approve", redemption_id: started.data.redemption_id,
    correlation_id: started.data.correlation_id,
    request_id: crypto.randomUUID(), idempotency_key: crypto.randomUUID(),
  } });
  if (confirmed.error || confirmed.data?.status !== "REDEEMED") throw new Error("POINTS_APPROVE_FAILED");
  return { collected: true, requested: true, redeemed: true };
}
