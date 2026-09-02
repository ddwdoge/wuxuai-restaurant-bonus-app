import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import nodemailer from "npm:nodemailer@6.9.16";
import { renderTransactionalMail } from "../_shared/transactionalMailTemplates.mjs";
import { configuredAppOrigin } from "../_shared/appOrigin.mjs";

type ReservedDelivery = {
  delivery_id: string;
  event_type: string;
  email: string;
  restaurant_name: string;
  restaurant_slug: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const schedulerSecret = Deno.env.get("TRANSACTIONAL_MAIL_SCHEDULER_SECRET") ?? "";
const appBaseUrl = configuredAppOrigin(Deno.env.get("APP_BASE_URL")) ?? "";
const smtpHost = Deno.env.get("SMTP_HOST") ?? "";
const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "587");
const smtpUsername = Deno.env.get("SMTP_USERNAME") ?? "";
const smtpPassword = Deno.env.get("SMTP_PASSWORD") ?? "";
const smtpFromEmail = Deno.env.get("SMTP_FROM_EMAIL") ?? "";
const smtpFromName = Deno.env.get("SMTP_FROM_NAME") ?? "WUXU Group Support";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function safeErrorCode(error: unknown) {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const candidate = String(source.code ?? source.name ?? "DELIVERY_FAILED").toUpperCase();
  return candidate.replace(/[^A-Z0-9_-]/g, "_").slice(0, 120) || "DELIVERY_FAILED";
}

function logDelivery(level: "info" | "error", event: string, delivery?: ReservedDelivery, detail?: string) {
  const output = {
    event,
    delivery_ref: delivery?.delivery_id.slice(0, 8) ?? null,
    template_key: delivery?.event_type ?? null,
    attempt: delivery?.attempt_count ?? null,
    detail: detail ?? null,
  };
  console[level](JSON.stringify(output));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const configured = supabaseUrl && serviceRoleKey && schedulerSecret && appBaseUrl
    && smtpHost && Number.isInteger(smtpPort) && smtpPort > 0 && smtpPort <= 65_535
    && smtpUsername && smtpPassword && smtpFromEmail;
  if (!configured) return json({ error: "transactional_mail_not_configured" }, 503);
  if (!await secureEqual(request.headers.get("x-wuxuai-scheduler-secret") ?? "", schedulerSecret)) {
    return json({ error: "not_authorized" }, 401);
  }

  let requestedLimit = 25;
  try {
    const body = await request.json() as { limit?: unknown };
    if (Number.isInteger(body.limit)) requestedLimit = Number(body.limit);
  } catch {
    // An empty scheduler request is valid.
  }
  const limit = Math.min(Math.max(requestedLimit, 1), 50);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort !== 465,
    auth: { user: smtpUsername, pass: smtpPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });

  const { data, error: reserveError } = await supabase.rpc("reserve_customer_transactional_emails", {
    input_limit: limit,
  });
  if (reserveError) {
    logDelivery("error", "transactional_mail_reserve_failed", undefined, safeErrorCode(reserveError));
    return json({ error: "queue_reservation_failed" }, 500);
  }

  const deliveries = (data ?? []) as ReservedDelivery[];
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    try {
      const mail = renderTransactionalMail({
        templateKey: delivery.event_type,
        restaurantName: delivery.restaurant_name,
        restaurantSlug: delivery.restaurant_slug,
        payload: delivery.payload ?? {},
        appBaseUrl,
      });
      const messageIdDomain = smtpFromEmail.split("@")[1] || "wuxuaisbi.com";
      const result = await transporter.sendMail({
        from: { name: smtpFromName, address: smtpFromEmail },
        to: delivery.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: `<wuxuai-${delivery.delivery_id}@${messageIdDomain}>`,
      });
      const { error: completionError } = await supabase.rpc("complete_customer_transactional_email", {
        input_delivery_id: delivery.delivery_id,
        input_success: true,
        input_provider_message_id: result.messageId,
        input_error_code: null,
      });
      if (completionError) throw Object.assign(new Error("DELIVERY_COMPLETION_FAILED"), { code: "DELIVERY_COMPLETION_FAILED" });
      sent += 1;
      logDelivery("info", "transactional_mail_sent", delivery);
    } catch (sendError) {
      const errorCode = safeErrorCode(sendError);
      const { error: completionError } = await supabase.rpc("complete_customer_transactional_email", {
        input_delivery_id: delivery.delivery_id,
        input_success: false,
        input_provider_message_id: null,
        input_error_code: errorCode,
      });
      failed += 1;
      logDelivery("error", completionError ? "transactional_mail_failure_state_failed" : "transactional_mail_failed", delivery, errorCode);
    }
  }

  return json({ processed: deliveries.length, sent, failed });
});
