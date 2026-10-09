import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import nodemailer from "npm:nodemailer@6.9.16";
import { configuredAppOrigin } from "../_shared/appOrigin.mjs";
import { runOfferEmailConfirmationDelivery } from "../_shared/offerEmailConfirmationDelivery.mjs";

// Dedicated confirmation-link worker. It never touches the transactional,
// birthday, reward, capacity or periodic offer-email queues.
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const schedulerSecret = Deno.env.get("OFFER_EMAIL_CONFIRMATION_SCHEDULER_SECRET") ?? "";
const mode = Deno.env.get("OFFER_EMAIL_CONFIRMATION_MODE") ?? "paused";
const appOrigin = configuredAppOrigin(Deno.env.get("APP_BASE_URL"));
const smtpHost = Deno.env.get("SMTP_HOST") ?? "";
const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "587");
const smtpUsername = Deno.env.get("SMTP_USERNAME") ?? "";
const smtpPassword = Deno.env.get("SMTP_PASSWORD") ?? "";
const smtpFromEmail = Deno.env.get("SMTP_FROM_EMAIL") ?? "";
const smtpFromName = Deno.env.get("SMTP_FROM_NAME") ?? "WUXUAI® Bonus";
const smtpReplyTo = Deno.env.get("SMTP_REPLY_TO") ?? "";

type Claim = {
  claimed: true;
  request_id: string;
  claim_id: string;
  token: string;
  email: string;
  expires_at: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // Server configuration is checked before any queue claim or SMTP connection.
  if (mode !== "enabled") return json({ error: "confirmation_delivery_paused" }, 503);
  if (!supabaseUrl || !serviceKey || !schedulerSecret || !appOrigin
    || !smtpHost || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535
    || !smtpUsername || !smtpPassword || !smtpFromEmail || !smtpReplyTo) {
    return json({ error: "confirmation_delivery_not_configured" }, 503);
  }
  if (!await secureEqual(
    request.headers.get("x-wuxuai-offer-confirmation-secret") ?? "", schedulerSecret,
  )) return json({ error: "not_authorized" }, 401);

  const service = createClient(supabaseUrl, serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort, secure: smtpPort === 465,
    requireTLS: smtpPort !== 465,
    auth: { user: smtpUsername, pass: smtpPassword },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });
  const messageIdDomain = smtpFromEmail.split("@")[1] || "wuxuaisbi.com";
  try {
    const outcome = await runOfferEmailConfirmationDelivery({
      claim: async () => {
        const { data, error } = await service.rpc(
          "claim_customer_offer_email_confirmation_delivery");
        if (error) throw error;
        return data as Claim | { claimed?: false } | null;
      },
      prepare: (delivery: Claim) => {
        // The link token lives only in this invocation's memory.
        const link = new URL("/customer/email/confirm", appOrigin);
        link.searchParams.set("code", delivery.token);
        return {
          from: { name: smtpFromName, address: smtpFromEmail },
          replyTo: smtpReplyTo,
          to: delivery.email,
          subject: "Angebots-E-Mails: Bitte bestätige deine Entscheidung",
          text: `Bitte bestätige deine Entscheidung über diesen einmaligen Link:\n\n${link.toString()}\n\nFalls du dies nicht angefordert hast, ignoriere diese Nachricht.`,
          messageId: `<wuxuai-offer-confirm-${delivery.request_id}@${messageIdDomain}>`,
        };
      },
      begin: async (delivery: Claim) => {
        const { data, error } = await service.rpc(
          "begin_customer_offer_email_confirmation_delivery", {
            input_request_id: delivery.request_id,
            input_claim_id: delivery.claim_id,
            input_token: delivery.token,
          });
        return !error && data?.authorized === true;
      },
      // No other async work intervenes between the final DB recheck and
      // this dedicated provider call. General queues are never consulted.
      deliver: async (message: Record<string, unknown>, delivery: Claim) => {
        const result = await transporter.sendMail(message);
        return Array.isArray(result.accepted)
          && result.accepted.some((value) => String(value).toLowerCase() === delivery.email.toLowerCase());
      },
      complete: async (delivery: Claim, accepted: boolean) => {
        const { data, error } = await service.rpc(
          "complete_customer_offer_email_confirmation_delivery", {
            input_request_id: delivery.request_id,
            input_claim_id: delivery.claim_id,
            input_accepted: accepted,
            input_provider_message_id: accepted
              ? `<wuxuai-offer-confirm-${delivery.request_id}@${messageIdDomain}>` : null,
          });
        return !error && data === true;
      },
    });
    return json(outcome, outcome.uncertain ? 502 : 200);
  } catch {
    return json({ error: "claim_or_prepare_failed" }, 500);
  }
});
