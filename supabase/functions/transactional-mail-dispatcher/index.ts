import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import nodemailer from "npm:nodemailer@6.9.16";
import { configuredAppOrigin } from "../_shared/appOrigin.mjs";
import {
  renderOwnerCapacityWarningMail,
  renderSyntheticCapacityTestMail,
  renderTransactionalMail,
  resolveTransactionalMailLanguage,
} from "../_shared/transactionalMailTemplates.mjs";

type ReservedDelivery = {
  queue_kind: "customer" | "capacity" | "synthetic_capacity";
  delivery_id: string;
  event_type: string;
  email: string;
  restaurant_name: string;
  restaurant_slug: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
  sender_email?: string;
  reply_to_email?: string;
  request_id?: string;
  correlation_id?: string;
  environment?: "staging";
  synthetic_test?: true;
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
const smtpFromName = Deno.env.get("SMTP_FROM_NAME") ?? "WUXUAI® Bonus";
const smtpReplyTo = Deno.env.get("SMTP_REPLY_TO") ?? "";
const transportMode = Deno.env.get("TRANSACTIONAL_MAIL_MODE") ?? "general";
const stagingTestRecipient = Deno.env.get("STAGING_TEST_RECIPIENT") ?? "";
const STAGING_TEST_SENDER = "notifications@wuxuaibonus.com";
const STAGING_TEST_REPLY_TO = "support@wuxuaibonus.com";

type SyntheticTestRequest = {
  mode: "synthetic_capacity_test" | "scheduled_synthetic_capacity_test";
  message_type: "synthetic_capacity";
  request_id: string;
  correlation_id: string;
  environment: "staging";
  synthetic_test: true;
  recipient: string;
  scheduler_token?: string;
};

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

function safeFirstName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return normalized || null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseSyntheticTestRequest(value: unknown): SyntheticTestRequest | null {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if ((body.mode !== "synthetic_capacity_test" && body.mode !== "scheduled_synthetic_capacity_test")
    || body.message_type !== "synthetic_capacity"
    || body.environment !== "staging" || body.synthetic_test !== true) return null;
  if (!isUuid(body.request_id) || !isUuid(body.correlation_id)) return null;
  if (typeof body.recipient !== "string" || body.recipient.trim().toLowerCase() !== stagingTestRecipient) return null;
  if (body.mode === "scheduled_synthetic_capacity_test"
    && (typeof body.scheduler_token !== "string" || !/^[0-9a-f]{64}$/.test(body.scheduler_token))) return null;
  return {
    mode: body.mode,
    message_type: "synthetic_capacity",
    request_id: body.request_id,
    correlation_id: body.correlation_id,
    environment: "staging",
    synthetic_test: true,
    recipient: body.recipient.trim().toLowerCase(),
    scheduler_token: body.mode === "scheduled_synthetic_capacity_test" ? body.scheduler_token as string : undefined,
  };
}

async function resolveRecipientContext(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  const { data: accounts, error } = await adminClient
    .from("customer_accounts")
    .select("auth_user_id, first_name")
    .eq("email", email)
    .is("disabled_at", null)
    .limit(2);
  if (error || accounts?.length !== 1) return { firstName: null, language: null };

  const account = accounts[0];
  let metadata: Record<string, unknown> = {};
  if (account.auth_user_id) {
    const { data } = await adminClient.auth.admin.getUserById(account.auth_user_id);
    metadata = data.user?.user_metadata ?? {};
  }
  const fullName = safeFirstName(metadata.full_name)?.split(" ")[0] ?? null;
  const languageCandidates = [
    metadata.preferred_language,
    metadata.account_language,
    metadata.app_language,
    metadata.browser_language,
  ];
  return {
    firstName: safeFirstName(account.first_name)
      ?? safeFirstName(metadata.customer_first_name)
      ?? safeFirstName(metadata.staff_first_name)
      ?? fullName,
    language: languageCandidates.some((candidate) => typeof candidate === "string" && candidate.trim())
      ? resolveTransactionalMailLanguage({
        preferredLanguage: metadata.preferred_language,
        accountLanguage: metadata.account_language,
        appLanguage: metadata.app_language,
        browserLanguage: metadata.browser_language,
      })
      : null,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const configured = supabaseUrl && serviceRoleKey && schedulerSecret && appBaseUrl
    && smtpHost && Number.isInteger(smtpPort) && smtpPort > 0 && smtpPort <= 65_535
    && smtpUsername && smtpPassword && smtpFromEmail && smtpReplyTo;
  if (!configured) return json({ error: "transactional_mail_not_configured" }, 503);
  let parsedBody: unknown = {};
  try {
    parsedBody = await request.json();
  } catch {
    // An empty scheduler request is valid.
  }
  const syntheticRequest = parseSyntheticTestRequest(parsedBody);
  const scheduledSyntheticRequest = syntheticRequest?.mode === "scheduled_synthetic_capacity_test";
  if (!scheduledSyntheticRequest
    && !await secureEqual(request.headers.get("x-wuxuai-scheduler-secret") ?? "", schedulerSecret)) {
    return json({ error: "not_authorized" }, 401);
  }
  if (transportMode === "staging_synthetic_only" && !syntheticRequest) {
    return json({ error: "staging_synthetic_contract_required" }, 403);
  }
  if (syntheticRequest && transportMode !== "staging_synthetic_only") {
    return json({ error: "synthetic_test_mode_not_enabled" }, 403);
  }
  if (transportMode === "staging_synthetic_only") {
    if (stagingTestRecipient !== "office@wuxuaisbi.com"
      || smtpFromEmail.toLowerCase() !== STAGING_TEST_SENDER
      || smtpReplyTo.toLowerCase() !== STAGING_TEST_REPLY_TO) {
      return json({ error: "staging_mail_contract_not_configured" }, 503);
    }
  }
  const requestedLimit = Number.isInteger((parsedBody as { limit?: unknown }).limit)
    ? Number((parsedBody as { limit?: unknown }).limit)
    : 25;
  const limit = Math.min(Math.max(requestedLimit, 1), 50);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (scheduledSyntheticRequest) {
    const { data: authorized, error: authorizationError } = await supabase.rpc(
      "authorize_capacity_warning_synthetic_scheduler_test",
      {
        input_request_id: syntheticRequest.request_id,
        input_correlation_id: syntheticRequest.correlation_id,
        input_scheduler_token: syntheticRequest.scheduler_token,
      },
    );
    if (authorizationError || authorized !== true) return json({ error: "not_authorized" }, 401);
  }
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

  if (syntheticRequest) {
    if (!scheduledSyntheticRequest) {
      const { error: enqueueError } = await supabase.rpc("enqueue_capacity_warning_synthetic_email_test", {
        input_request_id: syntheticRequest.request_id,
        input_correlation_id: syntheticRequest.correlation_id,
        input_environment: syntheticRequest.environment,
        input_synthetic_test: syntheticRequest.synthetic_test,
        input_recipient_email: syntheticRequest.recipient,
        input_sender_email: smtpFromEmail,
        input_reply_to_email: smtpReplyTo,
      });
      if (enqueueError) return json({ error: "synthetic_test_enqueue_failed" }, 409);
    }
    const { data, error } = await supabase.rpc("reserve_capacity_warning_synthetic_email_test", {
      input_request_id: syntheticRequest.request_id,
      input_correlation_id: syntheticRequest.correlation_id,
    });
    if (error) return json({ error: "synthetic_test_reservation_failed" }, 500);
    const deliveries = (data ?? []).map((delivery: Omit<ReservedDelivery, "queue_kind">) => ({
      ...delivery,
      queue_kind: "synthetic_capacity" as const,
      environment: syntheticRequest.environment,
      synthetic_test: syntheticRequest.synthetic_test,
    }));
    return await deliver(supabase, transporter, deliveries);
  }

  const { data: customerData, error: reserveError } = await supabase.rpc("reserve_customer_transactional_emails", { input_limit: limit });
  if (reserveError) {
    logDelivery("error", "transactional_mail_reserve_failed", undefined, safeErrorCode(reserveError));
    return json({ error: "queue_reservation_failed" }, 500);
  }

  const customerDeliveries = (customerData ?? []).map((delivery: Omit<ReservedDelivery, "queue_kind">) => ({
    ...delivery,
    queue_kind: "customer" as const,
  }));
  const remainingLimit = limit - customerDeliveries.length;
  let capacityDeliveries: ReservedDelivery[] = [];
  if (remainingLimit > 0) {
    const { data: capacityData, error: capacityReserveError } = await supabase.rpc("reserve_capacity_warning_emails", {
      input_limit: remainingLimit,
    });
    if (capacityReserveError) {
      logDelivery("error", "capacity_warning_mail_reserve_failed", undefined, safeErrorCode(capacityReserveError));
    } else {
      capacityDeliveries = (capacityData ?? []).map((delivery: Omit<ReservedDelivery, "queue_kind">) => ({
        ...delivery,
        queue_kind: "capacity" as const,
      }));
    }
  }
  const deliveries = [...customerDeliveries, ...capacityDeliveries].slice(0, limit) as ReservedDelivery[];
  return await deliver(supabase, transporter, deliveries);
});

async function deliver(
  supabase: ReturnType<typeof createClient>,
  transporter: ReturnType<typeof nodemailer.createTransport>,
  deliveries: ReservedDelivery[],
) {
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    try {
      const recipient = delivery.queue_kind === "customer"
        ? await resolveRecipientContext(supabase, delivery.email)
        : { firstName: null, language: String(delivery.payload?.language ?? "de") };
      const mail = delivery.queue_kind === "synthetic_capacity"
        ? renderSyntheticCapacityTestMail({
          environment: delivery.environment,
          syntheticTest: delivery.synthetic_test,
          requestId: delivery.request_id,
          correlationId: delivery.correlation_id,
        })
        : delivery.queue_kind === "capacity"
        ? renderOwnerCapacityWarningMail({
          restaurantName: delivery.restaurant_name,
          payload: delivery.payload ?? {},
          appBaseUrl,
          language: recipient.language,
        })
        : renderTransactionalMail({
          templateKey: delivery.event_type,
          restaurantName: delivery.restaurant_name,
          restaurantSlug: delivery.restaurant_slug,
          payload: delivery.payload ?? {},
          appBaseUrl,
          language: recipient.language,
          firstName: recipient.firstName,
        });
      const fromEmail = delivery.sender_email ?? smtpFromEmail;
      const replyToEmail = delivery.reply_to_email ?? smtpReplyTo;
      const messageIdDomain = fromEmail.split("@")[1] || "wuxuaisbi.com";
      const result = await transporter.sendMail({
        from: { name: smtpFromName, address: fromEmail },
        replyTo: replyToEmail,
        to: delivery.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: `<wuxuai-${delivery.delivery_id}@${messageIdDomain}>`,
      });
      const completionRpc = delivery.queue_kind === "synthetic_capacity"
        ? "complete_capacity_warning_synthetic_email_test"
        : delivery.queue_kind === "capacity"
        ? "complete_capacity_warning_email"
        : "complete_customer_transactional_email";
      const completionPayload = delivery.queue_kind === "synthetic_capacity"
        ? {
          input_delivery_id: delivery.delivery_id,
          input_request_id: delivery.request_id,
          input_correlation_id: delivery.correlation_id,
          input_success: true,
          input_provider_message_id: result.messageId,
          input_error_code: null,
        }
        : { input_delivery_id: delivery.delivery_id, input_success: true, input_provider_message_id: result.messageId, input_error_code: null };
      const { error: completionError } = await supabase.rpc(completionRpc, completionPayload);
      if (completionError) throw Object.assign(new Error("DELIVERY_COMPLETION_FAILED"), { code: "DELIVERY_COMPLETION_FAILED" });
      sent += 1;
      logDelivery("info", "transactional_mail_sent", delivery);
    } catch (sendError) {
      const errorCode = safeErrorCode(sendError);
      const completionRpc = delivery.queue_kind === "synthetic_capacity"
        ? "complete_capacity_warning_synthetic_email_test"
        : delivery.queue_kind === "capacity"
        ? "complete_capacity_warning_email"
        : "complete_customer_transactional_email";
      const completionPayload = delivery.queue_kind === "synthetic_capacity"
        ? {
          input_delivery_id: delivery.delivery_id,
          input_request_id: delivery.request_id,
          input_correlation_id: delivery.correlation_id,
          input_success: false,
          input_provider_message_id: null,
          input_error_code: errorCode,
        }
        : { input_delivery_id: delivery.delivery_id, input_success: false, input_provider_message_id: null, input_error_code: errorCode };
      const { error: completionError } = await supabase.rpc(completionRpc, completionPayload);
      failed += 1;
      logDelivery("error", completionError ? "transactional_mail_failure_state_failed" : "transactional_mail_failed", delivery, errorCode);
    }
  }

  return json({ processed: deliveries.length, sent, failed, provider_accepted: sent === 1 && failed === 0 });
}
